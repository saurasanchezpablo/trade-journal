import {
  DEFAULT_COSTS,
  RESEARCH_ENGINE_VERSION,
  alignedCalendar,
  runBacktest,
  type CostModel,
  type DailyRecord,
  type Instrument,
} from "./backtest";
import { CATALOG_VERSION, type StrategyDefinition } from "./catalog";
import {
  performance,
  excessReturns,
  relativeTo,
  tradingMetrics,
  type PerformanceMetrics,
  type RelativeMetrics,
  type TradingMetrics,
} from "./metrics";
import {
  bootstrapSharpe,
  byRegime,
  dailySharpe,
  deflatedSharpe,
  probabilisticSharpe,
  probabilityOfOverfitting,
  regimes,
  walkForward,
  type RegimeLabel,
} from "./validation";

/**
 * A strategy's research report, its results kept apart by what kind of evidence they are:
 * - `in-sample`: the best configuration of the grid, chosen and measured on the same days
 *   (before the holdout). Optimistic by construction; shown with the Deflated Sharpe and the
 *   probability of overfitting, which correct for that choice.
 * - `walk-forward`: each window traded by the configuration chosen on the years before it,
 *   only before the holdout. The main out-of-sample evidence.
 * - `holdout`: the in-sample choice, frozen, on the days after `holdoutFrom`, which no choice
 *   ever saw.
 * Paper trading (signals recorded as they happen) and live monitoring are kept by the app,
 * separately again.
 */
export const EVALUATION_VERSION = "evaluation-1";

export type ResultCategory = "in-sample" | "walk-forward" | "holdout" | "paper";

/** The day the holdout starts: no configuration was chosen with any data from then on. */
export const HOLDOUT_FROM = Date.UTC(2025, 6, 1);

export interface EvaluationOptions {
  costs?: CostModel;
  holdoutFrom?: number;
  /** Walk-forward windows, in days. */
  trainDays?: number;
  testDays?: number;
  /** Bootstrap seed (results are reproducible). */
  seed?: number;
}

export interface SeriesSummary {
  category: ResultCategory;
  /** What this series is, in words (which configuration, chosen how). */
  label: string;
  from: number | null;
  to: number | null;
  metrics: PerformanceMetrics;
  trading: TradingMetrics;
  /** The benchmark over exactly the same days, and the comparison with it. */
  benchmark: PerformanceMetrics | null;
  relative: RelativeMetrics | null;
  probabilisticSharpe: number | null;
  bootstrap: ReturnType<typeof bootstrapSharpe>;
  byRegime: ReturnType<typeof byRegime>;
  /**
   * Short perpetual legs only: the worst intraday rise of the perpetual against a short held
   * that day (from the open to the high), and the days it used more than half the margin.
   * The backtest assumes the margin is topped up daily; this says how close that came.
   */
  perpStress: { worstMove: number; margin: number; daysOverHalf: number } | null;
  /** Daily equity (from 1) and drawdown. */
  equity: { time: number; equity: number; drawdown: number; benchmark: number | null }[];
}

export interface ConfigResult {
  id: string;
  label: string;
  /** In-sample annualized Sharpe ratio (before the holdout), after costs. */
  sharpe: number | null;
  cagr: number | null;
  maxDrawdown: number;
}

export type Verdict =
  "benchmark" | "meets-standard" | "experimental" | "rejected" | "insufficient-data";

export interface Criterion {
  id: string;
  label: string;
  passed: boolean | null;
  value: string;
}

export interface StrategyReport {
  strategyId: string;
  engineVersion: string;
  catalogVersion: string;
  evaluationVersion: string;
  costs: CostModel;
  holdoutFrom: number;
  dataFrom: number | null;
  dataThrough: number | null;
  configs: ConfigResult[];
  selected: { id: string; label: string } | null;
  deflated: { dsr: number | null; threshold: number; trials: number };
  pbo: { pbo: number | null; splits: number } | null;
  inSample: SeriesSummary | null;
  walkForward:
    | (SeriesSummary & {
        folds: {
          trainFrom: number;
          trainTo: number;
          testFrom: number;
          testTo: number;
          chosen: string;
        }[];
        trials: number;
      })
    | null;
  holdout: SeriesSummary | null;
  verdict: Verdict;
  criteria: Criterion[];
}

