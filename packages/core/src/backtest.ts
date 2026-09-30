/**
 * A bar-replay backtest: orders placed while candles are revealed one at a time, filled and
 * exited from each new candle's open, high, low and close, the way a broker would. Pure and
 * deterministic: the same orders over the same candles give the same trades.
 *
 * What a candle cannot tell is when inside it each price was reached. Where that decides the
 * outcome (the stop and the target both inside one candle, or an entry and its stop), the
 * rule is stated (`sameCandle`, the stop first by default, as a careful tester assumes) and
 * the trade is flagged `ambiguous`. A price that gaps past a level fills at the open.
 */

export type BacktestSide = "long" | "short";
export type BacktestOrderType = "market" | "limit" | "stop";

export interface BacktestBar {
  /** Open time, epoch ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface BacktestConfig {
  initialBalance: number;
  /** Commission per fill, in account currency. */
  commissionPerFill: number;
  /** Commission as a share of each fill's notional (0.0005 = 0.05%). */
  commissionRate: number;
  /** Price moved against you on market and stop fills (not on limits). */
  slippage: number;
  /** Money per point per unit (a future's contract multiplier; 1 for spot). */
  multiplier: number;
  /** Which level counts when one candle touches both the stop and the target. */
  sameCandle: "stop-first" | "target-first";
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialBalance: 10_000,
  commissionPerFill: 0,
  commissionRate: 0,
  slippage: 0,
  multiplier: 1,
  sameCandle: "stop-first",
};

export interface BacktestOrder {
  id: string;
  side: BacktestSide;
  type: Exclude<BacktestOrderType, "market">;
  qty: number;
  /** Limit or stop price. */
  price: number;
  stop: number | null;
  target: number | null;
  /** Open time of the candle it was placed on. */
  placedAt: number;
}

export interface BacktestPosition {
  id: string;
  side: BacktestSide;
  qty: number;
  entryPrice: number;
  entryTime: number;
  stop: number | null;
  target: number | null;
  /** The stop's distance at entry, in money (null without a stop): 1R. */
  risk: number | null;
  /** Commission paid on the entry. */
  entryFees: number;
  /** Worst and best open result so far, in money (MAE as a negative number). */
  mae: number;
  mfe: number;
  /** Candles the position has been open through. */
  bars: number;
  /** Filled inside a candle that also reached its stop or target: order unknown. */
  ambiguous: boolean;
}

export type ExitReason = "stop" | "target" | "manual" | "end";

export interface BacktestTrade {
  id: string;
  side: BacktestSide;
  qty: number;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  exitReason: ExitReason;
  stop: number | null;
  target: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  /** Net result in R (null without a stop at entry). */
  r: number | null;
  mae: number;
  mfe: number;
  bars: number;
  /** The candle could not tell which level came first; the stated rule decided. */
  ambiguous: boolean;
  note: string;
}

export interface BacktestState {
  /** Initial balance plus closed trades' net results. */
  balance: number;
  position: BacktestPosition | null;
  orders: BacktestOrder[];
  trades: BacktestTrade[];
  /** For ids: orders and trades are numbered in the order they were made. */
  sequence: number;
}

export type BacktestEvent =
  | { kind: "filled"; orderId: string; side: BacktestSide; price: number; time: number }
  | { kind: "closed"; trade: BacktestTrade }
  | { kind: "cancelled"; orderId: string; reason: string };

export class BacktestError extends Error {}

export const newBacktest = (config: Pick<BacktestConfig, "initialBalance">): BacktestState => ({
  balance: config.initialBalance,
  position: null,
  orders: [],
  trades: [],
  sequence: 0,
});

const sign = (side: BacktestSide) => (side === "long" ? 1 : -1);
const fee = (price: number, qty: number, config: BacktestConfig) =>
  config.commissionPerFill + config.commissionRate * Math.abs(price * qty * config.multiplier);

