import { describe, expect, it } from "vitest";
import { PineTS } from "pinets";
import { INDICATOR_LIBRARY } from "../src/lib/indicator-library";

/**
 * Built-in indicators against plain reference formulas, candle by candle: the values, where
 * they start, and what a flat or volumeless market reads.
 */

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
};

const series = (closes: number[], volume = 1000): Candle[] =>
  closes.map((close, i) => ({
    open: closes[i - 1] ?? close,
    high: Math.max(close, closes[i - 1] ?? close) + 0.5,
    low: Math.min(close, closes[i - 1] ?? close) - 0.5,
    close,
    volume,
    openTime: Date.UTC(2026, 0, 1) + i * 3_600_000,
  }));

const source = (key: string) => INDICATOR_LIBRARY.find((i) => i.key === key)!.source;

async function plots(key: string, candles: Candle[]) {
  const { plots } = await new PineTS(candles).run(source(key));
  return Object.fromEntries(
    Object.entries(plots as Record<string, { data?: { value: unknown }[] }>).map(([name, p]) => [
      name,
      (p.data ?? []).map((d) => (typeof d.value === "number" ? d.value : NaN)),
    ]),
  ) as Record<string, number[]>;
}

/** Least-squares fit of the last `len` closes ending at `end`: line value at `end` and RMS residual. */
function regression(closes: number[], end: number, len: number) {
  const ys = closes.slice(end - len + 1, end + 1);
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / len;
  const my = ys.reduce((a, b) => a + b, 0) / len;
  const slope =
    xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) /
    xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const at = (x: number) => my + slope * (x - mx);
  const rms = Math.sqrt(ys.reduce((a, y, i) => a + (y - at(i)) ** 2, 0) / len);
  return { line: at(len - 1), rms };
}

describe("the linear regression channel", () => {
  // A steady trend with a small wiggle: the closes hug the line.
  const closes = Array.from({ length: 260 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 0.3);

  it("puts its bands two deviations of the closes from the fitted line away", async () => {
    const out = await plots("linreg", series(closes));
    for (const end of [99, 150, 259]) {
      const { line, rms } = regression(closes, end, 100);
      expect(out.Regression![end]).toBeCloseTo(line, 6);
      expect(out.Upper![end]! - out.Regression![end]!).toBeCloseTo(2 * rms, 6);
      expect(out.Regression![end]! - out.Lower![end]!).toBeCloseTo(2 * rms, 6);
    }
    // On a trend, the bands stay near the line (they used the spread around the mean).
    expect(out.Upper![259]! - out.Regression![259]!).toBeLessThan(1);
  });

  it("starts once a full window of closes exists", async () => {
    const out = await plots("linreg", series(closes));
    expect(Number.isNaN(out.Upper![98]!)).toBe(true);
    expect(Number.isFinite(out.Upper![99]!)).toBe(true);
  });
});

describe("oscillators without a reading", () => {
  const flat = series(Array.from({ length: 60 }, () => 100)).map((c) => ({
    ...c,
    high: 100,
    low: 100,
  }));
  const moving = series(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 4));

  it("Williams %R and CCI show nothing on a flat market instead of an extreme", async () => {
    expect((await plots("williams-r", flat))["%R"]!.at(-1)).toBeNaN();
    expect((await plots("cci", flat)).CCI!.at(-1)).toBeNaN();
  });

  it("MFI shows nothing without volume instead of 100", async () => {
    const volumeless = moving.map((c) => ({ ...c, volume: 0 }));
    expect((await plots("mfi", volumeless)).MFI!.at(-1)).toBeNaN();
  });

  it("they read normally on a moving market with volume", async () => {
    const wpr = (await plots("williams-r", moving))["%R"]!.at(-1)!;
    const cci = (await plots("cci", moving)).CCI!.at(-1)!;
    const mfi = (await plots("mfi", moving)).MFI!.at(-1)!;
    expect(wpr).toBeGreaterThanOrEqual(-100);
    expect(wpr).toBeLessThanOrEqual(0);
    expect(Number.isFinite(cci)).toBe(true);
    expect(mfi).toBeGreaterThanOrEqual(0);
    expect(mfi).toBeLessThanOrEqual(100);
  });
});