/** The pre-declared evidence standard (docs/trading/VALIDATION.md). */
export const EVIDENCE_STANDARD = {
  minInSampleDays: 3 * 365,
  minHoldoutDays: 180,
  minDeflatedSharpe: 0.95,
  maxPbo: 0.25,
} as const;

const DAY = 86_400_000;

export function summarizeDays(
  category: ResultCategory,
  label: string,
  days: readonly DailyRecord[],
  benchmark: Map<number, number> | null,
  labels: Map<number, RegimeLabel>,
  costs: CostModel,
  seed: number,
  perp?: { instrument: Instrument; margin: number },
): SeriesSummary {
  const returns = days.map((d) => d.ret);
  const shared = benchmark ? days.filter((d) => benchmark.has(d.time)) : [];
  const bench = shared.map((d) => benchmark!.get(d.time)!);
  let equity = 1;
  let peak = 1;
  let benchEquity = 1;
  return {
    category,
    label,
    from: days[0]?.time ?? null,
    to: days[days.length - 1]?.time ?? null,
    metrics: performance(returns, costs.cashRate),
    trading: tradingMetrics(days),
    benchmark: benchmark && shared.length ? performance(bench, costs.cashRate) : null,
    relative:
      benchmark && shared.length > 1
        ? relativeTo(
            shared.map((d) => d.ret),
            bench,
          )
        : null,
    probabilisticSharpe: probabilisticSharpe(excessReturns(returns, costs.cashRate)),
    bootstrap: bootstrapSharpe(excessReturns(returns, costs.cashRate), { seed }),
    perpStress: perp ? perpStress(days, perp.instrument, perp.margin) : null,
    byRegime: byRegime(days, labels, costs.cashRate),
    equity: days.map((d) => {
      equity *= 1 + d.ret;
      peak = Math.max(peak, equity);
      const b = benchmark?.get(d.time);
      if (b !== undefined) benchEquity *= 1 + b;
      return {
        time: d.time,
        equity,
        drawdown: 1 - equity / peak,
        benchmark: b === undefined ? null : benchEquity,
      };
    }),
  };
}

function perpStress(days: readonly DailyRecord[], perp: Instrument, margin: number) {
  const bars = new Map(perp.bars.map((b) => [b.time, b]));
  let worstMove = 0;
  let daysOverHalf = 0;
  for (const d of days) {
    const bar = bars.get(d.time);
    if (!bar || !((d.weights[perp.id] ?? 0) < 0)) continue;
    const move = bar.high / bar.open - 1;
    worstMove = Math.max(worstMove, move);
    if (move > margin / 2) daysOverHalf++;
  }
  return { worstMove, margin, daysOverHalf };
}

const fmt = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined ? "n/a" : x.toFixed(digits);

/**
 * Evaluate one strategy of the catalog on the given instruments. `benchmarkReturns` are the
 * benchmark's daily returns by day (null for the benchmark itself). Deterministic.
 */
