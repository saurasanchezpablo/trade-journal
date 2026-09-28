import { describe, expect, it, vi } from "vitest";
import * as vela from "@luxalgo/vela";
import {
  anchoredVwap,
  applyCalculationFixes,
  candlesFrom,
  inSessionZone,
  patchNativeVwap,
  patchVisibleRangeProfile,
} from "../src/components/vela-calculation-fixes";
import { buildVolumeProfile, type ProfileBar } from "../src/lib/volume-profile";

// Vela's own drawings, kept before the fixes replace them.
const originalProfile = vela.createDrawing("fixedrangevp", { paneId: "price" });
applyCalculationFixes(vela);

const M = 60_000;
const Q = 15 * M;
const T0 = Date.UTC(2026, 8, 28, 0, 0);

/** Minute candles for `hours`, a wave around 100 with some volume. */
function minutes(hours: number): ProfileBar[] {
  return Array.from({ length: hours * 60 }, (_, i) => {
    const mid = 100 + Math.sin(i / 37) * 4 + Math.sin(i / 5);
    const open = mid - 0.3 * Math.cos(i);
    const close = mid + 0.3 * Math.cos(i);
    return {
      time: T0 + i * M,
      open,
      close,
      high: Math.max(open, close) + 0.4,
      low: Math.min(open, close) - 0.4,
      volume: 10 + (i % 7) * 3,
    };
  });
}
/** Chart candles built from minute candles. */
function aggregate(bars: ProfileBar[], ms: number): ProfileBar[] {
  const out: ProfileBar[] = [];
  for (const bar of bars) {
    const time = Math.floor(bar.time / ms) * ms;
    const last = out.at(-1);
    if (last && last.time === time) {
      last.high = Math.max(last.high, bar.high);
      last.low = Math.min(last.low, bar.low);
      last.close = bar.close;
      last.volume = (last.volume ?? 0) + (bar.volume ?? 0);
    } else out.push({ ...bar, time });
  }
  return out;
}
const oneMinute = minutes(12);
const quarter = aggregate(oneMinute, Q);

/** Vela's projector, as the chart builds it: candles open inside [from, to], finer on request. */
function projector(
  chart: ProfileBar[],
  fine: Record<string, ProfileBar[]>,
  state: "ready" | "loading" = "ready",
) {
  const seriesInRange = vi.fn(
    (
      timeframe: string,
      from: number,
      to: number,
    ): { state: "ready" | "loading" | "unavailable"; bars?: ProfileBar[] } =>
      fine[timeframe]
        ? { state, bars: fine[timeframe]!.filter((b) => b.time >= from && b.time <= to) }
        : { state: "unavailable" },
  );
  return {
    barsInRange: (from: number, to: number) => chart.filter((b) => b.time >= from && b.time <= to),
    seriesInRange,
    xOf: (t: number) => t,
    yOf: (p: number) => p,
  };
}

type Profile = {
  compute(proj: unknown): {
    profile: { rows: { up: number; down: number }[]; poc: number; vaFrom: number; vaTo: number };
    developingPoc: { time: number }[];
  } | null;
  frvp: Record<string, unknown>;
};
const profileDrawing = (from: number, to: number) =>
  vela.createDrawing("fixedrangevp", {
    paneId: "price",
    anchors: [
      { time: from, price: 100 },
      { time: to, price: 100 },
    ],
  }) as unknown as Profile;

const rowVolume = (rows: { up: number; down: number }[]) =>
  rows.reduce((sum, row) => sum + row.up + row.down, 0);

