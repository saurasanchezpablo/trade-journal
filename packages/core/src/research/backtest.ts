/**
 * Strategy research: a daily, multi-instrument backtest that cannot look ahead. A strategy
 * sees only the bars up to day t (it is handed a view that ends there) and returns target
 * weights; they are executed at the open of day t + 1, and held until the next execution.
 *
 * Accounting, per day (open to open):
 * - each instrument's return on the capital it holds (`weight × (open[t+1] / open[t] − 1)`);
 * - perpetual futures pay or receive funding at every funding time inside the day, on the
 *   position held then (a long pays a positive rate, a short receives it);
 * - every trade pays commission and slippage on the traded notional, at that instrument's
 *   rates (spot and perpetuals differ). Positions drift with prices between decisions, so
 *   holding a constant weight still trades: the cost is on |target − drifted weight|;
 * - uninvested capital (1 − Σ|weight|, floored at 0) earns the cash rate, which is also the
 *   hurdle every Sharpe ratio is measured against.
 * Weights are fractions of equity; a long-short or hedged book can exceed 1 in gross terms
 * only up to `maxGross`.
 *
 * Deterministic: the same bars, funding, strategy and costs always give the same result.
 */

export const RESEARCH_ENGINE_VERSION = "research-engine-1";
/** Crypto trades every day: returns are annualized over 365 days. */
export const DAYS_PER_YEAR = 365;
const DAY = 86_400_000;

export interface DailyBar {
  /** UTC midnight of the day, epoch ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundingEvent {
  time: number;
  /** The rate for one funding period, as a fraction (0.0001 = 0.01%). */
  rate: number;
}

export type InstrumentKind = "spot" | "perp";

export interface Instrument {
  id: string;
  kind: InstrumentKind;
  bars: DailyBar[];
  /** Perpetuals only. */
  funding?: FundingEvent[];
}

export interface CostModel {
  /** Commission per traded notional, basis points, by instrument kind. */
  feeBps: Record<InstrumentKind, number>;
  /** Spread and slippage per traded notional, basis points, by instrument kind. */
  slippageBps: Record<InstrumentKind, number>;
  /**
   * Annual return on uninvested cash, and the risk-free hurdle of the Sharpe ratios. The
   * default 3% is an assumption (roughly the average 3-month US Treasury bill yield over
   * 2019-2025), not a measured series; it is a setting.
   */
  cashRate: number;
}

export const DEFAULT_COSTS: CostModel = {
  feeBps: { spot: 10, perp: 5 },
  slippageBps: { spot: 5, perp: 5 },
  cashRate: 0.03,
};

/** What a strategy sees on day t: every instrument's bars up to and including t. */
export interface StrategyView {
  /** Index of day t in the aligned calendar. */
  index: number;
  time: number;
  bars: Record<string, readonly DailyBar[]>;
  /** Funding events up to the close of day t. */
  funding: Record<string, readonly FundingEvent[]>;
  /** The weights currently held (decided on an earlier day). */
  current: Readonly<Record<string, number>>;
}

export interface StrategyDecision {
  weights: Record<string, number>;
  /** Why, in words, for the signal log (inputs and the rule that fired). */
  reason?: string;
  inputs?: Record<string, number | string | null>;
}

export type StrategyFn = (view: StrategyView) => StrategyDecision;

export interface BacktestOptions {
  costs?: CostModel;
  /** Days of history a strategy needs before its first decision. */
  warmup?: number;
  /** First and last day to trade (epoch ms, inclusive); defaults to the whole aligned range. */
  from?: number;
  to?: number;
  /** Cap on Σ|weight|. */
  maxGross?: number;
  initialEquity?: number;
}

export interface DailyRecord {
  time: number;
  equity: number;
  /** The day's return, net of everything. */
  ret: number;
  gross: number;
  fees: number;
  slippage: number;
  funding: number;
  cash: number;
  weights: Record<string, number>;
  /** Σ|target − drifted weight| traded at this day's open. */
  turnover: number;
}

export interface BacktestResult {
  engineVersion: string;
  days: DailyRecord[];
  decisions: { time: number; weights: Record<string, number>; reason?: string }[];
  costs: CostModel;
}

/** The days every instrument has a bar for, in order. */
export function alignedCalendar(instruments: readonly Instrument[]): number[] {
  if (!instruments.length) return [];
  const sets = instruments.map((i) => new Set(i.bars.map((b) => b.time)));
  return [...sets[0]!].filter((t) => sets.every((s) => s.has(t))).sort((a, b) => a - b);
}

/** How many of a sorted list's events are at or before `time` (binary search). */
const upTo = (list: readonly FundingEvent[], time: number) => {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const clampGross = (weights: Record<string, number>, maxGross: number) => {
  const gross = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0);
  if (gross <= maxGross || gross === 0) return weights;
  const k = maxGross / gross;
  return Object.fromEntries(Object.entries(weights).map(([id, w]) => [id, w * k]));
};

/**
 * Run a strategy. Day t's decision is executed at the open of day t + 1; the return of day
 * t + 1 runs from its open to the open of day t + 2 (so the last day with a next open is the
 * last one accounted).
 */
