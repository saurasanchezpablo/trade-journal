import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { crossing, rma, rsi } from "../src";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/btcusdt-1h-2026-10.json", import.meta.url), "utf8"),
) as { bars: { close: number }[] };
const closes = fixture.bars.map((b) => b.close);

describe("RSI as TradingView computes it", () => {
  it("matches an independent computation on 600 real BTC hourly closes", () => {
    // Expected values: pandas, Wilder averages seeded with the simple average (as ta.rma).
    const r14 = rsi(closes, 14);
    expect(r14[13]).toBeNull();
    expect(r14[14]).toBeCloseTo(65.2258054646, 9);
    expect(r14[15]).toBeCloseTo(62.7522918122, 9);
    expect(r14[100]).toBeCloseTo(56.2387315552, 9);
    expect(r14[599]).toBeCloseTo(67.1065118917, 9);
    const r7 = rsi(closes, 7);
    expect(r7[7]).toBeCloseTo(46.67107126, 8);
    expect(r7[599]).toBeCloseTo(75.6167792493, 9);
  });

  it("is 100 when nothing fell and 0 when nothing rose", () => {
    expect(rsi([1, 2, 3, 4, 5], 3).slice(3)).toEqual([100, 100]);
    expect(rsi([5, 4, 3, 2, 1], 3).slice(3)).toEqual([0, 0]);
  });

  it("stays between 0 and 100 and has one value per close", () => {
    const r = rsi(closes, 14);
    expect(r).toHaveLength(closes.length);
    expect(r.every((v) => v === null || (v >= 0 && v <= 100))).toBe(true);
  });

  it("refuses a length that is not a positive integer", () => {
    expect(() => rsi(closes, 0)).toThrow();
    expect(() => rsi(closes, 2.5)).toThrow();
  });

  it("Wilder's average starts at the simple average of its first values", () => {
    expect(rma([1, 2, 3, 4], 3)).toEqual([null, null, 2, 2 + (4 - 2) / 3]);
  });
});

describe("crossing a level", () => {
  it("crosses above from at or below to strictly above, and below the reverse", () => {
    expect(crossing(69, 71, 70)).toBe("above");
    expect(crossing(70, 70.1, 70)).toBe("above");
    expect(crossing(71, 69, 70)).toBe("below");
    expect(crossing(70, 70, 70)).toBeNull();
    expect(crossing(71, 72, 70)).toBeNull();
    expect(crossing(null, 72, 70)).toBeNull();
  });
});