/**
 * Units to trade so that the stop costs `risk` (before commission): risk / (distance ×
 * multiplier), rounded down to `step` (a lot size; 0 leaves it unrounded).
 */
export function sizeForRisk(
  entry: number,
  stop: number,
  risk: number,
  multiplier = 1,
  step = 0,
): number {
  const distance = Math.abs(entry - stop) * multiplier;
  if (!(distance > 0) || !(risk > 0)) return 0;
  const units = risk / distance;
  if (!(step > 0)) return units;
  // A hair of tolerance so 0.3 / 0.1 is 3, not 2.9999.
  return Math.floor(units / step + 1e-9) * step;
}

/** Stop and target on the right sides of a price for a side, or the reason they are not. */
function checkLevels(
  side: BacktestSide,
  price: number,
  stop: number | null,
  target: number | null,
) {
  const s = sign(side);
  if (stop !== null && (stop - price) * s >= 0)
    throw new BacktestError(
      `The stop loss must be ${side === "long" ? "below" : "above"} the entry for a ${side}.`,
    );
  if (target !== null && (target - price) * s <= 0)
    throw new BacktestError(
      `The take profit must be ${side === "long" ? "above" : "below"} the entry for a ${side}.`,
    );
}

const positive = (value: number, what: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new BacktestError(`${what} must be above zero.`);
};

function open(
  state: BacktestState,
  input: { side: BacktestSide; qty: number; stop: number | null; target: number | null },
  price: number,
  time: number,
  config: BacktestConfig,
  ambiguous = false,
): BacktestState {
  const entryFees = fee(price, input.qty, config);
  const sequence = state.sequence + 1;
  return {
    ...state,
    sequence,
    position: {
      id: `T${sequence}`,
      side: input.side,
      qty: input.qty,
      entryPrice: price,
      entryTime: time,
      stop: input.stop,
      target: input.target,
      risk:
        input.stop === null ? null : Math.abs(price - input.stop) * input.qty * config.multiplier,
      entryFees,
      mae: 0,
      mfe: 0,
      bars: 0,
      ambiguous,
    },
  };
}

/**
 * Place an order on the revealed candle `bar` (its close is the current price). A market
 * order fills now, at the close plus slippage; a limit or stop order waits for a later candle.
 * One position at a time: entries are refused while one is open.
 */
export function placeOrder(
  state: BacktestState,
  order: {
    side: BacktestSide;
    type: BacktestOrderType;
    qty: number;
    price?: number;
    stop?: number | null;
    target?: number | null;
  },
  bar: BacktestBar,
  config: BacktestConfig,
): { state: BacktestState; events: BacktestEvent[] } {
  if (state.position) throw new BacktestError("Close the open position before entering again.");
  positive(order.qty, "The quantity");
  const stop = order.stop ?? null;
  const target = order.target ?? null;
  for (const [level, name] of [
    [stop, "The stop loss"],
    [target, "The take profit"],
  ] as const)
    if (level !== null) positive(level, name);
  if (order.type === "market") {
    const price = bar.close + sign(order.side) * config.slippage;
    checkLevels(order.side, price, stop, target);
    const next = open(state, { ...order, stop, target }, price, bar.time, config);
    return {
      state: next,
      events: [
        { kind: "filled", orderId: next.position!.id, side: order.side, price, time: bar.time },
      ],
    };
  }
  const price = order.price ?? NaN;
  positive(price, "The order price");
  const s = sign(order.side);
  // A limit waits for a better price, a stop for a worse one (a breakout).
  if (order.type === "limit" && (price - bar.close) * s >= 0)
    throw new BacktestError(
      `A ${order.side === "long" ? "buy" : "sell"} limit goes ${order.side === "long" ? "below" : "above"} the current price; use a stop order to enter on a breakout.`,
    );
  if (order.type === "stop" && (price - bar.close) * s <= 0)
    throw new BacktestError(
      `A ${order.side === "long" ? "buy" : "sell"} stop goes ${order.side === "long" ? "above" : "below"} the current price; use a limit order to enter on a pullback.`,
    );
  checkLevels(order.side, price, stop, target);
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      sequence,
      orders: [
        ...state.orders,
        {
          id: `O${sequence}`,
          side: order.side,
          type: order.type,
          qty: order.qty,
          price,
          stop,
          target,
          placedAt: bar.time,
        },
      ],
    },
    events: [],
  };
}