describe("the fixed range volume profile, as TradingView computes it", () => {
  it("Vela's own counted a candle's volume once per row its open, high, low and close hit", () => {
    const d = originalProfile as unknown as Profile;
    (d as unknown as { anchors: unknown[] }).anchors = [
      { time: quarter[0]!.time, price: 100 },
      { time: quarter.at(-1)!.time, price: 100 },
    ];
    const volume = quarter.reduce((sum, b) => sum + (b.volume ?? 0), 0);
    const counted = rowVolume(d.compute(projector(quarter, {}))!.profile.rows);
    expect(counted).toBeGreaterThan(volume * 1.2);
  });

  it("is built from the one-minute candles of the range when they fit in 5000", async () => {
    const proj = projector(quarter, { "1": oneMinute });
    const d = profileDrawing(quarter[0]!.time, quarter.at(-1)!.time);
    const result = d.compute(proj)!;
    expect(proj.seriesInRange).toHaveBeenCalledWith("1", quarter[0]!.time, expect.any(Number));
    const expected = buildVolumeProfile(oneMinute, 24, 0.7)!;
    expect(result.profile.poc).toBe(expected.poc);
    expect([result.profile.vaFrom, result.profile.vaTo]).toEqual([expected.vaFrom, expected.vaTo]);
    // Every unit of volume counted once.
    const volume = oneMinute.reduce((sum, b) => sum + (b.volume ?? 0), 0);
    expect(rowVolume(result.profile.rows)).toBeCloseTo(volume, 6);
  });

  it("uses the chart's candles until the finer ones have loaded", () => {
    const proj = projector(quarter, { "1": oneMinute.slice(0, 10) }, "loading");
    const result = profileDrawing(quarter[0]!.time, quarter.at(-1)!.time).compute(proj)!;
    expect(result.profile.poc).toBe(buildVolumeProfile(quarter, 24, 0.7)!.poc);
  });

  it("includes the candle an anchor sits inside, not only candles opening after it", () => {
    const proj = projector(quarter, {});
    const inside = quarter[4]!.time + 7 * M;
    const d = profileDrawing(inside, quarter[10]!.time);
    const expected = buildVolumeProfile(quarter.slice(4, 11), 24, 0.7)!;
    expect(rowVolume(d.compute(proj)!.profile.rows)).toBeCloseTo(rowVolume(expected.rows), 6);
  });

  it("steps the developing POC once per chart candle", () => {
    const proj = projector(quarter, { "1": oneMinute });
    const d = profileDrawing(quarter[0]!.time, quarter.at(-1)!.time);
    d.frvp.showDevelopingPoc = true;
    const result = d.compute(proj)!;
    expect(result.developingPoc.map((p) => p.time)).toEqual(quarter.map((b) => b.time));
  });
});

describe("the anchored VWAP", () => {
  it("starts at the candle holding the anchor", () => {
    const proj = projector(quarter, {});
    const anchor = quarter[3]!.time + 9 * M;
    const bars = candlesFrom(proj, anchor, Infinity)!;
    expect(bars[0]!.time).toBe(quarter[3]!.time);
    const d = vela.createDrawing("anchoredvwap", {
      paneId: "price",
      anchors: [{ time: anchor, price: 100 }],
    }) as unknown as { series(proj: unknown): { time: number; mid: number }[] };
    const series = d.series(proj);
    expect(series[0]!.time).toBe(quarter[3]!.time);
    const expected = anchoredVwap(quarter.slice(3), 1);
    expect(series.at(-1)!.mid).toBeCloseTo(expected.at(-1)!.mid, 10);
  });

  it("is TradingView's hlc3 VWAP with volume-weighted deviation bands", () => {
    const bars = quarter.slice(0, 20);
    const out = anchoredVwap(bars, 2).at(-1)!;
    let pv = 0;
    let v = 0;
    let p2v = 0;
    for (const b of bars) {
      const tp = (b.high + b.low + b.close) / 3;
      pv += tp * b.volume!;
      p2v += tp * tp * b.volume!;
      v += b.volume!;
    }
    const mid = pv / v;
    expect(out.mid).toBeCloseTo(mid, 10);
    expect(out.upper - out.mid).toBeCloseTo(2 * Math.sqrt(p2v / v - mid * mid), 8);
  });
});

describe("the visible range volume profile", () => {
  it("replaces the layer's computation, and leaves an unknown renderer alone", () => {
    expect(patchVisibleRangeProfile({})).toBe(false);
    expect(patchVisibleRangeProfile(null)).toBe(false);
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) =>
          typeof prop === "string" &&
          /Rect|save|restore|clip|beginPath|rect|setTransform/.test(prop)
            ? () => calls.push(prop)
            : undefined,
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    const layer = { ctx, canvas: { width: 100, height: 100 }, render: (_args: unknown) => {} };
    const seriesInRange = vi.fn(() => ({ state: "ready", bars: oneMinute }));
    const renderer = { vpvrRenderer: layer, userDrawings: { seriesGateway: { seriesInRange } } };
    expect(patchVisibleRangeProfile(renderer)).toBe(true);
    layer.render({
      bars: quarter,
      data: {
        rows: 24,
        widthFrac: 0.3,
        upColor: "#0f0",
        downColor: "#f00",
        showPoc: true,
        valueAreaFrac: 0.7,
      },
      visible: true,
      coords: {
        dpr: 1,
        width: 100,
        visibleLogicalRange: () => ({ from: 0, to: quarter.length - 1 }),
        priceToY: (p: number) => p,
      },
      scale: null,
      bounds: { top: 0, height: 100 },
      theme: { textColor: "#fff" },
    } as never);
    expect(seriesInRange).toHaveBeenCalledWith("1", quarter[0]!.time, expect.any(Number));
    expect(calls).toContain("fillRect");
    expect(calls).toContain("strokeRect");
  });
});

