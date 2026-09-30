import { describe, expect, it } from "vitest";
import {
  MAX_CANDLE_PX,
  MIN_PRICE_WINDOW,
  MIN_VISIBLE_CANDLES,
  candleRange,
  clampPriceWindow,
  maxBarSpacing,
} from "../src/lib/chart-zoom";
import { JOURNAL_OVERLAYS_TYPE, limitChartView } from "../src/components/vela-view-limits";

describe("how far a chart zooms in", () => {
  it("keeps a screenful of candles, none wider than the cap", () => {
    expect(maxBarSpacing(2000)).toBe(MAX_CANDLE_PX);
    expect(maxBarSpacing(400)).toBe(400 / MIN_VISIBLE_CANDLES);
    // Vela's spacing is scaled per timeframe; the cap is in screen pixels.
    expect(maxBarSpacing(2000, 2) * 2).toBe(MAX_CANDLE_PX);
  });

  it("stops squeezing the price axis at a share of the candles' range", () => {
    const candles = { low: 100, high: 200 };
    const narrow = clampPriceWindow({ min: 149, max: 151 }, candles);
    expect(narrow.max - narrow.min).toBeCloseTo(100 * MIN_PRICE_WINDOW);
    expect((narrow.max + narrow.min) / 2).toBeCloseTo(150);
    const wide = { min: 120, max: 180 };
    expect(clampPriceWindow(wide, candles)).toBe(wide);
    expect(clampPriceWindow(wide, null)).toBe(wide);
  });

  it("measures a log scale in log terms", () => {
    const next = clampPriceWindow({ min: 99, max: 101, log: true }, { low: 10, high: 1000 });
    expect(Math.log(next.max) - Math.log(next.min)).toBeCloseTo(Math.log(100) * MIN_PRICE_WINDOW);
    expect(next.log).toBe(true);
  });

  it("reads the range of the candles on screen", () => {
    const bars = [
      { low: 5, high: 9 },
      { low: 3, high: 7 },
      { low: 1, high: 20 },
    ];
    expect(candleRange(bars, 0, 1)).toEqual({ low: 3, high: 9 });
    // A candle partly on screen counts, as in Vela's own fit.
    expect(candleRange(bars, -3, 0.2)).toEqual({ low: 3, high: 9 });
    expect(candleRange(bars, -3, 0)).toEqual({ low: 5, high: 9 });
    expect(candleRange([], 0, 5)).toBeNull();
  });
});

/** Stand-ins for Vela's native renderer, its chrome layer and its scene. */
function fakeRenderer() {
  const calls: Array<[number, number]> = [];
  class Chrome {
    seen: string[][] = [];
    paneDrawingsRange(
      models: Array<{ native?: { type?: string } }>,
      scene: {
        indicators: Map<string, { native?: { type?: string } }>;
        offsetOf(id: string): number;
      },
    ) {
      this.seen.push([
        ...models.map((m) => m.native?.type ?? "pine"),
        ...[...scene.indicators.values()].map((m) => `scene:${m.native?.type ?? "pine"}`),
        `offset:${scene.offsetOf("x")}`,
      ]);
      return null;
    }
  }
  class Renderer {
    coords = { width: 800, spacingScale: 1, visibleLogicalRange: () => ({ from: 0, to: 1 }) };
    bars = [
      { low: 100, high: 150 },
      { low: 120, high: 200 },
    ];
    chrome = new Chrome();
    scaleDragHolder: { kind: string; manualScale: { min: number; max: number } | null } | null =
      null;
    manual: Array<{ min: number; max: number }> = [];
    clampViewport(barSpacing: number, rightOffset: number) {
      calls.push([barSpacing, rightOffset]);
      return { barSpacing: Math.min(barSpacing, 1000), rightOffset };
    }
    priceScaleBy(dy: number) {
      if (this.scaleDragHolder) this.scaleDragHolder.manualScale = { min: 150 - dy, max: 150 + dy };
    }
    setManualScale(holder: { manualScale: unknown }, scale: { min: number; max: number }) {
      holder.manualScale = scale;
      this.manual.push(scale);
    }
  }
  const native = new Renderer();
  return { native, calls, control: { renderer: native } };
}

describe("the chart's view limits", () => {
  const { native, control } = fakeRenderer();
  limitChartView(control);
  limitChartView(control);

  it("caps the zoom on the time axis", () => {
    expect(native.clampViewport(900, 6).barSpacing).toBe(maxBarSpacing(800));
    expect(native.clampViewport(10, 6).barSpacing).toBe(10);
  });

  it("caps the zoom on the price axis of the price pane only", () => {
    native.scaleDragHolder = { kind: "price", manualScale: null };
    native.priceScaleBy(1);
    const window = native.scaleDragHolder.manualScale!;
    expect(window.max - window.min).toBeCloseTo(100 * MIN_PRICE_WINDOW);
    native.scaleDragHolder = { kind: "study", manualScale: null };
    native.priceScaleBy(1);
    expect(native.scaleDragHolder.manualScale).toEqual({ min: 149, max: 151 });
  });

  it("fits the price to everything but the journal's overlays", () => {
    const overlay = { native: { type: `${JOURNAL_OVERLAYS_TYPE}1-x` } };
    const rsi = { native: { type: "rsi" } };
    const scene = {
      indicators: new Map<string, { native?: { type?: string } }>([
        ["a", overlay],
        ["b", rsi],
        ["c", {}],
      ]),
      offsetOf: () => 3,
    };
    native.chrome.paneDrawingsRange([overlay, rsi], scene);
    expect(native.chrome.seen.at(-1)).toEqual(["rsi", "scene:rsi", "scene:pine", "offset:3"]);
  });

  it("leaves a renderer without these methods alone", () => {
    expect(() => limitChartView(null)).not.toThrow();
    expect(() => limitChartView({})).not.toThrow();
  });
});
