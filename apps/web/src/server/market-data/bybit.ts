import type { Resolution } from "@/lib/market-data";
import { rankSymbols, type Listed } from "@/lib/symbol-search";
import {
  MarketDataError,
  nativeInterval,
  type MarketDataProvider,
  type SymbolMatch,
} from "./provider";
import { array, number, readJson, record, result, validateBars, windows } from "./http";
import { cachedListing } from "./listings";

/**
 * Bybit's public market data (API v5; no key): candles for spot, USDT/USDC perpetuals and
 * futures ("linear") and coin-margined contracts ("inverse"), chosen by the dataset, since the
 * same symbol (BTCUSDT) trades in several. Every journal candle size is a native Bybit
 * interval, aligned to UTC (weeks from Monday).
 */
const BYBIT = "https://api.bybit.com";

export const BYBIT_CATEGORIES = ["linear", "spot", "inverse"] as const;
export type BybitCategory = (typeof BYBIT_CATEGORIES)[number];
export const isBybitCategory = (value: unknown): value is BybitCategory =>
  (BYBIT_CATEGORIES as readonly unknown[]).includes(value);

export const BYBIT_INTERVALS: Record<Resolution, string> = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "1d": "D",
  "1w": "W",
};

/** Bybit symbols: letters and digits, futures with a dash and expiry (BTC-26DEC25). */
export const BYBIT_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,39}$/;

/** A v5 reply's result, or the error Bybit gave. */
function resultOf(body: unknown): Record<string, unknown> {
  const reply = record(body);
  if (reply.retCode !== 0)
    throw new MarketDataError(
      `Bybit refused the request${typeof reply.retMsg === "string" ? `: ${reply.retMsg.slice(0, 160)}` : ""}.`,
    );
  return record(reply.result);
}

const categoryOf = (dataset: string | null | undefined): BybitCategory => {
  if (!isBybitCategory(dataset))
    throw new MarketDataError(
      "Choose a Bybit market: perpetuals and futures, spot, or inverse contracts.",
    );
  return dataset;
};

interface Instrument extends Listed {
  status: string;
  quoteCoin: string;
}

const kindOf = (category: BybitCategory, row: Record<string, unknown>) => {
  if (category === "spot") return "spot";
  const type = typeof row.contractType === "string" ? row.contractType : "";
  if (/Perpetual/i.test(type)) return category === "inverse" ? "inverse perpetual" : "perpetual";
  if (/Futures/i.test(type)) return category === "inverse" ? "inverse futures" : "futures";
  return category;
};

async function fetchListing(category: BybitCategory, signal?: AbortSignal): Promise<Instrument[]> {
  const out: Instrument[] = [];
  let cursor = "";
  // Linear lists page by cursor (up to 1000 each); a few pages cover every instrument.
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ category, limit: "1000" });
    if (cursor) query.set("cursor", cursor);
    const res = resultOf(
      await readJson(`${BYBIT}/v5/market/instruments-info?${query}`, {}, signal),
    );
    for (const item of array(res.list)) {
      const row = record(item);
      if (typeof row.symbol !== "string") continue;
      const base = typeof row.baseCoin === "string" ? row.baseCoin : "";
      const quote = typeof row.quoteCoin === "string" ? row.quoteCoin : "";
      out.push({
        symbol: row.symbol,
        description: `${base} / ${quote} ${kindOf(category, row)}`,
        aliases: base ? [base] : [],
        status: typeof row.status === "string" ? row.status : "",
        quoteCoin: quote,
      });
    }
    cursor = typeof res.nextPageCursor === "string" ? res.nextPageCursor : "";
    if (!cursor) break;
  }
  // A day's turnover ranks the most traded first; the listing still works without it.
  try {
    const tickers = resultOf(
      await readJson(`${BYBIT}/v5/market/tickers?${new URLSearchParams({ category })}`, {}, signal),
    );
    const turnover = new Map<string, number>();
    for (const item of array(tickers.list)) {
      const row = record(item);
      const value = number(row.turnover24h);
      if (typeof row.symbol === "string" && Number.isFinite(value)) turnover.set(row.symbol, value);
    }
    for (const instrument of out) instrument.weight = turnover.get(instrument.symbol) ?? 0;
  } catch {
    // Ranked by symbol alone.
  }
  return out;
}

export const bybit: MarketDataProvider = {
  id: "bybit",
  name: "Bybit",
  environmentKey: "",
  async test() {
    resultOf(await readJson(`${BYBIT}/v5/market/time`, {}, undefined, { cache: false }));
  },
  async history(request) {
    const category = categoryOf(request.dataset);
    if (!BYBIT_SYMBOL.test(request.symbol))
      throw new MarketDataError("Use a Bybit symbol such as BTCUSDT.");
    const interval = nativeInterval(BYBIT_INTERVALS, request.resolution);
    const info = resultOf(
      await readJson(
        `${BYBIT}/v5/market/instruments-info?${new URLSearchParams({ category, symbol: request.symbol })}`,
        {},
        request.signal,
      ),
    );
    const instrument = array(info.list)
      .map(record)
      .find((row) => row.symbol === request.symbol);
    if (!instrument)
      throw new MarketDataError(
        `Bybit lists no ${category === "linear" ? "perpetual or futures contract" : category} ${request.symbol}. Check the symbol and the market.`,
      );
    const history = await windows(request, 1000, async (from, to, signal) => {
      const query = new URLSearchParams({
        category,
        symbol: request.symbol,
        interval,
        start: String(from),
        end: String(to - 1),
        limit: "1000",
      });
      const res = resultOf(await readJson(`${BYBIT}/v5/market/kline?${query}`, {}, signal));
      // Newest first: validateBars sorts them.
      return validateBars(
        array(res.list).map((item) => {
          const row = array(item);
          return {
            time: number(row[0]),
            open: number(row[1]),
            high: number(row[2]),
            low: number(row[3]),
            close: number(row[4]),
            volume: number(row[5]),
          };
        }),
      );
    });
    const quote = typeof instrument.quoteCoin === "string" ? instrument.quoteCoin : undefined;
    return result(
      this.name,
      request,
      history.bars,
      history.truncated,
      [
        category === "spot"
          ? "Bybit spot prices. Quote assets such as USDT are not converted into account currency."
          : `Bybit ${category === "inverse" ? "inverse (coin-margined)" : "perpetual and futures"} prices: contract prices may differ from spot. Volume is in the contract's base units.`,
      ],
      quote,
    );
  },
  async symbols(query, dataset, _key, signal) {
    const category = categoryOf(dataset);
    const listed = await cachedListing(`bybit|${category}`, () => fetchListing(category, signal));
    const instruments = listed.filter((instrument) => instrument.status === "Trading");
    return rankSymbols(instruments, query).map(({ symbol, description }): SymbolMatch => ({
      symbol,
      description,
    }));
  },
};
