import { createHash } from "node:crypto";
import { MarketDataError } from "./provider";

type Job = { host: string; signal: AbortSignal; start: () => void; reject: () => void };
type Entry = { value: unknown; expires: number; bytes: number };
type Flight = { controller: AbortController; promise: Promise<unknown>; users: number };

/**
 * How hard each exchange's public API may be asked: requests at once and the gap between
 * starts. Well under their published limits (Binance: 6000 weight a minute, a candle page
 * weighs 2; Bybit: 600 requests in 5 seconds; Coinbase: 10 a second). Other hosts, such as
 * keyed brokers with small free tiers, keep the careful default.
 */
export const HOST_LIMITS: Record<string, { concurrent: number; intervalMs: number }> = {
  "data-api.binance.vision": { concurrent: 4, intervalMs: 60 },
  "api.binance.com": { concurrent: 4, intervalMs: 60 },
  "api.bybit.com": { concurrent: 4, intervalMs: 60 },
  "api.exchange.coinbase.com": { concurrent: 3, intervalMs: 150 },
};

/** Process-local GET transport. Credentials are hashed, never stored in cache keys. */
export function createMarketTransport({
  minIntervalMs = 350,
  limits = HOST_LIMITS,
}: { minIntervalMs?: number; limits?: typeof HOST_LIMITS } = {}) {
  const cache = new Map<string, Entry>();
  const flights = new Map<string, Flight>();
  const active = new Map<string, number>();
  const cooldowns = new Map<string, number>();
  const queue: Job[] = [];
  const nextStart = new Map<string, number>();
  let wake: ReturnType<typeof setTimeout> | undefined;
  let running = 0,
    bytes = 0;
  const pump = () => {
    clearTimeout(wake);
    let delay = Infinity;
    for (let i = 0; i < queue.length;) {
      const job = queue[i]!;
      if (job.signal.aborted) {
        queue.splice(i, 1);
        job.reject();
      } else if (running < 8 && (active.get(job.host) ?? 0) < (limits[job.host]?.concurrent ?? 2)) {
        const wait = (nextStart.get(job.host) ?? 0) - Date.now();
        if (wait > 0) {
          delay = Math.min(delay, wait);
          i++;
        } else {
          queue.splice(i, 1);
          nextStart.set(job.host, Date.now() + (limits[job.host]?.intervalMs ?? minIntervalMs));
          job.start();
        }
      } else i++;
    }
    if (Number.isFinite(delay)) wake = setTimeout(pump, delay);
  };
  const schedule = <T>(host: string, signal: AbortSignal, run: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      if (signal.aborted) return reject(signal.reason);
      if (queue.length >= 64)
        return reject(new MarketDataError("Market data is busy. Try again shortly."));
      const job: Job = {
        host,
        signal,
        reject: () => {
          signal.removeEventListener("abort", pump);
          reject(signal.reason);
        },
        start: () => {
          signal.removeEventListener("abort", pump);
          running++;
          active.set(host, (active.get(host) ?? 0) + 1);
          void run()
            .then(resolve, reject)
            .finally(() => {
              running--;
              active.set(host, (active.get(host) ?? 1) - 1);
              pump();
            });
        },
      };
      queue.push(job);
      signal.addEventListener("abort", pump, { once: true });
      pump();
    });
  const read = async (
    url: string,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
    options: { cache?: boolean; timeoutMs?: number; ttlMs?: number } = {},
  ): Promise<unknown> => {
    signal?.throwIfAborted();
    const host = new URL(url).host;
    const identity = JSON.stringify(Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)));
    const scope = createHash("sha256")
      .update(host + identity)
      .digest("hex");
    const key = createHash("sha256")
      .update(url + identity)
      .digest("hex");
    const cached = options.cache !== false && cache.get(key);
    if (cached && cached.expires > Date.now()) {
      cache.delete(key);
      cache.set(key, cached);
      return cached.value;
    }
    if (cached) {
      cache.delete(key);
      bytes -= cached.bytes;
    }
    let flight = options.cache !== false ? flights.get(key) : undefined;
    if (flight?.controller.signal.aborted) flight = undefined;
    if (!flight) {
      const controller = new AbortController();
      const bounded = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(options.timeoutMs ?? 20_000),
      ]);
      const promise = schedule(host, bounded, async () => {
        if ((cooldowns.get(scope) ?? 0) > Date.now())
          throw new MarketDataError("Market data rate limit reached. Try again later.");
        const response = await fetch(url, {
          headers,
          redirect: "error",
          cache: "no-store",
          signal: bounded,
        });
        if (!response.ok) {
          if (response.status === 429) {
            const retry = response.headers.get("retry-after");
            const seconds = retry === null ? NaN : Number(retry);
            const until = Number.isFinite(seconds)
              ? Date.now() + seconds * 1000
              : Date.parse(retry ?? "");
            cooldowns.set(
              scope,
              Math.max(Date.now() + 1000, Number.isFinite(until) ? until : Date.now() + 30_000),
            );
            if (cooldowns.size > 128) cooldowns.delete(cooldowns.keys().next().value!);
          }
          throw new MarketDataError(
            response.status === 401 || response.status === 403
              ? "Market data access denied. Check credentials, environment and feed permissions."
              : response.status === 429
                ? "Market data rate limit reached. Try again later."
                : response.status === 451
                  ? "This market data source is unavailable in your region."
                  : `Market data request failed (${response.status}). Check the instrument and data coverage.`,
          );
        }
        const value: unknown = await response.json();
        bounded.throwIfAborted();
        if (options.cache !== false) {
          const size = Buffer.byteLength(JSON.stringify(value), "utf8");
          // Recent responses expire quickly; old completed windows can be shared longer.
          const query = new URL(url).searchParams;
          const end = query.get("end") ?? query.get("to") ?? query.get("endTime");
          const endTime = end && /^\d+$/.test(end) ? Number(end) : Date.parse(end ?? "");
          // Candles that ended over five minutes ago never change: keep them for an hour.
          const ttl = options.ttlMs ?? (endTime < Date.now() - 300_000 ? 3_600_000 : 15_000);
          if (size <= 4 * 1024 * 1024) {
            const prior = cache.get(key);
            if (prior) bytes -= prior.bytes;
            cache.delete(key);
            cache.set(key, { value, expires: Date.now() + ttl, bytes: size });
            bytes += size;
            while (cache.size > 512 || bytes > 64 * 1024 * 1024) {
              const oldest = cache.keys().next().value!;
              bytes -= cache.get(oldest)!.bytes;
              cache.delete(oldest);
            }
          }
        }
        return value;
      });
      flight = { controller, promise, users: 0 };
      if (options.cache !== false) {
        const current = flight;
        flights.set(key, current);
        void promise
          .finally(() => {
            if (flights.get(key) === current) flights.delete(key);
          })
          .catch(() => {});
      }
    }
    const current = flight;
    current.users++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error: unknown, value?: unknown) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", abort);
        if (--current.users === 0) current.controller.abort();
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () => finish(signal?.reason ?? new Error("Cancelled"));
      signal?.addEventListener("abort", abort, { once: true });
      current.promise.then(
        (value) => finish(null, value),
        (error) => finish(error),
      );
      if (signal?.aborted) abort();
    });
  };
  return {
    read,
    clear: () => {
      cache.clear();
      bytes = 0;
      cooldowns.clear();
    },
  };
}
const globalTransport = globalThis as typeof globalThis & {
  __journalMarketTransport?: ReturnType<typeof createMarketTransport>;
};
export const marketTransport =
  globalTransport.__journalMarketTransport ??
  (globalTransport.__journalMarketTransport = createMarketTransport());