export function cancelOrder(state: BacktestState, id: string): BacktestState {
  return { ...state, orders: state.orders.filter((order) => order.id !== id) };
}

/** Move the open position's stop and target (null removes one). Its 1R stays what it was. */
export function modifyPosition(
  state: BacktestState,
  levels: { stop: number | null; target: number | null },
  price: number,
): BacktestState {
  const position = state.position;
  if (!position) throw new BacktestError("There is no open position.");
  checkLevels(position.side, price, levels.stop, levels.target);
  return { ...state, position: { ...position, stop: levels.stop, target: levels.target } };
}

function close(
  state: BacktestState,
  price: number,
  time: number,
  reason: ExitReason,
  config: BacktestConfig,
  ambiguous = false,
): { state: BacktestState; trade: BacktestTrade } {
  const position = state.position!;
  const grossPnl =
    (price - position.entryPrice) * sign(position.side) * position.qty * config.multiplier;
  const fees = position.entryFees + fee(price, position.qty, config);
  const netPnl = grossPnl - fees;
  const trade: BacktestTrade = {
    id: position.id,
    side: position.side,
    qty: position.qty,
    entryTime: position.entryTime,
    entryPrice: position.entryPrice,
    exitTime: time,
    exitPrice: price,
    exitReason: reason,
    stop: position.stop,
    target: position.target,
    grossPnl,
    fees,
    netPnl,
    r: position.risk ? netPnl / position.risk : null,
    // The exit itself is an observation too.
    mae: Math.min(position.mae, grossPnl, 0),
    mfe: Math.max(position.mfe, grossPnl, 0),
    bars: position.bars,
    ambiguous: position.ambiguous || ambiguous,
    note: "",
  };
  return {
    state: {
      ...state,
      position: null,
      balance: state.balance + netPnl,
      trades: [...state.trades, trade],
    },
    trade,
  };
}

/** Close the open position now at `price` (the current close), minus slippage. */
export function closePosition(
  state: BacktestState,
  bar: BacktestBar,
  config: BacktestConfig,
  reason: Extract<ExitReason, "manual" | "end"> = "manual",
): { state: BacktestState; events: BacktestEvent[] } {
  if (!state.position) throw new BacktestError("There is no open position.");
  const price = bar.close - sign(state.position.side) * config.slippage;
  const { state: next, trade } = close(state, price, bar.time, reason, config);
  return { state: next, events: [{ kind: "closed", trade }] };
}

/** The open result of a position at a price, in money. */
const openPnl = (position: BacktestPosition, price: number, config: BacktestConfig) =>
  (price - position.entryPrice) * sign(position.side) * position.qty * config.multiplier;

/**
 * Where a candle takes the open position out, if it does: a gap past a level exits at the
 * open; otherwise the stop, the target, or (both inside the candle) the `sameCandle` rule.
 */
function exitIn(
  position: BacktestPosition,
  bar: BacktestBar,
  config: BacktestConfig,
): { price: number; reason: "stop" | "target"; ambiguous: boolean } | null {
  const s = sign(position.side);
  const { stop, target } = position;
  // The adverse and favourable extremes of the candle for this side.
  const worst = s > 0 ? bar.low : bar.high;
  const best = s > 0 ? bar.high : bar.low;
  if (stop !== null && (bar.open - stop) * s <= 0)
    return { price: bar.open - s * config.slippage, reason: "stop", ambiguous: false };
  if (target !== null && (bar.open - target) * s >= 0)
    return { price: bar.open, reason: "target", ambiguous: false };
  const stopHit = stop !== null && (worst - stop) * s <= 0;
  const targetHit = target !== null && (best - target) * s >= 0;
  if (stopHit && targetHit)
    return config.sameCandle === "target-first"
      ? { price: target!, reason: "target", ambiguous: true }
      : { price: stop! - s * config.slippage, reason: "stop", ambiguous: true };
  if (stopHit) return { price: stop! - s * config.slippage, reason: "stop", ambiguous: false };
  if (targetHit) return { price: target!, reason: "target", ambiguous: false };
  return null;
}

