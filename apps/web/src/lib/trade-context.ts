import type { MarketBar } from "./market-data";
import { fmtPrice } from "./analysis-text";

/**
 * What the market did around one trade, from candles: where the entry sat in the day's range
 * so far and against the day's VWAP, how far price went against the entry and in its favour
 * while it was open (MAE and MFE, in R when there is a stop), how much of that move the exit
 * kept, and what price did after the exit. Pure; the server fetches the candles.
 */

export interface ContextTrade {
  direction: "long" | "short";
  avgEntry: number;
  avgExit?: number | null;
  openedAt: string;
  closedAt?: string | null;
  stopLoss?: number | null;
  profitTarget?: number | null;
}

export interface TradeMarketFacts {
  /** The day's high and low from its start up to the entry candle. */
  dayRange: { high: number; low: number } | null;
  /** 0 at the day's low so far, 1 at its high. */
  entryInRange: number | null;
  vwapAtEntry: number | null;
  /** Entry above (+) or below (-) the VWAP, as a share of the VWAP. */
  entryVsVwap: number | null;
  /** Furthest price went against the entry while open (a price distance, never negative). */
  mae: number | null;
  mfe: number | null;
  maeR: number | null;
  mfeR: number | null;
  /** The exit's gain as a share of the MFE (1: sold the best price). */
  captured: number | null;
  /** Price distance it went further in the trade's favour after the exit, in the candles given. */
  afterExit: number | null;
  stopTouched: boolean | null;
  targetTouched: boolean | null;
}

const hlc3 = (b: MarketBar) => (b.high + b.low + b.close) / 3;

export function tradeMarketFacts(
  trade: ContextTrade,
  bars: readonly MarketBar[],
  /** Epoch ms the entry's journal day starts. */
  dayStart: number,
  /** Candle size in ms. */
  step: number,
): TradeMarketFacts {
  const opened = Date.parse(trade.openedAt);
  const closed = trade.closedAt ? Date.parse(trade.closedAt) : null;
  const long = trade.direction === "long";
  const sign = long ? 1 : -1;
  // The day up to and including the candle the entry happened in.
  const before = bars.filter((b) => b.time >= dayStart && b.time <= opened);
  const dayRange = before.length
    ? { high: Math.max(...before.map((b) => b.high)), low: Math.min(...before.map((b) => b.low)) }
    : null;
  const entryInRange =
    dayRange && dayRange.high > dayRange.low
      ? Math.min(1, Math.max(0, (trade.avgEntry - dayRange.low) / (dayRange.high - dayRange.low)))
      : null;
  const volume = before.reduce((s, b) => s + (b.volume > 0 ? b.volume : 0), 0);
  const vwapAtEntry =
    volume > 0
      ? before.reduce((s, b) => s + hlc3(b) * (b.volume > 0 ? b.volume : 0), 0) / volume
      : null;
  const entryVsVwap = vwapAtEntry ? (trade.avgEntry - vwapAtEntry) / vwapAtEntry : null;

  const end = closed ?? Infinity;
  const during = bars.filter((b) => b.time + step > opened && b.time <= end);
  const high = during.length ? Math.max(...during.map((b) => b.high)) : null;
  const low = during.length ? Math.min(...during.map((b) => b.low)) : null;
  const mae =
    high === null || low === null
      ? null
      : Math.max(0, long ? trade.avgEntry - low : high - trade.avgEntry);
  const mfe =
    high === null || low === null
      ? null
      : Math.max(0, long ? high - trade.avgEntry : trade.avgEntry - low);
  const risk =
    trade.stopLoss != null && (trade.avgEntry - trade.stopLoss) * sign > 0
      ? Math.abs(trade.avgEntry - trade.stopLoss)
      : null;
  const gain = trade.avgExit != null ? (trade.avgExit - trade.avgEntry) * sign : null;
  const afterBars = closed === null ? [] : bars.filter((b) => b.time > closed);
  const afterExit =
    closed === null || trade.avgExit == null || !afterBars.length
      ? null
      : Math.max(
          0,
          long
            ? Math.max(...afterBars.map((b) => b.high)) - trade.avgExit
            : trade.avgExit - Math.min(...afterBars.map((b) => b.low)),
        );
  const touched = (price: number | null | undefined, adverse: boolean) =>
    price == null || high === null || low === null
      ? null
      : adverse === long
        ? low <= price
        : high >= price;
  return {
    dayRange,
    entryInRange,
    vwapAtEntry,
    entryVsVwap,
    mae,
    mfe,
    maeR: mae !== null && risk ? mae / risk : null,
    mfeR: mfe !== null && risk ? mfe / risk : null,
    captured: gain !== null && mfe ? gain / mfe : null,
    afterExit,
    stopTouched: touched(trade.stopLoss, true),
    targetTouched: touched(trade.profitTarget, false),
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const r = (n: number | null) => (n === null ? "" : ` (${n.toFixed(2)}R)`);

/** The facts as lines for the AI. */
export function describeTradeMarket(facts: TradeMarketFacts, trade: ContextTrade): string {
  const lines: string[] = [];
  if (facts.dayRange && facts.entryInRange !== null)
    lines.push(
      `Entry ${fmtPrice(trade.avgEntry)} at ${pct(facts.entryInRange)} of the day's range so far (low ${fmtPrice(facts.dayRange.low)}, high ${fmtPrice(facts.dayRange.high)}).`,
    );
  if (facts.vwapAtEntry !== null && facts.entryVsVwap !== null)
    lines.push(
      `Day VWAP at entry ${fmtPrice(facts.vwapAtEntry)}: entry ${(Math.abs(facts.entryVsVwap) * 100).toFixed(2)}% ${facts.entryVsVwap >= 0 ? "above" : "below"} it.`,
    );
  if (facts.mae !== null && facts.mfe !== null)
    lines.push(
      `While open, price went ${fmtPrice(facts.mae)} against the entry${r(facts.maeR)} and ${fmtPrice(facts.mfe)} in its favour${r(facts.mfeR)}.`,
    );
  if (facts.captured !== null)
    lines.push(`The exit kept ${pct(facts.captured)} of the best move while open.`);
  if (facts.stopTouched !== null)
    lines.push(`The planned stop was ${facts.stopTouched ? "" : "not "}reached while open.`);
  if (facts.targetTouched !== null)
    lines.push(`The planned target was ${facts.targetTouched ? "" : "not "}reached while open.`);
  if (facts.afterExit !== null)
    lines.push(
      `After the exit, price went a further ${fmtPrice(facts.afterExit)} in the trade's direction in the candles shown.`,
    );
  return lines.join("\n");
}
