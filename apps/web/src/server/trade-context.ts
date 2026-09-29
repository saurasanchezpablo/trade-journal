import { eq } from "drizzle-orm";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
import { dayKeyOf } from "@luxalgo/journal-core";
import { db, tradeExcursions } from "@/db";
import { RESOLUTIONS, type Resolution } from "@/lib/market-data";
import { matchKeys, symbolKey } from "@/lib/symbol-match";
import { dayWindow } from "@/lib/day-window";
import { describeTradeMarket, tradeMarketFacts, type TradeMarketFacts } from "@/lib/trade-context";
import { listAnalyses } from "./chart-analyses";
import { candles } from "./day-price-action";
import { providerFor } from "./market-data/connections";

/**
 * Where a trade's candles come from: the market replay you loaded for it, else a chart you
 * saved on its symbol. Null when neither exists; the journal never guesses a source.
 */
export function candleSource(trade: Pick<AnnotatedTrade, "key" | "symbol" | "assetClass">) {
  const replay = db
    .select()
    .from(tradeExcursions)
    .where(eq(tradeExcursions.tradeKey, trade.key))
    .get();
  if (replay) {
    let datasetId: string | null = null;
    try {
      datasetId = (JSON.parse(replay.estimateJson) as { datasetId?: string }).datasetId ?? null;
    } catch {
      datasetId = null;
    }
    return {
      provider: replay.provider,
      symbol: replay.symbol,
      dataset:
        datasetId ??
        (replay.provider === "alpaca" && trade.assetClass === "crypto" ? "crypto" : null),
      via: "replay" as const,
    };
  }
  const key = symbolKey(trade.symbol);
  const analysis = listAnalyses({ limit: 200 }).find((a) => matchKeys(a.symbol).has(key));
  return analysis
    ? {
        provider: analysis.provider,
        symbol: analysis.symbol,
        dataset: analysis.dataset,
        via: "chart" as const,
      }
    : null;
}

const TIMEOUT_MS = 8_000;
/** Candles fetched for one trade's context, at most. */
const MAX_BARS = 1500;

/** A candle size that fits the trade in 30 to 60 candles, 1m at the finest. */
export function contextResolution(spanMs: number): Resolution {
  const sizes = (Object.entries(RESOLUTIONS) as [Resolution, number][]).filter(
    ([id]) => id !== "1w",
  );
  return (sizes.find(([, ms]) => spanMs / ms <= 60) ?? sizes[sizes.length - 1]!)[0];
}

export type TradeMarketContext =
  | { ok: true; source: string; resolution: Resolution; facts: TradeMarketFacts; text: string }
  | { ok: false; reason: string };

/** The market around a closed or open trade, from its known candle source. */
export async function tradeMarketContext(
  trade: AnnotatedTrade,
  timeZone: string,
  signal?: AbortSignal,
): Promise<TradeMarketContext> {
  const source = candleSource(trade);
  if (!source)
    return {
      ok: false,
      reason: `no candle source for ${trade.symbol}: load the trade's market replay or save a chart of it`,
    };
  const opened = Date.parse(trade.openedAt);
  const closed = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const resolution = contextResolution(Math.max(closed - opened, 60_000));
  const step = RESOLUTIONS[resolution];
  const day = dayWindow(dayKeyOf(trade.openedAt, timeZone), timeZone);
  // The entry's day so far, the trade, and some candles after the exit.
  const from = Math.max(day.from, opened - (MAX_BARS / 2) * step);
  const to = Math.min(Date.now(), closed + 30 * step, from + MAX_BARS * step);
  try {
    const bars = await candles(
      source,
      resolution,
      from,
      to,
      signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    );
    if (!bars.length) return { ok: false, reason: "the source returned no candles for the trade" };
    const input = {
      direction: trade.direction,
      avgEntry: trade.avgEntry,
      avgExit: trade.avgExit ?? null,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt ?? null,
      stopLoss: trade.annotations?.stopLoss ?? null,
      profitTarget: trade.annotations?.profitTarget ?? null,
    };
    const facts = tradeMarketFacts(input, bars, day.from, step);
    return {
      ok: true,
      source: `${source.symbol} from ${providerFor(source.provider).name}`,
      resolution,
      facts,
      text: describeTradeMarket(facts, input),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "the market data source failed",
    };
  }
}