/**
 * Reveal one more candle: pending orders it reaches fill (at their price, or at the open
 * when it gaps past them; one position at a time, so the first to fill wins and the rest
 * wait), then the open position is checked against its stop and target.
 */
export function stepBar(
  state: BacktestState,
  bar: BacktestBar,
  config: BacktestConfig,
): { state: BacktestState; events: BacktestEvent[] } {
  const events: BacktestEvent[] = [];
  let next = state;
  let enteredNow = false;
  if (!next.position) {
    const reached = next.orders
      .map((order) => {
        const s = sign(order.side);
        const touched =
          order.type === "limit"
            ? ((s > 0 ? bar.low : bar.high) - order.price) * s <= 0
            : ((s > 0 ? bar.high : bar.low) - order.price) * s >= 0;
        if (!touched) return null;
        // Past the price at the open: filled there (better for a limit, worse for a stop).
        const gapped =
          order.type === "limit"
            ? (bar.open - order.price) * s <= 0
            : (bar.open - order.price) * s >= 0;
        const base = gapped ? bar.open : order.price;
        return { order, price: order.type === "stop" ? base + s * config.slippage : base };
      })
      .filter((fill): fill is { order: BacktestOrder; price: number } => fill !== null);
    const first = reached[0];
    if (first) {
      const { order, price } = first;
      next = { ...next, orders: next.orders.filter((o) => o.id !== order.id) };
      next = open(next, order, price, bar.time, config);
      enteredNow = true;
      events.push({ kind: "filled", orderId: order.id, side: order.side, price, time: bar.time });
    }
  }
  const position = next.position;
  if (!position) return { state: next, events };
  let exit = exitIn(position, bar, config);
  if (enteredNow && exit) {
    // Entered inside this candle: a gap exit cannot apply, and whether the level came after
    // the entry is unknown, so the stated rule decides and the trade is flagged.
    const s = sign(position.side);
    const stopHit =
      position.stop !== null && ((s > 0 ? bar.low : bar.high) - position.stop) * s <= 0;
    const targetHit =
      position.target !== null && ((s > 0 ? bar.high : bar.low) - position.target) * s >= 0;
    exit =
      stopHit && (!targetHit || config.sameCandle === "stop-first")
        ? { price: position.stop! - s * config.slippage, reason: "stop", ambiguous: true }
        : targetHit
          ? { price: position.target!, reason: "target", ambiguous: true }
          : null;
  }
  // Excursions over the candle, up to where it left.
  const s = sign(position.side);
  const worstPrice = exit?.reason === "stop" ? exit.price : s > 0 ? bar.low : bar.high;
  const bestPrice = exit?.reason === "target" ? exit.price : s > 0 ? bar.high : bar.low;
  const tracked: BacktestPosition = {
    ...position,
    bars: position.bars + 1,
    mae: Math.min(position.mae, openPnl(position, worstPrice, config)),
    mfe: Math.max(position.mfe, openPnl(position, bestPrice, config)),
  };
  next = { ...next, position: tracked };
  if (exit) {
    const closed = close(next, exit.price, bar.time, exit.reason, config, exit.ambiguous);
    next = closed.state;
    events.push({ kind: "closed", trade: closed.trade });
  }
  return { state: next, events };
}

export interface BacktestSideReport {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netProfit: number;
  profitFactor: number | null;
  profitFactorIsInfinite: boolean;
  avgTrade: number | null;
  avgR: number | null;
}

