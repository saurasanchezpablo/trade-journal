import type { AnnotatedTrade } from "@luxalgo/journal-core";
import type { Resolution } from "@/lib/market-data";
import { baseOf, pickInstrument } from "@/lib/instrument-match";
import { forexPair, publicCandidates, servableResolution } from "@/lib/market-symbols";
import { connectionKey, connections, providerFor } from "./market-data/connections";
import { candleSource, contextResolution } from "./trade-context";

/**
 * Where a trade page gets its candles without being told: the market replay you loaded for
 * the trade before, else a chart you saved on its symbol, else an enabled keyless source
 * that lists the instrument: for a currency pair Yahoo Finance then Kraken; for a coin
 * Binance, then Bybit's perpetuals and spot, then Coinbase, matched however the symbol was
 * written; for a stock or ETF Yahoo Finance, then Nasdaq for daily candles; for a future
 * Yahoo's continuous front month. Null, with the reason, when none fits: the page then asks
 * you to choose, as before.
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

/** Asset classes a currency pair can be booked under. */
const FOREX_CLASSES = new Set([undefined, null, "forex", "cfd"]);
const PUBLIC_NAMES = { yahoo: "Yahoo Finance", kraken: "Kraken", nasdaq: "Nasdaq" } as const;

/**
 * The first enabled keyless source that lists a currency pair, stock, ETF or future, at the
 * finest candle size it still keeps for the trade.
 */
async function listedPublic(
  trade: Pick<AnnotatedTrade, "symbol" | "assetClass">,
  wanted: Resolution,
  opened: number,
  enabled: Set<string>,
  signal?: AbortSignal,
): Promise<{ source: TradeMarketSource } | { source: null; reason: string }> {
  const candidates = publicCandidates(trade.symbol, trade.assetClass, wanted === "1d");
  if (!candidates.length)
    return {
      source: null,
      reason: "Choose a data provider and the provider's symbol for this instrument.",
    };
  const usable = candidates.filter((c) => enabled.has(c.provider));
  if (!usable.length)
    return {
      source: null,
      reason: `Enable ${[...new Set(candidates.map((c) => PUBLIC_NAMES[c.provider]))].join(" or ")} in Settings → Market data to see this trade's candles here.`,
    };
  for (const candidate of usable) {
    const resolution = servableResolution(candidate.provider, wanted, opened);
    const provider = providerFor(candidate.provider);
    if (!resolution || !provider.symbols) continue;
    try {
      const listed = await provider.symbols(
        candidate.symbol,
        candidate.dataset,
        connectionKey(candidate.provider),
        signal,
      );
      if (listed.some((m) => m.symbol.toUpperCase() === candidate.symbol.toUpperCase()))
        return {
          source: {
            provider: candidate.provider,
            providerName: provider.name,
            symbol: candidate.symbol,
            dataset: candidate.dataset,
            resolution,
            via: "exchange",
          },
        };
    } catch {
      // A source that can't answer right now is skipped; the next one may.
    }
  }
  return {
    source: null,
    reason: `No enabled source lists ${trade.symbol} with candles this far back. Choose a data provider and its symbol below.`,
  };
}

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
  // A currency pair is forex, even where a crypto exchange lists a coin of that name.
  const pair = forexPair(trade.symbol);
  if (pair && FOREX_CLASSES.has(trade.assetClass as string | undefined))
    return listedPublic(trade, resolution, opened, enabled, signal);
  if (!COIN_CLASSES.has(trade.assetClass as string | undefined))
    return listedPublic(trade, resolution, opened, enabled, signal);
  const coin = baseOf(trade.symbol);
  const usable = CRYPTO_SOURCES.filter((s) => enabled.has(s.provider));
  // A trade booked without an asset class may be a stock: when no exchange lists it as a
  // coin, a stock source that lists this exact ticker is used; else the coin's answer stands.
  const asStock = async (answer: { source: null; reason: string }) => {
    if (trade.assetClass) return answer;
    const stock = await listedPublic(
      { symbol: trade.symbol, assetClass: "equity" },
      resolution,
      opened,
      enabled,
      signal,
    );
    return stock.source ? stock : answer;
  };
  if (!usable.length)
    return asStock({
      source: null,
      reason:
        "Enable Binance, Bybit or Coinbase in Settings → Market data to see this trade's candles here.",
    });
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
  return asStock({
    source: null,
    reason: `No enabled exchange lists ${trade.symbol}. Choose a data provider and its symbol below.`,
  });
}
