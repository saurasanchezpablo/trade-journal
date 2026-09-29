import type { AnnotatedTrade } from "@luxalgo/journal-core";
import type { Resolution } from "@/lib/market-data";
import { baseOf, pickInstrument } from "@/lib/instrument-match";
import { connectionKey, connections, providerFor } from "./market-data/connections";
import { candleSource, contextResolution } from "./trade-context";

/**
 * Where a trade page gets its candles without being told: the market replay you loaded for
 * the trade before, else a chart you saved on its symbol, else an enabled public crypto
 * exchange that lists the coin (Binance, then Bybit's perpetuals and spot, then Coinbase),
 * matched however the symbol was written. Null, with the reason, when none fits: the page
 * then asks you to choose, as before.
 */

export interface TradeMarketSource {
  provider: string;
  providerName: string;
  symbol: string;
  dataset: string | null;
  resolution: Resolution;
  /** How it was chosen, for the page to say. */
  via: "replay" | "chart" | "exchange";
}

const CRYPTO_SOURCES: { provider: string; datasets: (string | null)[] }[] = [
  { provider: "binance", datasets: [null] },
  { provider: "bybit", datasets: ["linear", "spot"] },
  { provider: "coinbase", datasets: [null] },
];

/** Asset classes a coin can be booked under (a broker's BTCUSD CFD is still bitcoin). */
const COIN_CLASSES = new Set([undefined, null, "crypto", "cfd", "other", "forex"]);

export async function tradeMarketSource(
  trade: Pick<AnnotatedTrade, "key" | "symbol" | "assetClass" | "openedAt" | "closedAt">,
  signal?: AbortSignal,
): Promise<{ source: TradeMarketSource } | { source: null; reason: string }> {
  const opened = Date.parse(trade.openedAt);
  const closed = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const resolution = contextResolution(Math.max(closed - opened, 60_000));
  const enabled = new Set(
    connections()
      .filter((c) => c.configured)
      .map((c) => c.id),
  );
  const known = candleSource(trade);
  if (known && enabled.has(known.provider))
    return {
      source: {
        provider: known.provider,
        providerName: providerFor(known.provider).name,
        symbol: known.symbol,
        dataset: known.dataset,
        resolution,
        via: known.via,
      },
    };
  if (!COIN_CLASSES.has(trade.assetClass as string | undefined))
    return {
      source: null,
      reason: "Choose a data provider and the provider's symbol for this instrument.",
    };
  const coin = baseOf(trade.symbol);
  const usable = CRYPTO_SOURCES.filter((s) => enabled.has(s.provider));
  if (!usable.length)
    return {
      source: null,
      reason:
        "Enable Binance, Bybit or Coinbase in Settings → Market data to see this trade's candles here.",
    };
  for (const { provider: id, datasets } of usable) {
    const provider = providerFor(id);
    if (!provider.symbols) continue;
    for (const dataset of datasets) {
      try {
        const listed = await provider.symbols(coin, dataset, connectionKey(id), signal);
        const symbol = pickInstrument(
          trade.symbol,
          listed.map((m) => m.symbol),
        );
        if (symbol)
          return {
            source: {
              provider: id,
              providerName: provider.name,
              symbol,
              dataset,
              resolution,
              via: "exchange",
            },
          };
      } catch {
        // A source that can't list right now is skipped; the next one may.
      }
    }
  }
  return {
    source: null,
    reason: `No enabled exchange lists ${trade.symbol}. Choose a data provider and its symbol below.`,
  };
}