describe("the native VWAP's sessions", () => {
  it("moves candle times to the session zone's wall clock, across daylight saving", () => {
    const winter = Date.UTC(2026, 2, 6, 5, 0); // 00:00 in New York (EST)
    const summer = Date.UTC(2026, 2, 9, 4, 0); // 00:00 in New York (EDT)
    const [a, b] = inSessionZone([{ time: winter }, { time: summer }], "America/New_York");
    expect(new Date(a!.time).toISOString()).toBe("2026-03-06T00:00:00.000Z");
    expect(new Date(b!.time).toISOString()).toBe("2026-03-09T00:00:00.000Z");
    // Forex: 17:00 New York is the start of the next trading day.
    const [fx] = inSessionZone([{ time: Date.UTC(2026, 2, 5, 22, 0) }], "Forex (17:00 New York)");
    expect(new Date(fx!.time).toISOString()).toBe("2026-03-06T00:00:00.000Z");
  });

  it("leaves UTC and unknown zones as they are", () => {
    const bars = [{ time: 1 }];
    expect(inSessionZone(bars, "UTC")).toBe(bars);
    expect(inSessionZone(bars, "Mars/Olympus")).toBe(bars);
    expect(inSessionZone(bars, undefined)).toBe(bars);
  });

  it("adds a session input and computes in it, keeping everything else", () => {
    const registry = new Map<string, unknown>();
    const seen: number[][] = [];
    class Classic {
      constructor(
        readonly spec: {
          inputs: { key: string }[];
          compute: (bars: { time: number }[], inputs: Record<string, unknown>) => unknown;
        },
      ) {}
    }
    const spec = {
      type: "vwap",
      inputs: [
        { key: "anchor", title: "Period", type: "string", defval: "Day", tooltip: "UTC periods" },
        { key: "source", title: "Source", type: "string", defval: "HLC3" },
      ],
      compute: (bars: { time: number }[]) => {
        seen.push(bars.map((b) => b.time));
        return { plots: [] };
      },
    };
    registry.set("vwap", {
      type: "vwap",
      title: "VWAP",
      multiInstance: true,
      inputsSchema: () => spec.inputs,
      defaultInputs: () => ({ anchor: "Day", source: "HLC3" }),
      create: () => new Classic(spec),
    });
    const api = {
      getNativeIndicator: (type: string) => registry.get(type),
      registerNativeIndicator: (d: { type: string }) => registry.set(d.type, d),
    };
    expect(patchNativeVwap(api)).toBe(true);
    expect(patchNativeVwap(api)).toBe(false);
    const fixed = registry.get("vwap") as {
      multiInstance: boolean;
      inputsSchema(): { key: string }[];
      defaultInputs(): Record<string, unknown>;
      create(): Classic;
    };
    expect(fixed.multiInstance).toBe(true);
    expect(fixed.inputsSchema().map((i) => i.key)).toEqual(["anchor", "session", "source"]);
    expect(fixed.defaultInputs()).toMatchObject({ session: "UTC" });
    const instance = fixed.create();
    expect(instance).toBeInstanceOf(Classic);
    const t = Date.UTC(2026, 2, 6, 5, 0);
    instance.spec.compute([{ time: t }], { session: "America/New_York" } as never);
    expect(seen.at(-1)).toEqual([t - 5 * 3_600_000]);
    expect(patchNativeVwap({})).toBe(false);
  });
});

