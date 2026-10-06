import { sizeForRisk, type BacktestState } from "@luxalgo/journal-core";
import {
  RESOLUTIONS,
  aggregateBars,
  bucketStart,
  type MarketBar,
  type Resolution,
} from "./market-data";
import type { SessionSettings } from "./backtest-session";
import { tr, trx } from "./i18n";

/**
 * The pure parts of a replay backtest's page: what the chart shows at a higher timeframe
 * (built only from candles already revealed, so no candle ever shows the future), how an
 * order is sized from the session's risk, and the price levels drawn on the chart.
 */

/** Candle sizes the chart can show for a session replayed on `base`: base and coarser. */
export function viewResolutions(base: Resolution): Resolution[] {
  const sizes = Object.keys(RESOLUTIONS) as Resolution[];
  return sizes.filter((size) => RESOLUTIONS[size] >= RESOLUTIONS[base]);
}

/** The revealed candles as the chart shows them: the last higher-timeframe one still forming. */
export function viewBars(revealed: readonly MarketBar[], view: Resolution): MarketBar[] {
  return aggregateBars(revealed, view);
}

/**
 * The chart's forming candle while the next base candle is drawn: the base candle itself, or
 * the higher-timeframe candle made of what its bucket revealed so far plus the forming one.
 */
export function viewForming(
  revealed: readonly MarketBar[],
  forming: MarketBar,
  view: Resolution,
): MarketBar {
  const bucket = bucketStart(forming.time, view);
  let start = revealed.length;
  while (start > 0 && revealed[start - 1]!.time >= bucket) start -= 1;
  return aggregateBars([...revealed.slice(start), forming], view).at(-1)!;
}

/** The size an order gets from the session's risk and its stop (0 when it has no stop). */
export function orderSize(
  settings: SessionSettings,
  balance: number,
  entry: number,
  stop: number | null,
): { qty: number; risk: number } {
  const risk =
    settings.riskMode === "percent" ? (balance * settings.riskValue) / 100 : settings.riskValue;
  if (stop === null) return { qty: 0, risk };
  return { qty: sizeForRisk(entry, stop, risk, settings.multiplier, settings.lotStep), risk };
}

export interface ChartLevel {
  id: string;
  price: number;
  from: number;
  kind: "entry" | "stop" | "target" | "order";
  text: string;
}
export interface ChartMark {
  id: string;
  time: number;
  price: number;
  side: "long" | "short";
  text: string;
  exit: boolean;
}

/** A pending order's chart label: side and order type, then its size. */
const ORDER_LEVELS: Record<"long" | "short", Record<"market" | "limit" | "stop", string>> = {
  long: { market: "Buy market {qty}", limit: "Buy limit {qty}", stop: "Buy stop {qty}" },
  short: { market: "Sell market {qty}", limit: "Sell limit {qty}", stop: "Sell stop {qty}" },
};

/**
 * The position's entry, stop and target, pending orders, and every revealed fill: `through`
 * is where the revealed candles end (the next candle's open), so a fill there is not yet shown.
 */
export function chartOverlays(
  state: BacktestState,
  through: number,
): { levels: ChartLevel[]; marks: ChartMark[] } {
  const levels: ChartLevel[] = [];
  const position = state.position;
  if (position) {
    levels.push({
      id: "entry",
      price: position.entryPrice,
      from: position.entryTime,
      kind: "entry",
      text: tr(position.side === "long" ? "Long {qty}" : "Short {qty}", { qty: position.qty }),
    });
    if (position.stop !== null)
      levels.push({
        id: "stop",
        price: position.stop,
        from: position.entryTime,
        kind: "stop",
        text: trx("chart level", "Stop"),
      });
    if (position.target !== null)
      levels.push({
        id: "target",
        price: position.target,
        from: position.entryTime,
        kind: "target",
        text: tr("Target"),
      });
  }
  for (const order of state.orders)
    levels.push({
      id: order.id,
      price: order.price,
      from: order.placedAt,
      kind: "order",
      text: tr(ORDER_LEVELS[order.side][order.type], { qty: order.qty }),
    });
  const marks: ChartMark[] = [];
  for (const trade of state.trades) {
    if (trade.entryTime < through)
      marks.push({
        id: `${trade.id}-in`,
        time: trade.entryTime,
        price: trade.entryPrice,
        side: trade.side,
        text: tr(trade.side === "long" ? "Buy" : "Sell"),
        exit: false,
      });
    if (trade.exitTime < through)
      marks.push({
        id: `${trade.id}-out`,
        time: trade.exitTime,
        price: trade.exitPrice,
        side: trade.side,
        text:
          trade.exitReason === "stop"
            ? trx("chart level", "Stop")
            : trade.exitReason === "target"
              ? tr("Target")
              : tr("Exit"),
        exit: true,
      });
  }
  if (position)
    marks.push({
      id: `${position.id}-in`,
      time: position.entryTime,
      price: position.entryPrice,
      side: position.side,
      text: tr(position.side === "long" ? "Buy" : "Sell"),
      exit: false,
    });
  return { levels, marks };
}

/** The journal-timezone wall time of an instant, as a `datetime-local` value (YYYY-MM-DDTHH:mm). */
export function localInput(time: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** The instant a `datetime-local` value names in a timezone, or null when unreadable. */
export function zonedTime(local: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let time = wall;
  // Twice: the offset at the guess, then at the corrected time (a DST change in between).
  for (let i = 0; i < 2; i++) {
    const shown = zonedTimeValue(time, timeZone);
    time -= shown - wall;
  }
  return time;
}

const zonedTimeValue = (time: number, timeZone: string) => {
  const input = localInput(time, timeZone);
  return Date.parse(`${input}:00Z`);
};

const plainFormatters = new Map<string, Intl.NumberFormat>();
/** An amount that is not a result (a balance, a risk, a commission): no plus sign. */
export function fmtAmount(value: number, currency: string): string {
  let formatter = plainFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    plainFormatters.set(currency, formatter);
  }
  return formatter.format(value);
}
