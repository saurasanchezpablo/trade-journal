import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketTransport } from "../src/server/market-data/transport";
const url = "https://example.test/candles?end=2025-01-01";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("bounded market transport", () => {
  it("shares simultaneous and repeated history while isolating credentials and feeds", async () => {
    const transport = createMarketTransport({ minIntervalMs: 0 });
    const fetcher = vi.fn(async () => Response.json([{ close: 100 }]));
    vi.stubGlobal("fetch", fetcher);
    const replies = await Promise.all(
      Array.from({ length: 20 }, () => transport.read(url, { key: "one" })),
    );
    expect(replies).toHaveLength(20);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await transport.read(url, { key: "one" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await transport.read(url, { key: "two" });
    await transport.read(url + "&feed=other", { key: "one" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not let one subscriber cancel another, but aborts when all leave", async () => {
    const transport = createMarketTransport({ minIntervalMs: 0 });
    let complete!: () => void;
    let upstream!: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) => {
        upstream = init.signal;
        return new Promise<Response>((resolve, reject) => {
          complete = () => resolve(Response.json({ ok: true }));
          upstream.addEventListener("abort", () => reject(upstream.reason));
        });
      }),
    );
    const a = new AbortController(),
      b = new AbortController();
    const first = transport.read(url, {}, a.signal);
    const second = transport.read(url, {}, b.signal);
    const rejected = expect(first).rejects.toThrow();
    a.abort();
    await rejected;
    expect(upstream.aborted).toBe(false);
    complete();
    expect(await second).toEqual({ ok: true });
    const third = transport.read(url + "&new=1", {}, b.signal);
    const cancelled = expect(third).rejects.toThrow();
    b.abort();
    await cancelled;
    expect(upstream.aborted).toBe(true);
  });
  it("caps per-host and total requests and cancels queued work before fetch", async () => {
    const transport = createMarketTransport({ minIntervalMs: 0 });
    let active = 0,
      peak = 0;
    const perHost = new Map<string, number>();
    const fetcher = vi.fn(async (address: string) => {
      const host = new URL(address).host;
      active++;
      peak = Math.max(peak, active);
      perHost.set(host, (perHost.get(host) ?? 0) + 1);
      // Hosts without their own limit take two requests at a time.
      expect(perHost.get(host)).toBeLessThanOrEqual(2);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      perHost.set(host, perHost.get(host)! - 1);
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const work = Array.from({ length: 20 }, (_, i) =>
      transport.read(`https://host${i % 4}.test/${i}`),
    );
    const controller = new AbortController();
    const queued = transport.read("https://host0.test/cancelled", {}, controller.signal);
    const cancelled = expect(queued).rejects.toThrow();
    controller.abort();
    await cancelled;
    await Promise.all(work);
    expect(peak).toBe(8);
    expect(fetcher).toHaveBeenCalledTimes(20);
  });
  it("expires old and recent data and bypasses cache for connection tests", async () => {
    vi.useFakeTimers();
    const transport = createMarketTransport({ minIntervalMs: 0 });
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await transport.read(url);
    await transport.read(url, {}, undefined, { cache: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
    // Old candles never change: an hour later they are fetched again, not before.
    await vi.advanceTimersByTimeAsync(300_001);
    await transport.read(url);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_300_000);
    await transport.read(url);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const recent = "https://example.test/latest";
    await transport.read(recent);
    await vi.advanceTimersByTimeAsync(15_001);
    await transport.read(recent);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("does not cache failures and honors Retry-After across requests with the same credential", async () => {
    vi.useFakeTimers();
    const transport = createMarketTransport({ minIntervalMs: 0 });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
      .mockImplementation(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(transport.read(url)).rejects.toThrow("500");
    await expect(transport.read(url)).rejects.toThrow("rate limit");
    await expect(transport.read(url + "&other=1")).rejects.toThrow("rate limit");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await transport.read(url, { key: "different" });
    await vi.advanceTimersByTimeAsync(2001);
    await transport.read(url);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("paces only upstream calls while cached results return immediately", async () => {
    vi.useFakeTimers();
    const transport = createMarketTransport({ minIntervalMs: 350 });
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await transport.read(url);
    const next = transport.read(url + "&other=1");
    await transport.read(url);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(349);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await next;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("evicts least recently used entries instead of growing indefinitely", async () => {
    const transport = createMarketTransport({ minIntervalMs: 0 });
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    for (let i = 0; i < 513; i++) await transport.read(`${url}&id=${i}`);
    await transport.read(`${url}&id=512`);
    expect(fetcher).toHaveBeenCalledTimes(513);
    await transport.read(`${url}&id=0`);
    expect(fetcher).toHaveBeenCalledTimes(514);
  });
});

describe("exchange limits", () => {
  it("let public exchange APIs take more requests at once, with their own pacing", async () => {
    const transport = createMarketTransport({
      minIntervalMs: 0,
      limits: { "fast.test": { concurrent: 4, intervalMs: 0 } },
    });
    let active = 0;
    const peaks = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (address: string) => {
        const host = new URL(address).host;
        active++;
        peaks.set(host, Math.max(peaks.get(host) ?? 0, active));
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return Response.json({ ok: true });
      }),
    );
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => transport.read(`https://fast.test/${i}`)),
    );
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => transport.read(`https://slow.test/${i}`)),
    );
    expect(peaks.get("fast.test")).toBe(4);
    expect(peaks.get("slow.test")).toBe(2);
  });
});