describe("the VWAP, as TradingView's", () => {
  const Q = 15 * 60_000;
  // Three days of 15-minute candles from 2026-03-06 20:00 UTC, across New York's switch to
  // daylight saving time (2026-03-08).
  const start = Date.UTC(2026, 2, 6, 20, 0);
  const candles: Candle[] = Array.from({ length: 3 * 96 }, (_, i) => {
    const mid = 100 + Math.sin(i / 9) * 3;
    return {
      open: mid - 0.2,
      close: mid + 0.2,
      high: mid + 0.6,
      low: mid - 0.7,
      volume: 50 + (i % 5) * 10,
      openTime: start + i * Q,
    };
  });
  const vwapScript = (patch: Record<string, string> = {}) => {
    let src = source("vwap");
    for (const [from, to] of Object.entries(patch)) src = src.replace(from, to);
    return src;
  };
  const run = async (src: string, bars = candles) => {
    const { plots } = await new PineTS(bars).run(src);
    return Object.fromEntries(
      Object.entries(plots as Record<string, { data?: { value: unknown }[] }>).map(([k, p]) => [
        k,
        (p.data ?? []).map((d) => (typeof d.value === "number" ? d.value : NaN)),
      ]),
    ) as Record<string, number[]>;
  };
  /** Reference: hlc3 VWAP and deviation, reset where `periodOf` changes. */
  const reference = (periodOf: (time: number) => string) => {
    let key = "";
    let v = 0;
    let pv = 0;
    let p2v = 0;
    return candles.map((c) => {
      const k = periodOf(c.openTime);
      if (k !== key) {
        key = k;
        v = pv = p2v = 0;
      }
      const tp = (c.high + c.low + c.close) / 3;
      v += c.volume;
      pv += tp * c.volume;
      p2v += tp * tp * c.volume;
      const mid = pv / v;
      return { mid, dev: Math.sqrt(Math.max(0, p2v / v - mid * mid)) };
    });
  };
  const dayIn =
    (zone: string, shift = 0) =>
    (time: number) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(time + shift);

  it("resets at midnight UTC by default, the session of crypto exchanges", async () => {
    const out = await run(vwapScript());
    const ref = reference(dayIn("UTC"));
    for (const i of [0, 15, 16, 100, 200, candles.length - 1]) {
      expect(out.VWAP![i]).toBeCloseTo(ref[i]!.mid, 6);
      expect(out["Upper band #1"]![i]! - out.VWAP![i]!).toBeCloseTo(ref[i]!.dev, 6);
    }
    expect(out["Upper band #2"]!.every(Number.isNaN)).toBe(true);
  });

  it("resets at the exchange's midnight in its time zone, across daylight saving", async () => {
    const out = await run(
      vwapScript({
        'input.string("UTC", "Session time zone"':
          'input.string("America/New_York", "Session time zone"',
      }),
    );
    const ref = reference(dayIn("America/New_York"));
    for (let i = 0; i < candles.length; i += 7) expect(out.VWAP![i]).toBeCloseTo(ref[i]!.mid, 6);
  });

  it("starts forex days at 17:00 New York", async () => {
    const out = await run(
      vwapScript({
        'input.string("UTC", "Session time zone"':
          'input.string("Forex (17:00 New York)", "Session time zone"',
      }),
    );
    const ref = reference(dayIn("America/New_York", 7 * 3_600_000));
    for (let i = 0; i < candles.length; i += 5) expect(out.VWAP![i]).toBeCloseTo(ref[i]!.mid, 6);
  });

  it("weekly anchors reset on Monday", async () => {
    const out = await run(
      vwapScript({
        'input.string("Session", "Anchor period"': 'input.string("Week", "Anchor period"',
      }),
    );
    // 2026-03-09 is a Monday: the week key changes there and nowhere else in the data.
    const monday = Date.UTC(2026, 2, 9);
    const ref = reference((t) => (t >= monday ? "b" : "a"));
    for (let i = 0; i < candles.length; i += 9) expect(out.VWAP![i]).toBeCloseTo(ref[i]!.mid, 6);
  });

  it("can hide itself on daily candles", async () => {
    const daily = candles.map((c, i) => ({
      ...c,
      openTime: Date.UTC(2026, 0, 1) + i * 86_400_000,
    }));
    const src = vwapScript({
      'input.bool(false, "Hide VWAP on 1D or above")':
        'input.bool(true, "Hide VWAP on 1D or above")',
    });
    const { plots } = await new PineTS(daily, "BINANCE:BTCUSDT", "1D").run(src);
    const vwap = (plots as Record<string, { data: { value: unknown }[] }>).VWAP!.data;
    expect(vwap.every((d) => typeof d.value !== "number" || Number.isNaN(d.value))).toBe(true);
  });
});

describe("historical volatility, as TradingView's HV", () => {
  const closes = Array.from(
    { length: 60 },
    (_, i) => 100 * Math.exp(0.01 * Math.sin(i) + i * 0.002),
  );
  /** Population stdev of the last 10 log returns, annualised with sqrt(365 / per). */
  const reference = (per: number) => {
    const rets = closes
      .slice(-11)
      .map((c, i, all) => (i ? Math.log(c / all[i - 1]!) : NaN))
      .slice(1);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    return 100 * sd * Math.sqrt(365 / per);
  };
  const run = async (timeframe: string) => {
    const { plots } = await new PineTS(series(closes), "BINANCE:BTCUSDT", timeframe).run(
      source("hist-vol"),
    );
    return (plots as Record<string, { data: { value: number }[] }>)["HV %"]!.data.at(-1)!.value;
  };
  it("annualises by days up to daily candles, and by weeks above", async () => {
    expect(await run("60")).toBeCloseTo(reference(1), 6);
    expect(await run("1D")).toBeCloseTo(reference(1), 6);
    expect(await run("1W")).toBeCloseTo(reference(7), 6);
  });
});
