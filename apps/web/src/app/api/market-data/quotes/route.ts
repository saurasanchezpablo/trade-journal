import { handler, ok, requireValue } from "@/server/api";
import { watchQuotes } from "@/server/market-data/quotes";
import { requireDataset, requireSymbol } from "@/server/market-data/request-checks";
import { MAX_WATCH_ITEMS, type WatchItem } from "@/lib/watchlist";

const PROVIDER = /^[a-z0-9-]{1,40}$/;

/**
 * Latest prices for the watchlist: `{ items: [{ provider, dataset?, symbol }] }` (at most
 * 40). Answers `{ quotes }` in the same order, each `{ ok: true, price, previousClose,
 * change, changePct, time }` or `{ ok: false, error }`.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { items?: unknown } | null;
  requireValue(
    Array.isArray(body?.items) && body.items.length <= MAX_WATCH_ITEMS,
    `Send at most ${MAX_WATCH_ITEMS} symbols.`,
  );
  const items: WatchItem[] = (body!.items as unknown[]).map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    requireValue(
      typeof item.provider === "string" && PROVIDER.test(item.provider),
      "Choose a market data provider.",
    );
    return {
      provider: item.provider,
      dataset: requireDataset(item.dataset),
      symbol: requireSymbol(item.symbol),
    };
  });
  return ok({ quotes: await watchQuotes(items, request.signal) });
});