export function evaluateStrategy(
  definition: StrategyDefinition,
  instruments: readonly Instrument[],
  benchmarkReturns: Map<number, number> | null,
  regimeBars: readonly { time: number; close: number }[],
  options: EvaluationOptions = {},
): StrategyReport {
  const costs = options.costs ?? DEFAULT_COSTS;
  const holdoutFrom = options.holdoutFrom ?? HOLDOUT_FROM;
  const seed = options.seed ?? 1;
  const used = instruments.filter((i) => definition.instruments.includes(i.id as never));
  const calendar = alignedCalendar(used);
  const labels = regimes(regimeBars);
  const perpInstrument = used.find((i) => i.kind === "perp");
  const perp =
    perpInstrument && definition.marginFraction
      ? { instrument: perpInstrument, margin: definition.marginFraction }
      : undefined;
  const base = { costs, warmup: definition.warmup, maxGross: definition.maxGross };
  const preHoldout = { ...base, to: holdoutFrom - 2 * DAY };
  const report: StrategyReport = {
    strategyId: definition.id,
    engineVersion: RESEARCH_ENGINE_VERSION,
    catalogVersion: CATALOG_VERSION,
    evaluationVersion: EVALUATION_VERSION,
    costs,
    holdoutFrom,
    dataFrom: calendar[0] ?? null,
    dataThrough: calendar[calendar.length - 1] ?? null,
    configs: [],
    selected: null,
    deflated: { dsr: null, threshold: 0, trials: definition.grid.length },
    pbo: null,
    inSample: null,
    walkForward: null,
    holdout: null,
    verdict: "insufficient-data",
    criteria: [],
  };
  if (calendar.length < definition.warmup + 30) return report;

  // In-sample: every configuration before the holdout (the last day accounted is the day
  // before the holdout starts).
  const runs = definition.grid.map((point) => ({
    point,
    run: runBacktest(used, definition.build(point.params), preHoldout),
  }));
  report.configs = runs.map(({ point, run }) => {
    const m = performance(
      run.days.map((d) => d.ret),
      costs.cashRate,
    );
    return {
      id: point.id,
      label: point.label,
      sharpe: m.sharpe,
      cagr: m.cagr,
      maxDrawdown: m.maxDrawdown,
    };
  });
  const bestIndex = report.configs.reduce(
    (best, c, i) =>
      (c.sharpe ?? -Infinity) > (report.configs[best]!.sharpe ?? -Infinity) ? i : best,
    0,
  );
  const best = runs[bestIndex]!;
  report.selected = { id: best.point.id, label: best.point.label };
  const multiple = definition.grid.length > 1;
  report.inSample = summarizeDays(
    "in-sample",
    multiple
      ? `Best of ${definition.grid.length} configurations, chosen and measured on the same days`
      : "The only configuration, before the holdout",
    best.run.days,
    benchmarkReturns,
    labels,
    costs,
    seed,
    perp,
  );
  const excess = (days: readonly DailyRecord[]) =>
    excessReturns(
      days.map((d) => d.ret),
      costs.cashRate,
    );
  // A configuration that never traded is still a trial: its excess return is nil (Sharpe 0).
  const trialSharpes = runs.map(({ run }) => dailySharpe(excess(run.days)) ?? 0);
  report.deflated = multiple
    ? deflatedSharpe(excess(best.run.days), trialSharpes)
    : { dsr: probabilisticSharpe(excess(best.run.days)), threshold: 0, trials: 1 };
  if (multiple) {
    // CSCV on the configurations' returns over their common days.
    const length = Math.min(...runs.map(({ run }) => run.days.length));
    const p = probabilityOfOverfitting(
      runs.map(({ run }) => excess(run.days.slice(-length))),
      10,
    );
    report.pbo = { pbo: p.pbo, splits: p.splits };
  }

  // Walk-forward, before the holdout only.
  const trainDays = options.trainDays ?? 730;
  const testDays = options.testDays ?? 90;
  const preCalendar = calendar.filter((t) => t < holdoutFrom);
  if (preCalendar.length > definition.warmup + trainDays + testDays + 2) {
    const wf = walkForward(
      used,
      definition.grid.map((point) => ({ id: point.id, strategy: definition.build(point.params) })),
      preCalendar,
      { trainDays, testDays, warmup: definition.warmup, costs, maxGross: definition.maxGross },
    );
    if (wf.outOfSample.length)
      report.walkForward = {
        ...summarizeDays(
          "walk-forward",
          multiple
            ? `Each ${testDays}-day window traded by the configuration with the best Sharpe on the ${trainDays} days before it`
            : `The only configuration, in ${testDays}-day windows after ${trainDays} days of history`,
          wf.outOfSample,
          benchmarkReturns,
          labels,
          costs,
          seed,
          perp,
        ),
        folds: wf.folds.map(({ testDays: _, ...f }) => f),
        trials: wf.trials,
      };
  }

  // Holdout: the frozen in-sample choice, on days no choice saw.
  const holdout = runBacktest(used, definition.build(best.point.params), {
    ...base,
    from: Math.max(holdoutFrom - DAY, calendar[definition.warmup] ?? holdoutFrom),
  });
  if (holdout.days.length)
    report.holdout = summarizeDays(
      "holdout",
      `The in-sample choice (${best.point.label}), frozen, from ${new Date(holdoutFrom).toISOString().slice(0, 10)}`,
      holdout.days.filter((d) => d.time >= holdoutFrom),
      benchmarkReturns,
      labels,
      costs,
      seed,
      perp,
    );

  Object.assign(report, judge(definition, report));
  return report;
}