describe("Fibonacci retracements, as TradingView draws them", () => {
  type Fib = vela.Drawing & {
    levelLines(proj: unknown): { ratio: number; price: number }[];
    priceRange(): { min: number; max: number } | null;
    writeProps(): Record<string, unknown>;
    schema(): { fields: { path: string; label: string }[] };
    applySettings(patch: Record<string, unknown>): void;
  };
  const low = { time: T0, price: 100 };
  const high = { time: T0 + 10 * Q, price: 200 };
  const px = { xOf: (t: number) => t, yOf: (p: number) => p };
  const levels = (d: Fib) =>
    Object.fromEntries(d.levelLines(px).map((l) => [l.ratio, +l.price.toFixed(2)]));

  it("measure from the second point: drawn low to high, 0 is the high and 1 the low", () => {
    const d = vela.createDrawing("fibretracement", {
      paneId: "price",
      anchors: [low, high],
    }) as Fib;
    expect(levels(d)).toMatchObject({ 0: 200, 0.236: 176.4, 0.382: 161.8, 0.618: 138.2, 1: 100 });
    expect(d.writeProps()).toMatchObject({ reverse: false });
    expect(d.priceRange()).toEqual({ min: 100, max: 200 });
  });

  it("Reverse measures from the first point, and is a setting", () => {
    const d = vela.createDrawing("fibretracement", {
      paneId: "price",
      anchors: [low, high],
    }) as Fib;
    expect(d.schema().fields.some((f) => f.path === "reverse" && f.label === "Reverse")).toBe(true);
    d.applySettings({ reverse: true });
    expect(levels(d)).toMatchObject({ 0: 100, 0.236: 123.6, 0.618: 161.8, 1: 200 });
    expect(d.writeProps()).toMatchObject({ reverse: true });
  });

  it("a retracement saved before stays where it was drawn", () => {
    const d = vela.createDrawing("fibretracement", {
      paneId: "price",
      anchors: [low, high],
      props: { reverse: true },
    }) as Fib;
    expect(levels(d)).toMatchObject({ 0.618: 161.8 });
  });
});

describe("drawing labels show prices with the instrument's decimals", () => {
  it("six significant digits, between 2 and 8 decimals", async () => {
    const { levelPrice } = await import("../src/lib/price-format");
    expect(levelPrice(83665.162)).toBe("83665.16");
    expect(levelPrice(2682.8)).toBe("2682.80");
    expect(levelPrice(1.0825)).toBe("1.08250");
    expect(levelPrice(150.1234)).toBe("150.123");
    expect(levelPrice(0.00001234)).toBe("0.00001234");
    expect(levelPrice(-12.5)).toBe("-12.5000");
    expect(levelPrice(0)).toBe("0.00");
    expect(levelPrice(Number.NaN)).toBe("0");
  });

  type Rows = { entryLines(proj: unknown): { numberText: string }[] };
  const px = { xOf: (t: number) => t, yOf: (p: number) => p };
  const eurusd = [
    { time: T0, price: 1.0825 },
    { time: T0 + 10 * Q, price: 1.0975 },
    { time: T0 + 20 * Q, price: 1.09 },
  ];

  it("on Fibonacci retracements, extensions and trend-based extensions", () => {
    const texts = (type: vela.DrawingTypeKey, points: number) =>
      (
        vela.createDrawing(type, {
          paneId: "price",
          anchors: eurusd.slice(0, points),
        }) as unknown as Rows
      )
        .entryLines(px)
        .map((r) => r.numberText);
    expect(texts("fibretracement", 2)).toContain("0.618 (1.08823)");
    expect(texts("fibextension", 2)).toContain("1.618 (1.10677)");
    expect(texts("fibextensiontrend", 3)).toContain("1 (1.10500)");
  });

  it("on the position tool's target and stop", () => {
    const d = vela.createDrawing("position", {
      paneId: "price",
      anchors: [
        { time: T0, price: 1.0825 },
        { time: T0 + 10 * Q, price: 1.0875 },
        { time: T0 + 10 * Q, price: 1.08 },
      ],
    }) as unknown as { showPrices: boolean; targetLabel(): string; stopLabel(): string };
    d.showPrices = true;
    expect(d.targetLabel()).toMatch(/@ 1\.08\d{3}$/);
    expect(d.stopLabel()).toMatch(/@ 1\.08\d{3}$/);
  });
});

describe("the date and price range", () => {
  it("spans read without a rounded-up unit", async () => {
    const { formatSpan } = await import("../src/lib/price-format");
    const H = 3_600_000;
    expect(formatSpan(23.99 * H + 24 * H)).toBe("2d");
    expect(formatSpan(59.7 * 60_000)).toBe("1h");
    expect(formatSpan(26 * H + 30 * 60_000)).toBe("1d 3h");
    expect(formatSpan(5 * H + 20 * 60_000)).toBe("5h 20m");
    expect(formatSpan(-45 * 60_000)).toBe("45m");
    expect(formatSpan(30_000)).toBe("30s");
  });

  it("shows the change in the instrument's decimals and a signed bar count", () => {
    const d = vela.createDrawing("datepricerange", {
      paneId: "price",
      anchors: [
        { time: T0 + 10 * Q, price: 1.0825 },
        { time: T0, price: 1.086 },
      ],
    }) as unknown as { priceLabel(): string; timeLabel(proj: unknown): string };
    expect(d.priceLabel()).toBe("+0.00350 (+0.32%)");
    expect(d.timeLabel({ barsBetween: () => 10 })).toBe("-10 bars, 2h 30m");
  });
});
