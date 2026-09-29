import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalMarketProvider, type LatestBar } from "../src/lib/live-market";

/**
 * The chart's candle provider reports the current price to the page (header and line
 * alerts). A slow answer must never report a price for a timeframe or chart you left.
 */

const bar = (time: number, close: number) => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

afterEach(() => vi.unstubAllGlobals());

/** fetch that answers each history request when the test says so. */
function heldFetch() {
  const pending: { resolution: string; answer: (bars: unknown[]) => void }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          const body = JSON.parse(String(init.body)) as { resolution: string };
          pending.push({
            resolution: body.resolution,
            answer: (bars) => resolve(Response.json({ bars })),
          });
        }),
    ),
  );
  return pending;
}

describe("the chart's price comes from the chart you are looking at", () => {
  it("a slow answer for the timeframe you left does not report its price", async () => {
    const pending = heldFetch();
    const latest: LatestBar[] = [];
    const provider = new JournalMarketProvider(
      { provider: "binance" },
      { onStatus: () => {}, onLatest: (l) => latest.push(l) },
    );
    const oneMinute = provider.getBars("BTCUSDT", "1", { limit: 500 });
    const daily = provider.getBars("BTCUSDT", "1D", { limit: 500 });
    pending.find((p) => p.resolution === "1d")!.answer([bar(1_000, 99)]);
    await daily;
    pending.find((p) => p.resolution === "1m")!.answer([bar(2_000, 50)]);
    await oneMinute;
    expect(latest.map((l) => l.bar.close)).toEqual([99]);
  });

  it("a removed chart reports nothing, even when its request answers later", async () => {
    const pending = heldFetch();
    const onLatest = vi.fn();
    const onStatus = vi.fn();
    const provider = new JournalMarketProvider({ provider: "binance" }, { onStatus, onLatest });
    const request = provider.getBars("BTCUSDT", "1", { limit: 500 });
    provider.dispose();
    onStatus.mockClear();
    pending[0]!.answer([bar(1_000, 60_000)]);
    await request;
    expect(onLatest).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("scrolling back through older candles never reports them as the price", async () => {
    const pending = heldFetch();
    const onLatest = vi.fn();
    const provider = new JournalMarketProvider(
      { provider: "binance" },
      { onStatus: () => {}, onLatest },
    );
    const request = provider.getBars("BTCUSDT", "1", { from: 0, to: 60_000 });
    pending[0]!.answer([bar(0, 10)]);
    await request;
    expect(onLatest).not.toHaveBeenCalled();
  });
});

describe("a chart opened on a long view gets all of its candles", () => {
  it("fetches more than one request holds in pages, newest first, without gaps or repeats", async () => {
    const H = 3_600_000;
    const now = Date.UTC(2026, 8, 29, 8);
    // The source has 7000 hourly candles; each request returns at most 5000.
    const all = Array.from({ length: 7000 }, (_, i) => bar(now - (6999 - i) * H, 100 + i));
    const asked: { to: number; limit: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { to: number; limit: number };
        asked.push({ to: body.to, limit: body.limit });
        const bars = all.filter((b) => b.time <= body.to).slice(-Math.min(body.limit, 5000));
        return Response.json({ bars });
      }),
    );
    const provider = new JournalMarketProvider(
      { provider: "binance" },
      { onStatus: () => {}, onLatest: () => {} },
    );
    const bars = await provider.getBars("BTCUSDT", "60", { to: now, limit: 5820 });
    expect(bars).toHaveLength(5820);
    expect(bars.at(-1)!.time).toBe(now);
    expect(bars[0]!.time).toBe(now - 5819 * H);
    expect(new Set(bars.map((b) => b.time)).size).toBe(5820);
    expect(asked.map((a) => a.limit)).toEqual([5000, 820]);
    expect(asked[1]!.to).toBe(now - 4999 * H - 1);

    // Asking past the start of the source's history stops at its first candle.
    asked.length = 0;
    const deeper = await provider.getBars("BTCUSDT", "60", { to: now, limit: 20_000 });
    expect(deeper).toHaveLength(7000);
    expect(asked).toHaveLength(2);
  });
});
