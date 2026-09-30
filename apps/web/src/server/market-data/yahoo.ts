import { RESOLUTIONS, type MarketBar, type Resolution } from "@/lib/market-data";
import { MarketDataError, type MarketDataProvider, type SymbolMatch } from "./provider";
import { readJson, record, result, validateBars } from "./http";

/**
 * Yahoo Finance's chart data (no key, not an official API: Yahoo throttles it and refuses
 * some networks outright, and it can change). The widest keyless coverage: stocks and ETFs
 * on most exchanges, indices (^GSPC), futures (ES=F, a continuous front month), currency
 * pairs (EURUSD=X) and crypto (BTC-USD). Intraday candles only reach back so far: 1m for 30
 * days, 5m to 30m for 60 days, 1h for two years; daily candles for the whole history.
 * Prices are split adjusted, regular session only.
 */
const YAHOO = "https://query1.finance.yahoo.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; TradeJournal/1.0)" };
const DAY = RESOLUTIONS["1d"];

/** Native Yahoo intervals, and how far back each is kept. 3m, 2h, 4h and 1w are built. */
export const YAHOO_INTERVALS: Partial<Record<Resolution, { interval: string; keptMs: number }>> = {
  "1m": { interval: "1m", keptMs: 30 * DAY },
  "5m": { interval: "5m", keptMs: 60 * DAY },
  "15m": { interval: "15m", keptMs: 60 * DAY },
  "30m": { interval: "30m", keptMs: 60 * DAY },
  "1h": { interval: "60m", keptMs: 730 * DAY },
  "1d": { interval: "1d", keptMs: Infinity },
};
/** Yahoo refuses more than a week of 1m candles in one request. */
const ONE_MINUTE_PAGE = 7 * DAY;

const YAHOO_SYMBOL = /^[A-Z0-9^][A-Z0-9^=.\-&]{0,24}$/i;

/** Minor-unit currencies Yahoo quotes some exchanges in (London in pence). */
const MINOR_UNITS: Record<string, string> = {
  GBp: "pence (GBX)",
  GBX: "pence (GBX)",
  ZAc: "South African cents",
  ILA: "agorot",
};