export interface BacktestReport extends BacktestSideReport {
  breakeven: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number | null;
  avgLoss: number | null;
  /** Average win over average loss. */
  payoff: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  /** Largest fall from an equity peak, in money and as a share of that peak. */
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  returnPct: number | null;
  commission: number;
  avgBars: number | null;
  /** Trades whose outcome the candle could not settle. */
  ambiguous: number;
  long: BacktestSideReport;
  short: BacktestSideReport;
  /** Equity after each trade, starting from the initial balance. */
  equity: { time: number; equity: number }[];
}

type Result = Pick<BacktestTrade, "netPnl" | "r" | "side">;

function sideReport(trades: readonly Result[]): BacktestSideReport {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.netPnl, 0);
  const grossLoss = -losses.reduce((sum, t) => sum + t.netPnl, 0);
  const net = trades.reduce((sum, t) => sum + t.netPnl, 0);
  const withR = trades.filter((t) => t.r !== null);
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : null,
    netProfit: net,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    profitFactorIsInfinite: grossLoss === 0 && grossProfit > 0,
    avgTrade: trades.length ? net / trades.length : null,
    avgR: withR.length ? withR.reduce((sum, t) => sum + t.r!, 0) / withR.length : null,
  };
}

/** A tester's performance summary of closed trades, in the order they closed. */
export function backtestReport(
  trades: readonly Pick<
    BacktestTrade,
    "netPnl" | "r" | "side" | "fees" | "bars" | "exitTime" | "ambiguous"
  >[],
  initialBalance: number,
): BacktestReport {
  const all = sideReport(trades);
  const wins = trades.filter((t) => t.netPnl > 0).map((t) => t.netPnl);
  const losses = trades.filter((t) => t.netPnl < 0).map((t) => t.netPnl);
  let streakWins = 0;
  let streakLosses = 0;
  let maxWins = 0;
  let maxLosses = 0;
  let equity = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;
  const curve = [{ time: trades[0]?.exitTime ?? 0, equity: initialBalance }];
  for (const trade of trades) {
    if (trade.netPnl > 0) {
      streakWins += 1;
      streakLosses = 0;
    } else if (trade.netPnl < 0) {
      streakLosses += 1;
      streakWins = 0;
    } else {
      streakWins = 0;
      streakLosses = 0;
    }
    maxWins = Math.max(maxWins, streakWins);
    maxLosses = Math.max(maxLosses, streakLosses);
    equity += trade.netPnl;
    peak = Math.max(peak, equity);
    const drawdown = peak - equity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct ?? 0, drawdown / peak);
    curve.push({ time: trade.exitTime, equity });
  }
  const grossProfit = wins.reduce((sum, v) => sum + v, 0);
  const grossLoss = -losses.reduce((sum, v) => sum + v, 0);
  const avgWin = wins.length ? grossProfit / wins.length : null;
  const avgLoss = losses.length ? grossLoss / losses.length : null;
  return {
    ...all,
    breakeven: trades.length - all.wins - all.losses,
    grossProfit,
    grossLoss,
    avgWin,
    avgLoss,
    payoff: avgWin !== null && avgLoss ? avgWin / avgLoss : null,
    largestWin: wins.length ? Math.max(...wins) : null,
    largestLoss: losses.length ? Math.min(...losses) : null,
    maxConsecutiveWins: maxWins,
    maxConsecutiveLosses: maxLosses,
    maxDrawdown,
    maxDrawdownPct: trades.length ? (maxDrawdownPct ?? 0) : null,
    returnPct: initialBalance > 0 ? all.netProfit / initialBalance : null,
    commission: trades.reduce((sum, t) => sum + t.fees, 0),
    avgBars: trades.length ? trades.reduce((sum, t) => sum + t.bars, 0) / trades.length : null,
    ambiguous: trades.filter((t) => t.ambiguous).length,
    long: sideReport(trades.filter((t) => t.side === "long")),
    short: sideReport(trades.filter((t) => t.side === "short")),
    equity: curve,
  };
}
