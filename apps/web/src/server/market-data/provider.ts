import type { MarketHistory, Resolution } from "@/lib/market-data";

export interface HistoryRequest {
  symbol: string;
  dataset?: string;
  resolution: Resolution;
  from: number;
  to: number;
  signal?: AbortSignal;
  /**
   * Keep the candle still forming (a live chart's current price). Off by default: estimates
   * and reviews use finished candles only.
   */
  forming?: boolean;
}

/** One instrument a source lists, for the chart's symbol search. */
export interface SymbolMatch {
  /** The exact symbol to open. */
  symbol: string;
  /** What it is, in words (`BTC / USDT perpetual`). */
  description: string;
}

/** Adapters supply data only. Chart rendering and analytics do not depend on an adapter. */
export interface MarketDataProvider {
  id: string;
  name: string;
  environmentKey: string;
  history(request: HistoryRequest, apiKey: string): Promise<MarketHistory>;
  test(apiKey: string): Promise<void>;
  /** Instruments matching a search, best first; sources without a listing omit it. */
  symbols?(
    query: string,
    dataset: string | null,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<SymbolMatch[]>;
}

export class MarketDataError extends Error {}

/**
 * An adapter's name for a candle size it serves directly. Other sizes never reach an
 * adapter: `withAggregation` builds them from a finer size first.
 */
export function nativeInterval(map: Record<string, string>, resolution: string): string {
  const interval = map[resolution];
  if (!interval) throw new MarketDataError(`This source does not serve ${resolution} candles.`);
  return interval;
}