/** The exchange-local date of a daily candle, as that day's 00:00 UTC (a journal day). */
function tradingDay(seconds: number, timeZone: string | null, gmtoffset: number): number {
  try {
    if (timeZone) {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(seconds * 1000));
      const parsed = Date.parse(`${date}T00:00:00Z`);
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch {
    // An unknown zone name falls back to the offset Yahoo sent.
  }
  return Math.floor((seconds + gmtoffset) / 86_400) * DAY;
}

/** Turn one chart reply into candles, skipping the gaps Yahoo leaves as nulls. */
export function yahooBars(body: unknown, daily: boolean): { bars: MarketBar[]; currency?: string } {
  const chart = record(record(body).chart);
  const error = chart.error && typeof chart.error === "object" ? record(chart.error) : null;
  if (error)
    throw new MarketDataError(
      `Yahoo Finance: ${String(error.description ?? error.code ?? "no data").slice(0, 160)}.`,
    );
  const [first] = Array.isArray(chart.result) ? chart.result : [];
  if (!first) return { bars: [] };
  const data = record(first);
  const meta = data.meta && typeof data.meta === "object" ? record(data.meta) : {};
  const times = Array.isArray(data.timestamp) ? data.timestamp : [];
  const indicators = data.indicators ? record(data.indicators) : {};
  const quote =
    Array.isArray(indicators.quote) && indicators.quote[0] ? record(indicators.quote[0]) : {};
  const column = (name: string) => (Array.isArray(quote[name]) ? (quote[name] as unknown[]) : []);
  const [open, high, low, close, volume] = ["open", "high", "low", "close", "volume"].map(column);
  const zone = typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : null;
  const offset = typeof meta.gmtoffset === "number" ? meta.gmtoffset : 0;
  const bars: MarketBar[] = [];
  times.forEach((stamp, i) => {
    const values = [open![i], high![i], low![i], close![i]];
    if (typeof stamp !== "number" || values.some((v) => typeof v !== "number")) return;
    const [o, h, l, c] = values as number[];
    bars.push({
      time: daily ? tradingDay(stamp, zone, offset) : stamp * 1000,
      open: o!,
      // Yahoo rounds a candle's extremes on their own; keep them around its open and close.
      high: Math.max(h!, o!, c!),
      low: Math.min(l!, o!, c!),
      close: c!,
      volume: typeof volume![i] === "number" ? (volume![i] as number) : 0,
    });
  });
  return {
    bars: validateBars(bars),
    currency: typeof meta.currency === "string" ? meta.currency : undefined,
  };
}

/** Yahoo's throttling reads as an ordinary rate limit; say what it means here. */
async function readYahoo(url: string, signal?: AbortSignal, options = {}) {
  try {
    return await readJson(url, HEADERS, signal, options);
  } catch (error) {
    if (error instanceof MarketDataError && /rate limit|denied/i.test(error.message))
      throw new MarketDataError(
        "Yahoo Finance is refusing requests from this network right now (it throttles unofficial use, and blocks some networks outright). Try again later or use another source.",
      );
    throw error;
  }
}

export const yahoo: MarketDataProvider = {
  id: "yahoo",
  name: "Yahoo Finance",
  environmentKey: "",
  async test() {
    yahooBars(
      await readYahoo(`${YAHOO}/v8/finance/chart/AAPL?interval=1d&range=5d`, undefined, {
        cache: false,
      }),
      true,
    );
  },
  async history(request) {
    if (!YAHOO_SYMBOL.test(request.symbol))
      throw new MarketDataError(
        "Use a Yahoo Finance symbol such as AAPL, VOD.L, ^GSPC, ES=F, EURUSD=X or BTC-USD.",
      );
    if (request.dataset)
      throw new MarketDataError("Yahoo Finance has one feed; leave the dataset blank.");
    const native = YAHOO_INTERVALS[request.resolution];
    if (!native)
      throw new MarketDataError(`Yahoo Finance does not serve ${request.resolution} candles.`);
    const daily = request.resolution === "1d";
    const earliest = Date.now() - native.keptMs + 3_600_000;
    if (request.to <= earliest)
      throw new MarketDataError(
        `Yahoo Finance keeps ${request.resolution} candles for ${Math.round(native.keptMs / DAY)} days only. Choose ${request.resolution === "1h" ? "1d" : "1h or 1d"} for an older trade.`,
      );
    const from = Math.max(request.from, earliest);
    const pages: { from: number; to: number }[] = [];
    const span = request.resolution === "1m" ? ONE_MINUTE_PAGE : Infinity;
    for (let start = from; start < request.to; start += span)
      pages.push({ from: start, to: Math.min(start + span, request.to) });
    let currency: string | undefined;
    const bars: MarketBar[] = [];
    for (const page of pages) {
      const query = new URLSearchParams({
        interval: native.interval,
        // A daily request starts a day early: Yahoo stamps a day at the exchange's opening.
        period1: String(Math.floor((page.from - (daily ? DAY : 0)) / 1000)),
        period2: String(Math.ceil(page.to / 1000)),
        includePrePost: "false",
      });
      const reply = yahooBars(
        await readYahoo(
          `${YAHOO}/v8/finance/chart/${encodeURIComponent(request.symbol)}?${query}`,
          request.signal,
        ),
        daily,
      );
      currency ??= reply.currency;
      bars.push(...reply.bars);
    }
    const minor = currency ? MINOR_UNITS[currency] : undefined;
    return result(
      this.name,
      request,
      bars,
      request.from < earliest,
      [
        "Yahoo Finance prices (unofficial, split adjusted, regular session). A future such as ES=F is the continuous front month, not a particular contract.",
        ...(minor ? [`Prices are in ${minor}, not the main currency unit.`] : []),
        ...(request.from < earliest
          ? [
              `Yahoo Finance keeps ${request.resolution} candles for ${Math.round(native.keptMs / DAY)} days; earlier ones are missing.`,
            ]
          : []),
      ],
      minor ? undefined : currency,
    );
  },
  async symbols(query, _dataset, _key, signal) {
    const q = query.trim();
    if (!q) return [];
    const params = new URLSearchParams({
      q,
      quotesCount: "20",
      newsCount: "0",
      listsCount: "0",
    });
    const reply = record(
      await readYahoo(`${YAHOO}/v1/finance/search?${params}`, signal, { ttlMs: 3_600_000 }),
    );
    const quotes = Array.isArray(reply.quotes) ? reply.quotes.map(record) : [];
    return quotes
      .filter((row) => typeof row.symbol === "string" && row.isYahooFinance !== false)
      .map((row): SymbolMatch => ({
        symbol: String(row.symbol),
        description: [row.shortname ?? row.longname, row.quoteType, row.exchDisp]
          .filter((part) => typeof part === "string" && part)
          .join(" · "),
      }));
  },
};
