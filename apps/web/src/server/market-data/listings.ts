/**
 * Instrument listings for the chart's symbol search, fetched from a source at most once an
 * hour per key (a listing changes when an exchange lists or delists, not by the minute). A
 * failed fetch is tried again on the next search rather than kept.
 */
const TTL_MS = 3_600_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

export function cachedListing<T>(key: string, fetch: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = fetch();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Forget every listing (tests). */
export const resetListings = () => cache.clear();
