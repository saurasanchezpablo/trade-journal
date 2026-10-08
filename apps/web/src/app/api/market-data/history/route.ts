import { bad, handler, ok, requireValue } from "@/server/api";
import { configuredKey } from "@/server/market-data/configured-key";
import {
  requireDataset,
  requireProvider,
  requireSymbol,
} from "@/server/market-data/request-checks";
import { MarketDataError } from "@/server/market-data/provider";
import { fetchWindow, latestCandles, type Source } from "@/server/market-data/latest";
import { isResolution, type Resolution } from "@/lib/market-data";
import { maxSpanMs } from "@/lib/chart-analysis";

const MAX_LIMIT = 5_000;

/**
 * Candles for a symbol, independent of any trade: an explicit `from`/`to` window, or the
 * latest `limit` candles up to `to`. Only an open chart asks; results are not stored.
 */
export const POST = handler(async (request: Request) => {
  const body = await request.json();
  requireValue(body, "Choose a market data provider.");
  const provider = requireProvider(body.provider);
  const symbol = requireSymbol(body.symbol);
  const dataset = requireDataset(body.dataset);
  requireValue(isResolution(body.resolution), "Choose a supported candle resolution.");
  const resolution = body.resolution as Resolution;
  const { from, to, limit } = body as { from: unknown; to: unknown; limit: unknown };
  requireValue(Number.isSafeInteger(to), "Choose the end of the history window.");
  const end = Math.min(to as number, Date.now());
  const r: Source = {
    provider,
    symbol,
    dataset: dataset || undefined,
    resolution,
    signal: request.signal,
    key: configuredKey(provider.id),
  };
  try {
    if (limit !== undefined) {
      requireValue(
        Number.isSafeInteger(limit) && (limit as number) > 0 && (limit as number) <= MAX_LIMIT,
        `Request between 1 and ${MAX_LIMIT} candles.`,
      );
      return ok(await latestCandles(r, end, limit as number));
    }
    requireValue(
      Number.isSafeInteger(from) && (from as number) < (to as number),
      "Choose a start date before the end date.",
    );
    requireValue((from as number) < Date.now(), "Choose a start date in the past.");
    requireValue(
      (to as number) - (from as number) <= maxSpanMs(resolution),
      "That range holds more than 20,000 candles. Shorten it or choose a coarser resolution.",
    );
    return ok(await fetchWindow(r, from as number, end));
  } catch (error) {
    if (error instanceof MarketDataError) return bad(error.message, 502);
    throw error;
  }
});
