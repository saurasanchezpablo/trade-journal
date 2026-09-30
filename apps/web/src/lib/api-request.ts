interface PendingRequest {
  controller: AbortController;
  promise: Promise<unknown>;
  users: number;
}

const pending = new Map<string, PendingRequest>();

/**
 * Share only in-flight GETs. Completed financial data is never retained in a global cache.
 * `fresh` (a refresh after a write) never joins a read that started earlier: that read may
 * predate the write.
 */
export function acquireJson<T>(
  url: string,
  { fresh = false }: { fresh?: boolean } = {},
): { promise: Promise<T>; release: () => void } {
  let request = fresh ? undefined : pending.get(url);
  if (!request) {
    const controller = new AbortController();
    const next: PendingRequest = { controller, users: 0, promise: Promise.resolve() };
    next.promise = fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
        return body;
      })
      .finally(() => {
        if (pending.get(url) === next) pending.delete(url);
      });
    request = next;
    pending.set(url, request);
  }
  const shared = request;
  shared.users++;
  let released = false;
  return {
    promise: shared.promise as Promise<T>,
    release: () => {
      if (released) return;
      released = true;
      shared.users--;
      // React Strict Mode can immediately reattach the same subscriber.
      queueMicrotask(() => {
        if (shared.users > 0) return;
        // A fresh read may have taken its place; this one is still cancelled.
        if (pending.get(url) === shared) pending.delete(url);
        shared.controller.abort();
      });
    },
  };
}
