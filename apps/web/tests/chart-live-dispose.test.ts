// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { JournalMarketProvider, LIVE_POLL_MS } from "../src/lib/live-market";

/** A removed chart stops asking for candles: no further pages, polls or requests in flight. */

const H = 3_600_000;
const bar = (time: number) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 });

interface Held {
  body: { to: number; limit?: number };
  signal: AbortSignal | undefined;
  answer: (bars: unknown[]) => void;
}
function heldFetch() {
  const pending: Held[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
          pending.push({
            body: JSON.parse(String(init.body)),
            signal: init.signal ?? undefined,
            answer: (bars) => resolve(Response.json({ bars })),
          });
        }),
    ),
  );
  return pending;
}
const provider = () =>
  new JournalMarketProvider({ provider: "csv" }, { onStatus: () => {}, onLatest: () => {} });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a chart that is removed", () => {
  it("cancels its history request and asks for no further pages", async () => {
    const pending = heldFetch();
    const now = Date.UTC(2026, 8, 29, 8);
    const chart = provider();
    // 12000 hourly candles take three pages.
    const load = chart.getBars("ES", "60", { to: now, limit: 12_000 }).catch(() => "cancelled");
    pending[0]!.answer(Array.from({ length: 5000 }, (_, i) => bar(now - (4999 - i) * H)));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    chart.dispose();
    expect(pending[1]!.signal?.aborted).toBe(true);
    await load;
    expect(pending).toHaveLength(2);
  });

  it("stops polling for live candles, cancelling a poll on its way", async () => {
    vi.useFakeTimers();
    const pending = heldFetch();
    const chart = provider();
    chart.subscribe("ES", "1", () => {});
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS["1m"]);
    expect(pending).toHaveLength(1);
    chart.dispose();
    expect(pending[0]!.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS["1m"] * 4);
    expect(pending).toHaveLength(1);
  });

  it("unsubscribing cancels the poll still on its way", async () => {
    vi.useFakeTimers();
    const pending = heldFetch();
    const chart = provider();
    const stop = chart.subscribe("ES", "1", () => {});
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS["1m"]);
    stop();
    expect(pending[0]!.signal?.aborted).toBe(true);
  });
});

describe("charts sharing one provider (the workspace)", () => {
  it("each catches up from its own last candle, not another symbol's", async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 8, 29, 8);
    vi.setSystemTime(now);
    const pending = heldFetch();
    const shared = provider();
    const eth = shared.getBars("ETH", "1", { limit: 10 });
    pending[0]!.answer([bar(now - 50 * 60_000)]);
    await eth;
    const btc = shared.getBars("BTC", "1", { limit: 10 });
    pending[1]!.answer([bar(now - 60_000)]);
    await btc;
    shared.subscribe("ETH", "1", () => {});
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS["1m"]);
    const poll = pending[2]!.body as unknown as { from: number };
    expect(poll.from).toBe(now - 50 * 60_000);
    shared.dispose();
  });
});
