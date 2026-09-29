import { createMarketTransport, marketTransport } from "../src/server/market-data/transport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateExcursions } from "../src/lib/excursions";
import { replayFrame } from "../src/lib/trade-replay";
import { londonStrategicEdge, parseLseBars } from "../src/server/market-data/london-strategic-edge";
import type { MarketHistory } from "../src/lib/market-data";

const start = Date.parse("2026-01-02T10:00:00Z");
const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString();
const fill = (minute: number, side: "buy" | "sell", quantity: number, price: number) => ({
  executedAt: at(minute),
  side,
  quantity,
  price,
});
const candle = (minute: number, low = 98, high = 104) => ({
  time: start + minute * 60_000,
  open: 100,
  high,
  low,
  close: 100,
  volume: 1,
});
const history = (bars = [candle(0), candle(1), candle(2)]): MarketHistory => ({
  provider: "Test",
  symbol: "TEST",
  resolution: "1m",
  fetchedAt: at(4),
  truncated: false,
  warnings: [],
  bars,
});
const trade = { direction: "long", openedAt: at(0), closedAt: at(3), assetClass: "equity" };

afterEach(() => vi.unstubAllGlobals());

describe("gross position excursion estimates", () => {
  it("withholds misleading estimates when live market prices disagree with demo fills", () => {
    const fills = [fill(0, "buy", 10, 222), fill(3, "sell", 10, 221)];
    const data = history(
      [0, 1, 2].map((minute) => ({ ...candle(minute, 324, 326), open: 325, close: 325 })),
    );
    for (const confirmed of [true, false])
      expect(estimateExcursions(trade, fills, data, confirmed)).toMatchObject({
        mae: null,
        mfe: null,
        priceBasisMismatch: true,
      });
  });

  it("calculates long and short excursions with adverse values shown as positive magnitudes", () => {
    expect(
      estimateExcursions(
        trade,
        [fill(0, "buy", 10, 100), fill(3, "sell", 10, 102)],
        history(),
        true,
      ),
    ).toMatchObject({ mae: 20, mfe: 40, sampledBars: 3 });
    expect(
      estimateExcursions(
        { ...trade, direction: "short" },
        [fill(0, "sell", 10, 100), fill(3, "buy", 10, 102)],
        history(),
        true,
      ),
    ).toMatchObject({ mae: 40, mfe: 20 });
  });
  it("uses actual remaining exposure after partial exits, retaining realized P&L", () => {
    const fills = [fill(0, "buy", 10, 100), fill(1, "sell", 8, 102), fill(3, "sell", 2, 103)];
    expect(
      estimateExcursions(
        trade,
        fills,
        history([candle(0, 100, 102), candle(1, 90, 120), candle(2, 100, 103)]),
        true,
      ),
    ).toMatchObject({ mae: 4, mfe: 56 });
  });
  it("uses cash flows from scale-ins without applying the eventual size to earlier prices", () => {
    const fills = [fill(0, "buy", 2, 100), fill(1, "buy", 8, 110), fill(3, "sell", 10, 111)];
    expect(
      estimateExcursions(
        trade,
        fills,
        history([
          candle(0, 90, 110),
          { ...candle(1, 108, 115), open: 110, close: 110 },
          { ...candle(2, 108, 112), open: 110, close: 110 },
        ]),
        true,
      ),
    ).toMatchObject({ mae: 20, mfe: 70 });
  });
  it("excludes highs and lows from bars crossing an execution or trade boundary", () => {
    const fills = [fill(0.5, "buy", 10, 100), fill(1.5, "sell", 5, 100), fill(3, "sell", 5, 100)];
    expect(
      estimateExcursions(
        { ...trade, openedAt: at(0.5) },
        fills,
        history([candle(0, 1, 999), candle(1, 1, 999), candle(2, 99, 102)]),
        true,
      ),
    ).toMatchObject({ mae: 5, mfe: 10, sampledBars: 1, excludedBars: 2 });
  });
  it("withholds numbers for absent, truncated, unconfirmed, or uncovered data", () => {
    const fills = [fill(0, "buy", 10, 100), fill(3, "sell", 10, 102)];
    for (const data of [
      history([]),
      history([candle(1), candle(2)]),
      history([candle(0)]),
      { ...history(), truncated: true },
    ])
      expect(estimateExcursions(trade, fills, data, true).mae).toBeNull();
    expect(estimateExcursions(trade, fills, history(), false).mfe).toBeNull();
    expect(estimateExcursions({ ...trade, closedAt: null }, fills, history(), true).mfe).toBeNull();
  });
  it("requires derivative multipliers and applies configured multipliers", () => {
    const fills = [fill(0, "buy", 1, 100), fill(3, "sell", 1, 102)];
    expect(
      estimateExcursions({ ...trade, assetClass: "futures" }, fills, history(), true).mae,
    ).toBeNull();
    expect(
      estimateExcursions(
        { ...trade, assetClass: "futures", contractMultiplier: 50 },
        fills,
        history(),
        true,
      ),
    ).toMatchObject({ mae: 100, mfe: 200 });
  });
  it("does not treat a reversal spanning two trade cycles as one closed position", () => {
    expect(
      estimateExcursions(
        trade,
        [fill(0, "buy", 10, 100), fill(3, "sell", 15, 102)],
        history(),
        true,
      ).mae,
    ).toBeNull();
  });
  it("reports internal gaps and refuses fill-only estimates", () => {
    const fills = [fill(0, "buy", 10, 100), fill(3, "sell", 10, 102)];
    expect(
      estimateExcursions(trade, fills, history([candle(0), candle(2)]), true).warnings.join(" "),
    ).toContain("gaps");
    expect(
      estimateExcursions(
        { ...trade, openedAt: at(0.2), closedAt: at(0.8) },
        [fill(0.2, "buy", 1, 100), fill(0.8, "sell", 1, 101)],
        history([candle(0)]),
        true,
      ).mae,
    ).toBeNull();
  });
});