export function runBacktest(
  instruments: readonly Instrument[],
  strategy: StrategyFn,
  options: BacktestOptions = {},
): BacktestResult {
  const costs = options.costs ?? DEFAULT_COSTS;
  const maxGross = options.maxGross ?? 1;
  const warmup = options.warmup ?? 0;
  const calendar = alignedCalendar(instruments);
  const byTime = instruments.map((i) => new Map(i.bars.map((b) => [b.time, b])));
  const ids = instruments.map((i) => i.id);
  // Per instrument: bars on the calendar, in order (indexes line up with `calendar`).
  const series = byTime.map((m) => calendar.map((t) => m.get(t)!));
  const funding = instruments.map((i) => [...(i.funding ?? [])].sort((a, b) => a.time - b.time));

  let equity = options.initialEquity ?? 1;
  let held: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const days: DailyRecord[] = [];
  const decisions: BacktestResult["decisions"] = [];
  // Decision days: from the warmup (and `from`) to `to`, leaving two opens to account the last.
  let start = Math.max(warmup, 0);
  while (start < calendar.length && options.from !== undefined && calendar[start]! < options.from)
    start++;
  let end = calendar.length - 3;
  while (end >= start && options.to !== undefined && calendar[end]! > options.to) end--;

  for (let t = start; t <= end; t++) {
    const time = calendar[t]!;
    // Decide at the close of day t (the next day's open), with nothing after it.
    const close = time + DAY;
    const view: StrategyView = {
      index: t,
      time,
      bars: Object.fromEntries(ids.map((id, k) => [id, series[k]!.slice(0, t + 1)])),
      funding: Object.fromEntries(
        ids.map((id, k) => [id, funding[k]!.slice(0, upTo(funding[k]!, close))]),
      ),
      current: held,
    };
    const decision = strategy(view);
    const target = clampGross(
      Object.fromEntries(
        ids.map((id) => [id, Number.isFinite(decision.weights[id]) ? decision.weights[id]! : 0]),
      ),
      maxGross,
    );
    decisions.push({ time, weights: target, reason: decision.reason });
    // Execute at the open of day t + 1, hold to the open of day t + 2.
    const openT1 = calendar[t + 1]!;
    const openT2 = calendar[t + 2]!;
    let turnover = 0;
    let fees = 0;
    let slippage = 0;
    let gross = 0;
    let fundingPnl = 0;
    const moves: number[] = [];
    for (const [k, id] of ids.entries()) {
      const kind = instruments[k]!.kind;
      const w = target[id] ?? 0;
      const change = Math.abs(w - (held[id] ?? 0));
      turnover += change;
      fees += (change * costs.feeBps[kind]) / 10_000;
      slippage += (change * costs.slippageBps[kind]) / 10_000;
      moves[k] = series[k]![t + 2]!.open / series[k]![t + 1]!.open - 1;
      gross += w * moves[k]!;
      if (kind === "perp") {
        // Funding times in (open of t + 1, open of t + 2], on the position held then: a long
        // pays a positive rate, a short receives it.
        const list = funding[k]!;
        for (let c = upTo(list, openT1); c < list.length && list[c]!.time <= openT2; c++)
          fundingPnl -= w * list[c]!.rate;
      }
    }
    const invested = Object.values(target).reduce((s, w) => s + Math.abs(w), 0);
    const cash = Math.max(0, 1 - invested) * (costs.cashRate / DAYS_PER_YEAR);
    const ret = gross + fundingPnl + cash - fees - slippage;
    equity *= 1 + ret;
    // What is held at the next open: each position moved with its price, equity with the day.
    held =
      1 + ret > 0
        ? Object.fromEntries(
            ids.map((id, k) => [id, ((target[id] ?? 0) * (1 + moves[k]!)) / (1 + ret)]),
          )
        : Object.fromEntries(ids.map((id) => [id, 0]));
    days.push({
      time: openT1,
      equity,
      ret,
      gross,
      fees,
      slippage,
      funding: fundingPnl,
      cash,
      weights: { ...target },
      turnover,
    });
  }
  return { engineVersion: RESEARCH_ENGINE_VERSION, days, decisions, costs };
}

/**
 * The decisions a strategy makes on every day from the warmup through the last day with data
 * (the live end, which a backtest cannot account yet), with the same views and the same
 * held-weights state as `runBacktest`. For monitoring: the last one is today's signal.
 */
export function decisionsThrough(
  instruments: readonly Instrument[],
  strategy: StrategyFn,
  options: Pick<BacktestOptions, "warmup" | "maxGross"> = {},
): {
  time: number;
  weights: Record<string, number>;
  reason?: string;
  inputs?: StrategyDecision["inputs"];
}[] {
  const maxGross = options.maxGross ?? 1;
  const calendar = alignedCalendar(instruments);
  const ids = instruments.map((i) => i.id);
  const series = instruments.map((i) => {
    const m = new Map(i.bars.map((b) => [b.time, b]));
    return calendar.map((t) => m.get(t)!);
  });
  const funding = instruments.map((i) => [...(i.funding ?? [])].sort((a, b) => a.time - b.time));
  let held: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const out: ReturnType<typeof decisionsThrough> = [];
  for (let t = Math.max(options.warmup ?? 0, 0); t < calendar.length; t++) {
    const time = calendar[t]!;
    const close = time + DAY;
    const decision = strategy({
      index: t,
      time,
      bars: Object.fromEntries(ids.map((id, k) => [id, series[k]!.slice(0, t + 1)])),
      funding: Object.fromEntries(
        ids.map((id, k) => [id, funding[k]!.slice(0, upTo(funding[k]!, close))]),
      ),
      current: held,
    });
    const target = clampGross(
      Object.fromEntries(
        ids.map((id) => [id, Number.isFinite(decision.weights[id]) ? decision.weights[id]! : 0]),
      ),
      maxGross,
    );
    out.push({ time, weights: target, reason: decision.reason, inputs: decision.inputs });
    held = target;
  }
  return out;
}
