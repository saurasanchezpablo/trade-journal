import { maxSpanMs } from "@/lib/chart-analysis";
import { RESOLUTIONS, type MarketHistory, type Resolution } from "@/lib/market-data";
import { csvDatasets } from "./csv";
import type { MarketDataProvider } from "./provider";

/**
 * Reading candles for a request: one window, or the latest candles up to a moment (the
 * chart's history route and the watchlist's quotes both ask this way).
 */

/** Closed sessions (nights, weekends, holidays) hold no candles: widen by this much, a few times. */
const WIDEN = 4;
const MAX_ATTEMPTS = 4;

export type Source = {
  provider: MarketDataProvider;
  symbol: string;
  dataset?: string;
  resolution: Resolution;
  signal: AbortSignal;
  /** The source's key, checked before any request (a source not set up answers 400). */
  key: string;
};

export const fetchWindow = (r: Source, from: number, to: number) =>
  r.provider.history(
    {
      symbol: r.symbol,
      dataset: r.dataset,
      resolution: r.resolution,
      from,
      to,
      signal: r.signal,
      // A chart shows the candle still forming: its current price.
      forming: true,
    },
    r.key,
  );

/**
 * The latest `limit` candles at or before `to`. The first window assumes continuous
 * trading; when it comes back short, it widens so a Monday-morning or after-hours chart
 * still shows the last sessions. A candle file ends where its data ends, so it is read
 * back from its own last candle.
 */
export async function latestCandles(r: Source, to: number, limit: number): Promise<MarketHistory> {
  const step = RESOLUTIONS[r.resolution];
  if (r.provider.id === "market-csv") {
    const files = csvDatasets().filter(
      (d) =>
        d.symbol === r.symbol &&
        d.resolution === r.resolution &&
        (!r.dataset || d.id === r.dataset),
    );
    const end = Math.max(...files.map((d) => Date.parse(d.to)));
    if (Number.isFinite(end)) to = Math.min(to, end);
  }
  let span = limit * step;
  let history: MarketHistory | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    span = Math.min(span, maxSpanMs(r.resolution));
    history = await fetchWindow(r, to - span, to);
    if (history.bars.length >= limit || span >= maxSpanMs(r.resolution)) break;
    span *= WIDEN;
  }
  const bars = history!.bars.filter((b) => b.time <= to).slice(-limit);
  return { ...history!, bars };
}
