import { describe, expect, it } from "vitest";
import { describeTradeMarket, tradeMarketFacts } from "../src/lib/trade-context";

const M = 60_000;
const t0 = Date.parse("2026-09-15T09:00:00Z");
/** One-minute candles from 09:00: `closes[i]` with a one-point range around it. */
const bars = (closes: number[]) =>
  closes.map((close, i) => ({
    time: t0 + i * M,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }));

describe("the market around a trade", () => {
  // The day rises from 100 to 110, the long entry at 108 dips to 105, runs to 115, exits 112.
  const closes = [100, 102, 104, 106, 108, 106, 109, 112, 114, 112, 113, 118];
  const trade = {
    direction: "long" as const,
    avgEntry: 108,
    avgExit: 112,
    openedAt: new Date(t0 + 4 * M + 30_000).toISOString(),
    closedAt: new Date(t0 + 9 * M + 30_000).toISOString(),
    stopLoss: 104,
    profitTarget: 116,
  };
  const facts = tradeMarketFacts(trade, bars(closes), t0, M);

  it("places the entry in the day's range so far and against the VWAP", () => {
    expect(facts.dayRange).toEqual({ high: 109, low: 99 });
    expect(facts.entryInRange).toBeCloseTo(0.9);
    expect(facts.vwapAtEntry).toBeCloseTo(104);
    expect(facts.entryVsVwap).toBeCloseTo(4 / 104);
  });

  it("measures the moves against and in favour while open, in R with a stop", () => {
    expect(facts.mae).toBe(3); // low of 105 in the 06 candle
    expect(facts.mfe).toBe(7); // high of 115 in the 114 candle
    expect(facts.maeR).toBeCloseTo(0.75);
    expect(facts.mfeR).toBeCloseTo(1.75);
    expect(facts.captured).toBeCloseTo(4 / 7);
    expect(facts.stopTouched).toBe(false);
    expect(facts.targetTouched).toBe(false);
    // After the exit price reached 119.
    expect(facts.afterExit).toBe(7);
  });

  it("reads as plain lines for the AI", () => {
    expect(describeTradeMarket(facts, trade).split("\n")).toEqual([
      "Entry 108 at 90% of the day's range so far (low 99, high 109).",
      "Day VWAP at entry 104: entry 3.85% above it.",
      "While open, price went 3 against the entry (0.75R) and 7 in its favour (1.75R).",
      "The exit kept 57% of the best move while open.",
      "The planned stop was not reached while open.",
      "The planned target was not reached while open.",
      "After the exit, price went a further 7 in the trade's direction in the candles shown.",
    ]);
  });

  it("mirrors for a short, and says nothing it cannot know", () => {
    const short = tradeMarketFacts(
      { ...trade, direction: "short", avgEntry: 108, avgExit: 106, stopLoss: 116 },
      bars(closes),
      t0,
      M,
    );
    expect(short.mae).toBe(7);
    expect(short.mfe).toBe(3);
    expect(tradeMarketFacts(trade, [], t0, M)).toMatchObject({
      dayRange: null,
      mae: null,
      captured: null,
    });
  });
});
