import { bad, handler, ok, requireValue } from "@/server/api";
import { connectionKey } from "@/server/market-data/connections";
import { requireDataset, requireProvider } from "@/server/market-data/request-checks";
import { MarketDataError } from "@/server/market-data/provider";

/**
 * Instruments a source lists that match `q`, for the chart's symbol search:
 * `?provider=bybit&dataset=linear&q=eth`. Sources without a listing answer an empty list.
 */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const provider = requireProvider(params.get("provider"));
  const dataset = requireDataset(params.get("dataset") ?? undefined);
  const query = (params.get("q") ?? "").trim();
  requireValue(query.length <= 40 && !/[\x00-\x1f]/.test(query), "Search for a shorter symbol.");
  if (!provider.symbols || !query) return ok({ symbols: [] });
  try {
    // Same gate as history: a public source must be enabled in Settings first.
    const key = connectionKey(provider.id);
    return ok({ symbols: await provider.symbols(query, dataset, key, request.signal) });
  } catch (error) {
    if (error instanceof MarketDataError) return bad(error.message, 502);
    throw error;
  }
});
