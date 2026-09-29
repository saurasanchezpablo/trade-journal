import { RESOLUTIONS, type MarketBar, type MarketHistory } from "@/lib/market-data";
import { MarketDataError, type HistoryRequest } from "./provider";
import { marketTransport } from "./transport";

export const MAX_BARS = 20_000;
export const MAX_PAGES = 80;
export const number = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
export function validateBars(bars: MarketBar[]): MarketBar[] {
  const unique = new Map<number, MarketBar>();
  for (const bar of bars) {
    if (
      !Object.values(bar).every(Number.isFinite) ||
      !Number.isSafeInteger(bar.time) ||
      bar.time < 0 ||
      bar.volume < 0 ||
      bar.low > Math.min(bar.open, bar.close) ||
      bar.high < Math.max(bar.open, bar.close) ||
      bar.low > bar.high
    )
      throw new MarketDataError("Invalid OHLCV candle. Estimates were not calculated.");
    const prior = unique.get(bar.time);
    if (prior && JSON.stringify(prior) !== JSON.stringify(bar))
      throw new MarketDataError("Conflicting candles at the same timestamp.");
    unique.set(bar.time, bar);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export const boundedSignal = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000);
export async function readJson(
  url: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal,
  options: { cache?: boolean; timeoutMs?: number; ttlMs?: number } = {},
): Promise<unknown> {
  try {
    return await marketTransport.read(url, headers, signal, options);
  } catch (error) {
    if (error instanceof MarketDataError) throw error;
    throw new MarketDataError("Market data request failed or timed out. Try again.");
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MarketDataError("Unexpected market data response.");
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new MarketDataError("Unexpected market data candle list.");
  return value;
}
export function credentials(key: string): Record<string, string> {
  try {
    return record(JSON.parse(key)) as Record<string, string>;
  } catch {
    throw new MarketDataError("Save this provider's credentials again in Settings.");
  }
}
export function result(
  name: string,
  request: HistoryRequest,
  bars: MarketBar[],
  truncated: boolean,
  warnings: string[],
  quoteCurrency?: string,
): MarketHistory {
  const step = RESOLUTIONS[request.resolution];
  const now = Date.now();
  const rows = validateBars(bars).filter(
    (bar) =>
      bar.time < request.to &&
      bar.time + step > request.from &&
      (request.forming ? bar.time <= now : bar.time + step <= now),
  );
  return {
    provider: name,
    symbol: request.symbol,
    resolution: request.resolution,
    // Past the cap, the newest candles matter most (a chart's); estimates refuse it anyway.
    bars: rows.slice(-MAX_BARS),
    fetchedAt: new Date().toISOString(),
    truncated: truncated || rows.length > MAX_BARS,
    quoteCurrency,
    warnings: [
      ...warnings,
      ...(truncated || rows.length > MAX_BARS
        ? [
            "History reached a request limit. Choose a coarser resolution; incomplete history cannot produce estimates.",
          ]
        : []),
    ],
  };
}

/** Pages of one history request fetched at once; the transport still paces each host. */
export const PAGE_CONCURRENCY = 4;

/**
 * Fixed time windows below each API's candle cap, including empty sessions. Windows sit on
 * a grid of whole pages from the epoch, not from the request's start, so the same page is
 * the same URL from one request to the next and older pages come from the transport's cache
 * (a chart reopened, or a timeframe switched back). Pages are fetched a few at a time.
 */
export async function windows(
  request: HistoryRequest,
  size: number,
  read: (from: number, to: number, signal: AbortSignal) => Promise<MarketBar[]>,
) {
  const step = RESOLUTIONS[request.resolution];
  const from = Math.floor(request.from / step) * step;
  const end = Math.ceil(request.to / step) * step;
  const page = size * step;
  const first = Math.floor(from / page);
  const last = Math.ceil(end / page) - 1;
  const total = Math.max(0, last - first + 1);
  // The newest pages matter most (a chart shows the end first): beyond the caps, the oldest go.
  const count = Math.min(total, MAX_PAGES, Math.ceil(MAX_BARS / size) + 1);
  const wanted: { from: number; to: number }[] = [];
  for (let index = last - count + 1; index <= last; index += 1)
    wanted.push({ from: Math.max(index * page, from), to: Math.min((index + 1) * page, end) });
  const signal = boundedSignal(request.signal);
  const results: MarketBar[][] = new Array(wanted.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PAGE_CONCURRENCY, wanted.length) }, async () => {
      while (next < wanted.length) {
        const index = next++;
        const span = wanted[index]!;
        const rows = await read(span.from, span.to, signal);
        if (rows.some((bar) => bar.time % step !== 0))
          throw new MarketDataError("Provider returned candles at an unexpected resolution.");
        results[index] = rows.filter((bar) => bar.time >= span.from && bar.time < span.to);
      }
    }),
  );
  const bars = results.flat().slice(-MAX_BARS);
  return { bars, truncated: count < total || results.flat().length > MAX_BARS };
}
