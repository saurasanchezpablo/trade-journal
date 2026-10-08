import type { MarketBar } from "./market-data";

/**
 * The charts watchlist: your starred symbols with their latest price and its change since
 * the previous daily close, as TradingView lists them. Membership is the star on a symbol
 * (chart settings, saved on the server); prices come from `POST /api/market-data/quotes`.
 */
export interface WatchItem {
  provider: string;
  /** The source's market (Bybit spot, Alpaca IEX…), when it has several. */
  dataset: string | null;
  symbol: string;
}

export interface Quote {
  price: number;
  /** The previous daily candle's close, or null when there is only one candle. */
  previousClose: number | null;
  change: number | null;
  /** As a fraction (0.0123 = +1.23 %). */
  changePct: number | null;
  /** The latest candle's open time. */
  time: number;
}

export type QuoteResult = ({ ok: true } & Quote) | { ok: false; error: string };

export const MAX_WATCH_ITEMS = 40;

/** One item's identity, as quotes are keyed. */
export const watchKey = (item: WatchItem) =>
  `${item.provider}|${item.dataset ?? ""}|${item.symbol}`;

/** The latest price and its change from the daily candles (oldest first), or null. */
export function quoteFrom(bars: readonly MarketBar[]): Quote | null {
  const last = bars.at(-1);
  if (!last || !Number.isFinite(last.close)) return null;
  const before = bars.at(-2);
  const previousClose = before && Number.isFinite(before.close) ? before.close : null;
  const change = previousClose === null ? null : last.close - previousClose;
  return {
    price: last.close,
    previousClose,
    change,
    changePct: change === null || !previousClose ? null : change / previousClose,
    time: last.time,
  };
}

export type WatchSort = "symbol" | "price" | "change" | "changePct";

/** Rows in a column's order; rows without a quote go last either way. */
export function sortWatchRows<T extends { name: string; quote: Quote | null }>(
  rows: readonly T[],
  by: WatchSort | null,
  descending: boolean,
): T[] {
  if (!by) return [...rows];
  const value = (row: T) =>
    by === "symbol" ? row.name : row.quote ? row.quote[by === "price" ? "price" : by] : null;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
    const order =
      typeof x === "string" && typeof y === "string"
        ? x.localeCompare(y)
        : (x as number) - (y as number);
    return descending ? -order : order;
  });
}

const SHOWN_KEY = "journal-chart-watchlist-v1";

/** Whether the watchlist panel shows, remembered per browser (shown unless hidden). */
export const watchlistPreference = {
  read(): boolean {
    try {
      return localStorage.getItem(SHOWN_KEY) !== "hidden";
    } catch {
      return true;
    }
  },
  write(shown: boolean) {
    try {
      localStorage.setItem(SHOWN_KEY, shown ? "shown" : "hidden");
    } catch {
      // This page only.
    }
  },
};