/** Apply the evidence standard. A benchmark is not judged. */
export function judge(
  definition: Pick<StrategyDefinition, "role" | "grid"> &
    Partial<Pick<StrategyDefinition, "benchmark">>,
  report: Pick<StrategyReport, "inSample" | "walkForward" | "holdout" | "deflated" | "pbo"> & {
    costs?: Pick<CostModel, "cashRate">;
  },
): { verdict: Verdict; criteria: Criterion[] } {
  if (definition.role === "benchmark") return { verdict: "benchmark", criteria: [] };
  const s = EVIDENCE_STANDARD;
  const wf = report.walkForward;
  const cashRate = report.costs?.cashRate ?? 0;
  const holdout = report.holdout
    ? {
        totalReturn: report.holdout.metrics.totalReturn,
        cash: (1 + cashRate / 365) ** report.holdout.metrics.days - 1,
      }
    : null;
  const criteria: Criterion[] = [
    {
      id: "sample",
      label: `At least ${s.minInSampleDays / 365} years before the holdout and ${s.minHoldoutDays} days of holdout`,
      passed:
        (report.inSample?.metrics.days ?? 0) >= s.minInSampleDays &&
        (report.holdout?.metrics.days ?? 0) >= s.minHoldoutDays,
      value: `${report.inSample?.metrics.days ?? 0} and ${report.holdout?.metrics.days ?? 0} days`,
    },
    {
      id: "deflated",
      label: `Deflated Sharpe ratio at least ${s.minDeflatedSharpe} (corrects for the ${report.deflated.trials} configurations tried)`,
      passed: report.deflated.dsr === null ? null : report.deflated.dsr >= s.minDeflatedSharpe,
      value: fmt(report.deflated.dsr, 3),
    },
    {
      id: "pbo",
      label: `Probability of backtest overfitting at most ${s.maxPbo}`,
      passed:
        definition.grid.length < 2
          ? true
          : report.pbo?.pbo == null
            ? null
            : report.pbo.pbo <= s.maxPbo,
      value: definition.grid.length < 2 ? "one configuration" : fmt(report.pbo?.pbo, 2),
    },
    {
      id: "walk-forward",
      label: "Walk-forward Sharpe above 0, with the bootstrap's 95% interval above 0",
      passed: wf?.bootstrap ? wf.bootstrap.low > 0 : null,
      value: wf
        ? `${fmt(wf.metrics.sharpe)} (${fmt(wf.bootstrap?.low)} to ${fmt(wf.bootstrap?.high)})`
        : "n/a",
    },
    definition.benchmark === "cash"
      ? {
          id: "benchmark",
          label:
            "Walk-forward return above cash (its Sharpe ratio is measured against the cash rate)",
          passed: wf?.metrics.sharpe == null ? null : wf.metrics.sharpe > 0,
          value: wf ? `Sharpe ${fmt(wf.metrics.sharpe)}` : "n/a",
        }
      : {
          id: "benchmark",
          label: "Walk-forward Sharpe above the benchmark's over the same days",
          passed:
            wf?.metrics.sharpe == null || wf.benchmark?.sharpe == null
              ? null
              : wf.metrics.sharpe > wf.benchmark.sharpe,
          value: wf ? `${fmt(wf.metrics.sharpe)} vs ${fmt(wf.benchmark?.sharpe)}` : "n/a",
        },
    {
      id: "holdout",
      label: "Holdout return after costs above what cash earned over the same days",
      // A margin over rounding: a book that sat in cash compounds to exactly the cash return.
      passed: holdout ? holdout.totalReturn > holdout.cash + 1e-6 : null,
      value: holdout
        ? `${(holdout.totalReturn * 100).toFixed(1)}% vs cash ${(holdout.cash * 100).toFixed(1)}%`
        : "n/a",
    },
  ];
  const sample = criteria[0]!;
  let verdict: Verdict;
  if (!sample.passed || !wf) verdict = "insufficient-data";
  // Not better than cash after costs, out of sample.
  else if ((wf.metrics.sharpe ?? 0) <= 0) verdict = "rejected";
  else if (criteria.every((c) => c.passed === true)) verdict = "meets-standard";
  else verdict = "experimental";
  return { verdict, criteria };
}
