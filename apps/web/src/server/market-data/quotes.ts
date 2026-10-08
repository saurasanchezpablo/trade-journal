import { quoteFrom, type QuoteResult, type WatchItem } from "@/lib/watchlist";
import { connectionKey, providerFor } from "./connections";
import { latestCandles } from "./latest";
import { MarketDataError } from "./provider";

/**
 * Latest prices for the watchlist: each symbol's last two daily candles (the forming one is
 * the current price). Answers are kept a few seconds, so several open pages share them, and
 * at most a few symbols are asked of the sources at once. One symbol that fails (unknown,
 * a source not enabled, a source error) answers its own error and never fails the others.
 */
const FRESH_MS = 15_000;
const CONCURRENCY = 4;
/** One source request; kept answers are shared, so no one page's request cancels them. */
const TIMEOUT_MS = 15_000;
const cache = new Map<string, { at: number; value: Promise<QuoteResult> }>();

/** Network access, replaced in tests. */
export const quoteDeps = { latest: latestCandles, now: () => Date.now() };

const keyOf = (item: WatchItem) => `${item.provider}|${item.dataset ?? ""}|${item.symbol}`;

async function fetchQuote(item: WatchItem): Promise<QuoteResult> {
  try {
    // Candle files rarely hold daily candles; they have no live price to show.
    if (item.provider === "market-csv")
      return { ok: false, error: "Candle files have no live price." };
    const provider = providerFor(item.provider);
    const history = await quoteDeps.latest(
      {
        provider,
        symbol: item.symbol,
        dataset: item.dataset ?? undefined,
        resolution: "1d",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        key: connectionKey(provider.id),
      },
      quoteDeps.now(),
      2,
    );
    const quote = quoteFrom(history.bars);
    return quote ? { ok: true, ...quote } : { ok: false, error: "No price for this symbol." };
  } catch (error) {
    // Source messages are written for people (MarketDataError); anything else is not shown.
    return {
      ok: false,
      error: error instanceof MarketDataError ? error.message : "The price could not be read.",
    };
  }
}

function cachedQuote(item: WatchItem): Promise<QuoteResult> {
  const key = keyOf(item);
  const now = quoteDeps.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < FRESH_MS) return hit.value;
  const value = fetchQuote(item);
  cache.set(key, { at: now, value });
  // A failure is asked again next time rather than kept.
  void value.then((result) => {
    if (!result.ok && cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Quotes for the items, in their order; a page that goes away stops asking for more. */
export async function watchQuotes(
  items: readonly WatchItem[],
  signal: AbortSignal,
): Promise<QuoteResult[]> {
  const out: QuoteResult[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const index = next++;
      out[index] = await cachedQuote(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out.map((r) => r ?? { ok: false, error: "Cancelled." });
}

/** Forget every kept quote (tests). */
export const resetQuotes = () => cache.clear();
