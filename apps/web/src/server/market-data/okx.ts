import type { Resolution } from "@/lib/market-data";
import { quoteWeight, rankSymbols, type Listed } from "@/lib/symbol-search";
import {
  MarketDataError,
  nativeInterval,
  type MarketDataProvider,
  type SymbolMatch,
} from "./provider";
import { array, number, readJson, record, result, validateBars, windows } from "./http";
import { cachedListing } from "./listings";

/**
 * OKX public market data (API v5; no key): spot pairs and perpetual swaps, chosen by the
 * dataset. `history-candles` reaches back years, 300 candles a page. Every journal candle
 * size is a native OKX bar aligned to UTC (days and weeks with the `utc` bars).
 */
const OKX = "https://www.okx.com";

export const OKX_MARKETS = ["spot", "swap"] as const;
export type OkxMarket = (typeof OKX_MARKETS)[number];
const isOkxMarket = (value: unknown): value is OkxMarket =>
  (OKX_MARKETS as readonly unknown[]).includes(value);
const INST_TYPE: Record<OkxMarket, string> = { spot: "SPOT", swap: "SWAP" };

export const OKX_BARS: Record<Resolution, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "1d": "1Dutc",
  "1w": "1Wutc",
};

/** OKX instrument ids: BTC-USDT spot, BTC-USDT-SWAP perpetual. */
const OKX_SYMBOL = /^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}(-SWAP)?$/;

/** A v5 reply's data, or the error OKX gave. */
function dataOf(body: unknown): unknown[] {
  const reply = record(body);
  if (reply.code !== "0")
    throw new MarketDataError(
      `OKX refused the request${typeof reply.msg === "string" && reply.msg ? `: ${reply.msg.slice(0, 160)}` : ""}.`,
    );
  return array(reply.data);
}

const marketOf = (dataset: string | null | undefined): OkxMarket => {
  if (!isOkxMarket(dataset)) throw new MarketDataError("Choose an OKX market: spot or perpetuals.");
  return dataset;
};

interface Instrument extends Listed {
  state: string;
}

async function fetchListing(market: OkxMarket, signal?: AbortSignal): Promise<Instrument[]> {
  const instType = INST_TYPE[market];
  const rows = dataOf(
    await readJson(`${OKX}/api/v5/public/instruments?instType=${instType}`, {}, signal),
  ).map(record);
  const out: Instrument[] = rows
    .filter((row) => typeof row.instId === "string")
    .map((row) => {
      const [base = "", quote = ""] = String(row.instId).split("-");
      return {
        symbol: String(row.instId),
        description: `${base} / ${quote} ${market === "swap" ? "perpetual" : "spot"}`,
        aliases: base ? [base] : [],
        state: typeof row.state === "string" ? row.state : "",
        weight: quoteWeight(quote),
      };
    });
  // A day's traded value ranks the most traded first; the listing still works without it.
  try {
    const tickers = dataOf(
      await readJson(`${OKX}/api/v5/market/tickers?instType=${instType}`, {}, signal),
    ).map(record);
    const traded = new Map<string, number>();
    for (const row of tickers) {
      // Spot's 24h volume is in the quote currency; a swap's in the coin, priced by `last`.
      const value =
        market === "swap" ? number(row.volCcy24h) * number(row.last) : number(row.volCcy24h);
      if (typeof row.instId === "string" && Number.isFinite(value)) traded.set(row.instId, value);
    }
    for (const instrument of out) instrument.weight = traded.get(instrument.symbol) ?? 0;
  } catch {
    // Ranked by quote currency alone.
  }
  return out;
}

export const okx: MarketDataProvider = {
  id: "okx",
  name: "OKX",
  environmentKey: "",
  async test() {
    dataOf(await readJson(`${OKX}/api/v5/public/time`, {}, undefined, { cache: false }));
  },
  async history(request) {
    const market = marketOf(request.dataset);
    if (
      !OKX_SYMBOL.test(request.symbol) ||
      (market === "swap") !== request.symbol.endsWith("-SWAP")
    )
      throw new MarketDataError(
        market === "swap"
          ? "Use an OKX perpetual such as BTC-USDT-SWAP."
          : "Use an OKX spot pair such as BTC-USDT.",
      );
    const bar = nativeInterval(OKX_BARS, request.resolution);
    const query = new URLSearchParams({ instType: INST_TYPE[market], instId: request.symbol });
    const [instrument] = dataOf(
      await readJson(`${OKX}/api/v5/public/instruments?${query}`, {}, request.signal, {
        ttlMs: 3_600_000,
      }),
    ).map(record);
    if (!instrument)
      throw new MarketDataError(`OKX lists no ${market} instrument ${request.symbol}.`);
    const history = await windows(request, 300, async (from, to, signal) => {
      // Both bounds are exclusive: `after` returns candles older than it, `before` newer.
      const page = new URLSearchParams({
        instId: request.symbol,
        bar,
        after: String(to),
        before: String(from - 1),
        limit: "300",
      });
      return validateBars(
        dataOf(await readJson(`${OKX}/api/v5/market/history-candles?${page}`, {}, signal)).map(
          (item) => {
            const row = array(item);
            return {
              time: number(row[0]),
              open: number(row[1]),
              high: number(row[2]),
              low: number(row[3]),
              close: number(row[4]),
              // Spot volume is in the coin; a swap's in contracts, so its coin amount instead.
              volume: number(market === "swap" ? row[6] : row[5]),
            };
          },
        ),
      );
    });
    const quote =
      market === "swap"
        ? typeof instrument.settleCcy === "string"
          ? instrument.settleCcy
          : undefined
        : typeof instrument.quoteCcy === "string"
          ? instrument.quoteCcy
          : undefined;
    return result(
      this.name,
      request,
      history.bars,
      history.truncated,
      [
        market === "spot"
          ? "OKX spot prices. Quote assets such as USDT are not converted into account currency."
          : `OKX perpetual prices can differ from spot. One contract is ${String(instrument.ctVal ?? "?")} ${String(instrument.ctValCcy ?? "")}; set the contract multiplier in Settings to match the units in your fills. Volume is in the coin.`,
      ],
      quote,
    );
  },
  async symbols(query, dataset, _key, signal) {
    const market = marketOf(dataset);
    const listed = await cachedListing(`okx|${market}`, () => fetchListing(market, signal));
    return rankSymbols(
      listed.filter((instrument) => instrument.state === "live"),
      query,
    ).map(({ symbol, description }): SymbolMatch => ({ symbol, description }));
  },
};
