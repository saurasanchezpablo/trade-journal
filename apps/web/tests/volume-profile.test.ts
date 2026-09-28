import { describe, expect, it } from "vitest";
import {
  addBar,
  buildVolumeProfile,
  profileTimeframe,
  valueArea,
  type ProfileBar,
  type ProfileRow,
} from "../src/lib/volume-profile";

const bar = (low: number, high: number, volume: number, up = true): ProfileBar => ({
  time: 0,
  open: up ? low : high,
  close: up ? high : low,
  high,
  low,
  volume,
});
/** Rows from volumes, low to high (all up volume). */
const rowsOf = (volumes: number[]): ProfileRow[] =>
  volumes.map((v, k) => ({ price: k, up: v, down: 0 }));

describe("a candle's volume is spread over the rows its range covers", () => {
  it("in proportion to the overlap, never counted twice", () => {
    const rows = rowsOf([0, 0, 0, 0]);
    // Rows of 1 from 0 to 4; a candle from 0.5 to 2.5 covers half, one and half a row.
    addBar(rows, 0, 1, bar(0.5, 2.5, 100));
    expect(rows.map((r) => r.up)).toEqual([25, 50, 25, 0]);
    expect(rows.reduce((s, r) => s + r.up + r.down, 0)).toBe(100);
  });

  it("up when it closes at or above its open, down otherwise", () => {
    const rows = rowsOf([0, 0]);
    addBar(rows, 0, 1, bar(0, 2, 10, true));
    addBar(rows, 0, 1, bar(0, 2, 6, false));
    const doji: ProfileBar = { time: 0, open: 1.5, close: 1.5, high: 1.5, low: 1.5, volume: 4 };
    addBar(rows, 0, 1, doji);
    expect(rows).toEqual([
      { price: 0, up: 5, down: 3 },
      { price: 1, up: 9, down: 3 },
    ]);
  });

  it("a profile's rows span the lowest low to the highest high of candles that traded", () => {
    const profile = buildVolumeProfile(
      [bar(100, 110, 5), bar(90, 95, 0), bar(104, 120, 5)],
      4,
      0.7,
    )!;
    expect(profile.min).toBe(100);
    expect(profile.rowH).toBe(5);
    expect(profile.rows.reduce((s, r) => s + r.up + r.down, 0)).toBeCloseTo(10, 10);
  });
});

describe("the value area, as TradingView grows it", () => {
  it("never goes past its share of the volume", () => {
    // Total 100, target 70: POC 40, then 20 (above), then the 15 below fits? 40+20=60, +15 > 70.
    const rows = rowsOf([5, 15, 40, 20, 10, 10]);
    expect(valueArea(rows, 2, 0.7)).toEqual({ vaFrom: 2, vaTo: 3 });
    // Vela's version kept adding until it passed the target (75% here).
  });

  it("adds the larger of the next row above and below, one row at a time", () => {
    const rows = rowsOf([10, 12, 40, 8, 30]);
    // Target 70: POC 40; above 8 vs below 12 → below (52); then above 8 vs below 10 → below (62);
    // then only above 8 → 70.
    expect(valueArea(rows, 2, 0.7)).toEqual({ vaFrom: 0, vaTo: 3 });
  });

  it("on equal volumes takes the row closer to the POC, then the one above", () => {
    // Equal distance, equal volume: above first.
    expect(valueArea(rowsOf([0, 10, 50, 10, 0, 30]), 2, 0.6)).toEqual({ vaFrom: 2, vaTo: 3 });
    // Target 90 of 100, POC 50 at row 3: up 12, up 11, then 10 above (three rows away) ties
    // 10 below (one row away): the closer one below is added; then the 10 above no longer fits.
    const rows = rowsOf([0, 0, 10, 50, 12, 11, 10, 7]);
    expect(valueArea(rows, 3, 0.9)).toEqual({ vaFrom: 2, vaTo: 5 });
  });

  it("a profile whose POC alone reaches the target is just the POC", () => {
    expect(valueArea(rowsOf([1, 90, 1]), 1, 0.7)).toEqual({ vaFrom: 1, vaTo: 1 });
  });
});

describe("which candles a profile is built from", () => {
  const H = 3_600_000;
  it("the finest size that fits the range in under 5000 candles, like TradingView", () => {
    expect(profileTimeframe(0, 2 * 24 * H, 15 * 60_000)!.id).toBe("1");
    expect(profileTimeframe(0, 10 * 24 * H, 15 * 60_000)!.id).toBe("5");
    expect(profileTimeframe(0, 200 * 24 * H, 4 * H)!.id).toBe("60");
  });
  it("the chart's own candles when nothing finer fits", () => {
    expect(profileTimeframe(0, 2 * H, 60_000)).toBeNull();
    expect(profileTimeframe(0, 500 * 24 * H, 4 * H)).toBeNull();
  });
});