describe("LSE REST contract", () => {
  const raw = (minute: number) => ({
    ts: at(minute).replace("T", " ").replace("Z", ""),
    open: "100",
    high: "104",
    low: "98",
    close: "102",
  });
  it("normalizes UTC times, numeric prices, ordering and duplicate bars", () => {
    const rows = parseLseBars([raw(1), raw(0), raw(0)]);
    expect(rows.map((bar) => bar.time)).toEqual([start, start + 60_000]);
    expect(rows[0]!.volume).toBe(0);
  });
  it("rejects malformed data and conflicting duplicates", () => {
    for (const rows of [
      { data: [] },
      [{ ...raw(0), open: null }],
      [{ ...raw(0), high: 90 }],
      [{ ...raw(0), ts: "bad" }],
      [raw(0), { ...raw(0), close: 103 }],
    ])
      expect(() => parseLseBars(rows)).toThrow();
  });
  it("uses date-only windows, checks both ends of plan caps, and filters to the trade", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json([raw(-1), raw(0), raw(1)]))
      .mockResolvedValueOnce(Response.json([raw(3), raw(2), raw(1)]));
    vi.stubGlobal("fetch", fetcher);
    const result = await londonStrategicEdge.history(
      { symbol: "EUR/USD", resolution: "1m", from: start + 10_000, to: start + 180_000 },
      "test-secret",
    );
    expect(result.bars.map((bar) => bar.time)).toEqual([start, start + 60_000, start + 120_000]);
    expect(result.truncated).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[1]!;
    expect(new URL(url).searchParams.get("start")).toBe("2026-01-02");
    expect(new URL(url).searchParams.get("end")).toBe("2026-01-03");
    expect(new URL(url).searchParams.get("order")).toBe("desc");
    expect(new URL(url).pathname).toBe("/vault/candles");
    expect(url).not.toContain("test-secret");
    expect(options.headers["x-api-key"]).toBe("test-secret");
    expect(options.redirect).toBe("error");
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });
  it("reuses both validated daily pages across overlapping trades", async () => {
    const fetcher = vi.fn(async () => Response.json([raw(0), raw(1), raw(2)]));
    vi.stubGlobal("fetch", fetcher);
    const histories = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        londonStrategicEdge.history(
          { symbol: "TEST", resolution: "1m", from: start + index * 1000, to: start + 180_000 },
          "test-secret",
        ),
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(histories.every((history) => history.bars.length === 3 && !history.truncated)).toBe(
      true,
    );
  });
  it("marks non-overlapping capped pages and bounded date ranges as truncated", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([raw(0)]))
        .mockResolvedValueOnce(Response.json([raw(2)])),
    );
    expect(
      (
        await londonStrategicEdge.history(
          { symbol: "TEST", resolution: "1m", from: start, to: start + 180_000 },
          "test-secret",
        )
      ).truncated,
    ).toBe(true);
    marketTransport.clear();
    const fetcher = vi.fn(async (_url: string) => Response.json([]));
    vi.stubGlobal("fetch", fetcher);
    const result = await londonStrategicEdge.history(
      { symbol: "TEST", resolution: "1m", from: start, to: start + 8 * 86_400_000 },
      "test-secret",
    );
    expect(result.truncated).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(12);
    const url = String(fetcher.mock.calls.at(-1)?.[0]);
    expect(new URL(url).searchParams.get("start")).toBe("2026-01-07");
  });
  it("rejects out-of-window data and inconsistent overlapping pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([raw(-1440)])),
    );
    await expect(
      londonStrategicEdge.history(
        { symbol: "TEST", resolution: "1m", from: start, to: start + 180_000 },
        "test-secret",
      ),
    ).rejects.toThrow("outside the requested date window");
    marketTransport.clear();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json([raw(0)]))
        .mockResolvedValueOnce(Response.json([{ ...raw(0), high: 105 }])),
    );
    await expect(
      londonStrategicEdge.history(
        { symbol: "TEST", resolution: "1m", from: start, to: start + 180_000 },
        "test-secret",
      ),
    ).rejects.toThrow("Conflicting candles");
  });
  it("sanitizes denied access, quota failures, and transport errors", async () => {
    for (const status of [401, 403, 429, 500]) {
      marketTransport.clear();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("test-secret upstream detail", { status })),
      );
      await expect(londonStrategicEdge.test("test-secret")).rejects.not.toThrow("test-secret");
    }
    marketTransport.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("test-secret");
      }),
    );
    await expect(londonStrategicEdge.test("test-secret")).rejects.toThrow("failed or timed out");
  });
});

describe("replay without future chart data", () => {
  it("reveals only completed candles and executions through the cursor, and rewinds", () => {
    const fills = [fill(0.5, "buy", 10, 100), fill(2.5, "sell", 10, 102)];
    const first = replayFrame(history(), fills, 1);
    expect(first.bars).toHaveLength(1);
    expect(first.fills).toEqual([fills[0]]);
    expect(replayFrame(history(), fills, 3).fills).toHaveLength(2);
    expect(replayFrame(history(), fills, 1).fills).toHaveLength(1);
    expect(replayFrame(history(), fills, 0).fills).toHaveLength(0);
  });
});

afterEach(() => marketTransport.clear());

beforeEach(() =>
  Object.assign(marketTransport, createMarketTransport({ minIntervalMs: 0, limits: {} })),
);
