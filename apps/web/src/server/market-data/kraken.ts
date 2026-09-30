import { RESOLUTIONS, type Resolution } from "@/lib/market-data";
import { quoteWeight, rankSymbols, type Listed } from "@/lib/symbol-search";
import { MarketDataError, nativeInterval, type MarketDataProvider } from "./provider";
import { array, number, readJson, record, result, validateBars } from "./http";
import { cachedListing } from "./listings";

/**
 * Kraken's public market data (no key): crypto pairs and a dozen major currency pairs
 * (EUR/USD, GBP/USD, USD/JPY...). Its OHLC endpoint only ever returns the latest 720
 * candles of a size, so older candles are unavailable: a request reaching past them is
 * marked truncated rather than served partly.
 */
const KRAKEN = "https://api.kraken.com";

/** Native Kraken intervals, in minutes. 3m, 2h and 1w are built from finer candles. */
export const KRAKEN_INTERVALS: Partial<Record<Resolution, string>> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "1440",
};

const KRAKEN_SYMBOL = /^[A-Z0-9]{2,12}\/?[A-Z0-9]{2,12}$/;

interface Pair extends Listed {
  /** The pair's id in replies (ZEURZUSD) and its request name (EURUSD). */
  key: string;
  /** The pair as Kraken writes it for people (EUR/USD), without the slash. */
  plain: string;
  quote: string;
  status: string;
}

function resultOf(body: unknown): Record<string, unknown> {
  const reply = record(body);
  const errors = Array.isArray(reply.error) ? reply.error : [];
  if (errors.length)
    throw new MarketDataError(`Kraken refused the request: ${String(errors[0]).slice(0, 160)}.`);
  return record(reply.result);
}

const pairs = (signal?: AbortSignal) =>
  cachedListing("kraken|pairs", async (): Promise<Pair[]> => {
    const listed = resultOf(await readJson(`${KRAKEN}/0/public/AssetPairs`, {}, signal));
    return Object.entries(listed).flatMap(([key, value]) => {
      const row = record(value);
      if (typeof row.altname !== "string" || typeof row.wsname !== "string") return [];
      const [base = "", quote = ""] = row.wsname.split("/");
      return [
        {
          symbol: row.altname,
          key,
          plain: row.wsname.replace("/", ""),
          quote,
          status: typeof row.status === "string" ? row.status : "",
          description: `${row.wsname} spot`,
          // XBT is Kraken's name for bitcoin.
          aliases: [base, base === "XBT" ? "BTC" : "", row.wsname.replace("/", "")].filter(Boolean),
          weight: quoteWeight(quote),
        },
      ];
    });
  });

/** A Kraken pair for a symbol written as its name (EURUSD), with a slash, or as BTC for XBT. */
export async function krakenPair(symbol: string, signal?: AbortSignal): Promise<Pair | null> {
  const wanted = symbol.toUpperCase().replace("/", "").replace(/^BTC/, "XBT");
  return (
    (await pairs(signal)).find(
      (pair) => pair.symbol === wanted || pair.key === wanted || pair.plain === wanted,
    ) ?? null
  );
}

export const kraken: MarketDataProvider = {
  id: "kraken",
  name: "Kraken",
  environmentKey: "",
  async test() {
    resultOf(await readJson(`${KRAKEN}/0/public/Time`, {}, undefined, { cache: false }));
  },
  async history(request) {
    if (!KRAKEN_SYMBOL.test(request.symbol.toUpperCase()))
      throw new MarketDataError("Use a Kraken pair such as EURUSD or XBTUSD.");
    if (request.dataset)
      throw new MarketDataError("Kraken uses spot candles; leave the dataset blank.");
    const interval = nativeInterval(KRAKEN_INTERVALS as Record<string, string>, request.resolution);
    const pair = await krakenPair(request.symbol, request.signal);
    if (!pair) throw new MarketDataError(`Kraken lists no pair ${request.symbol}.`);
    const step = RESOLUTIONS[request.resolution];
    const query = new URLSearchParams({
      pair: pair.symbol,
      interval,
      since: String(Math.floor(request.from / 1000) - 1),
    });
    const reply = resultOf(await readJson(`${KRAKEN}/0/public/OHLC?${query}`, {}, request.signal));
    const rows = array(reply[pair.key] ?? Object.values(reply).find(Array.isArray));
    const bars = validateBars(
      rows.map((item) => {
        const row = array(item);
        return {
          time: number(row[0]) * 1000,
          open: number(row[1]),
          high: number(row[2]),
          low: number(row[3]),
          close: number(row[4]),
          volume: number(row[6]),
        };
      }),
    );
    // Kraken keeps only its latest 720 candles: a start before the oldest one it sent is gone.
    const oldest = bars[0]?.time ?? Infinity;
    const truncated = request.from < oldest - step && request.to > oldest;
    if (request.to <= oldest)
      throw new MarketDataError(
        `Kraken only serves its latest 720 ${request.resolution} candles, which start after this range. Choose a coarser resolution or another source.`,
      );
    return result(
      this.name,
      request,
      bars,
      truncated,
      [
        `Kraken spot prices, the latest 720 candles of each size only. ${pair.description.replace(" spot", "")} is quoted in ${pair.quote}; it is not converted into account currency.`,
      ],
      pair.quote,
    );
  },
  async symbols(query, _dataset, _key, signal) {
    const listed = (await pairs(signal)).filter((pair) => pair.status === "online");
    return rankSymbols(listed, query).map(({ symbol, description }) => ({ symbol, description }));
  },
};
