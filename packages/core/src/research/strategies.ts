import {
  DAYS_PER_YEAR,
  type DailyBar,
  type FundingEvent,
  type StrategyFn,
  type StrategyView,
} from "./backtest";
import { sampleSd } from "./metrics";

/**
 * The candidate strategies, each a pure function of what it may see on day t. Parameters
 * come from small, pre-declared grids (`STRATEGY_FAMILIES`), so every configuration tried is
 * counted and the selection bias can be measured (Deflated Sharpe, PBO).
 */

const closes = (bars: readonly DailyBar[]) => bars.map((b) => b.close);
const last = <T>(xs: readonly T[]) => xs[xs.length - 1];

/** Realized volatility of the last `days` daily log returns, annualized (null without enough). */
export function realizedVol(bars: readonly DailyBar[], days: number): number | null {
  if (bars.length < days + 1) return null;
  const c = closes(bars).slice(-days - 1);
  const r = c.slice(1).map((x, i) => Math.log(x / c[i]!));
  const sd = sampleSd(r);
  return sd === null ? null : sd * Math.sqrt(DAYS_PER_YEAR);
}

export const sma = (bars: readonly DailyBar[], days: number): number | null =>
  bars.length < days
    ? null
    : closes(bars)
        .slice(-days)
        .reduce((a, b) => a + b, 0) / days;

const pastReturn = (bars: readonly DailyBar[], days: number): number | null =>
  bars.length < days + 1
    ? null
    : bars[bars.length - 1]!.close / bars[bars.length - 1 - days]!.close - 1;

const round = (x: number | null, digits = 4) => (x === null ? null : Number(x.toFixed(digits)));

// ── Benchmarks ──

export const buyAndHold =
  (asset: string): StrategyFn =>
  () => ({
    weights: { [asset]: 1 },
    reason: "Always fully invested (passive benchmark).",
  });

export const cash = (): StrategyFn => () => ({
  weights: {},
  reason: "Always in cash (risk-free baseline).",
});

// ── Trend ──

/** Time-series momentum, long or flat: long while the past `lookback`-day return is positive. */
export const timeSeriesMomentum =
  (p: { asset: string; lookback: number }): StrategyFn =>
  (view) => {
    const r = pastReturn(view.bars[p.asset]!, p.lookback);
    const long = r !== null && r > 0;
    return {
      weights: { [p.asset]: long ? 1 : 0 },
      reason:
        r === null
          ? "Not enough history."
          : `Past ${p.lookback}-day return ${(r * 100).toFixed(1)}%: ${long ? "positive, long" : "not positive, flat"}.`,
      inputs: { pastReturn: round(r) },
    };
  };

/** Long while the close is above its `window`-day simple moving average, else flat. */
export const movingAverageTrend =
  (p: { asset: string; window: number }): StrategyFn =>
  (view) => {
    const bars = view.bars[p.asset]!;
    const avg = sma(bars, p.window);
    const close = last(bars)!.close;
    const long = avg !== null && close > avg;
    return {
      weights: { [p.asset]: long ? 1 : 0 },
      reason:
        avg === null
          ? "Not enough history."
          : `Close ${close.toFixed(2)} ${long ? "above" : "below"} its ${p.window}-day average ${avg.toFixed(2)}.`,
      inputs: { close, average: round(avg, 2) },
    };
  };

// ── Volatility ──

/**
 * Volatility targeting: hold the asset at `target / realized volatility` of capital (capped at
 * `maxWeight`), a risk overlay rather than a forecast of returns.
 */
export const volatilityTarget =
  (p: { asset: string; target: number; lookback: number; maxWeight?: number }): StrategyFn =>
  (view) => {
    const vol = realizedVol(view.bars[p.asset]!, p.lookback);
    const w = vol ? Math.min(p.maxWeight ?? 1, p.target / vol) : 0;
    return {
      weights: { [p.asset]: w },
      reason:
        vol === null
          ? "Not enough history."
          : `Realized ${p.lookback}-day volatility ${(vol * 100).toFixed(0)}%: holding ${(w * 100).toFixed(0)}% to aim at ${(p.target * 100).toFixed(0)}%.`,
      inputs: { realizedVol: round(vol), weight: round(w) },
    };
  };

/** Regime-aware trend: long only above the moving average, sized by volatility targeting. */
export const trendWithVolTarget =
  (p: { asset: string; window: number; target: number; lookback: number }): StrategyFn =>
  (view) => {
    const bars = view.bars[p.asset]!;
    const avg = sma(bars, p.window);
    const vol = realizedVol(bars, p.lookback);
    const close = last(bars)!.close;
    const trend = avg !== null && close > avg;
    const w = trend && vol ? Math.min(1, p.target / vol) : 0;
    return {
      weights: { [p.asset]: w },
      reason:
        avg === null || vol === null
          ? "Not enough history."
          : trend
            ? `Above its ${p.window}-day average; realized volatility ${(vol * 100).toFixed(0)}%, holding ${(w * 100).toFixed(0)}%.`
            : `Below its ${p.window}-day average: flat.`,
      inputs: { close, average: round(avg, 2), realizedVol: round(vol), weight: round(w) },
    };
  };

// ── Mean reversion ──

/**
 * Short-horizon mean reversion, long or flat: buy when the close is more than `entryZ`
 * standard deviations below its `window`-day mean (and, with `trendFilter`, only while above
 * the 200-day average); sell once it is back above `exitZ`.
 */
export const meanReversion =
  (p: {
    asset: string;
    window: number;
    entryZ: number;
    exitZ: number;
    trendFilter: boolean;
  }): StrategyFn =>
  (view) => {
    const bars = view.bars[p.asset]!;
    if (bars.length < Math.max(p.window, p.trendFilter ? 200 : 0) + 1)
      return { weights: {}, reason: "Not enough history." };
    const recent = closes(bars).slice(-p.window);
    const m = recent.reduce((a, b) => a + b, 0) / p.window;
    const sd = sampleSd(recent) ?? 0;
    const close = last(bars)!.close;
    const z = sd > 0 ? (close - m) / sd : 0;
    const trendOk = !p.trendFilter || close > (sma(bars, 200) ?? Infinity);
    const holding = (view.current[p.asset] ?? 0) > 0;
    const long = holding ? z < p.exitZ : z < -p.entryZ && trendOk;
    return {
      weights: { [p.asset]: long ? 1 : 0 },
      reason: `Close ${z.toFixed(2)} standard deviations from its ${p.window}-day mean: ${long ? (holding ? "still below the exit, hold" : "oversold, buy") : holding ? "back to the exit, sell" : "no entry"}.`,
      inputs: { z: round(z, 3), trendOk: trendOk ? "yes" : "no" },
    };
  };

// ── Relative strength ──

/** Hold whichever of `assets` had the higher `lookback`-day return, if positive; else cash. */
export const relativeStrength =
  (p: { assets: string[]; lookback: number }): StrategyFn =>
  (view) => {
    const scored = p.assets.map((a) => ({ a, r: pastReturn(view.bars[a]!, p.lookback) }));
    const best = scored.filter((s) => s.r !== null).sort((x, y) => y.r! - x.r!)[0];
    const hold = best && best.r! > 0 ? best.a : null;
    return {
      weights: hold ? { [hold]: 1 } : {},
      reason: best
        ? `${p.lookback}-day returns: ${scored.map((s) => `${s.a} ${s.r === null ? "n/a" : (s.r * 100).toFixed(1) + "%"}`).join(", ")}: ${hold ? `hold ${hold}` : "none positive, cash"}.`
        : "Not enough history.",
      inputs: Object.fromEntries(scored.map((s) => [s.a, round(s.r)])),
    };
  };

// ── Funding carry (delta neutral) ──

/** Funding periods a year on an 8-hour schedule. */
export const FUNDING_PERIODS_PER_YEAR = 3 * DAYS_PER_YEAR;

/** Mean of the last `count` funding rates, annualized (null without enough). */
export function trailingFunding(events: readonly FundingEvent[], count: number): number | null {
  if (events.length < count) return null;
  const xs = events.slice(-count);
  return (xs.reduce((s, e) => s + e.rate, 0) / count) * FUNDING_PERIODS_PER_YEAR;
}

/**
 * Cash and carry: long spot, short the perpetual for the same notional, collecting funding
 * while it is positive. Entered when the trailing funding (annualized) is above `entry`,
 * left below `exit`. `notional` is the share of capital in each leg: with the perpetual's
 * margin, a(1 + 1/leverage) ≤ 1.
 */
export const fundingCarry =
  (p: {
    spot: string;
    perp: string;
    periods: number;
    entry: number;
    exit: number;
    leverage: number;
  }): StrategyFn =>
  (view: StrategyView) => {
    const annual = trailingFunding(view.funding[p.perp] ?? [], p.periods);
    const holding = (view.current[p.perp] ?? 0) < 0;
    const on = annual !== null && (holding ? annual > p.exit : annual > p.entry);
    const notional = 1 / (1 + 1 / p.leverage);
    return {
      weights: on ? { [p.spot]: notional, [p.perp]: -notional } : {},
      reason:
        annual === null
          ? "Not enough funding history."
          : `Trailing funding ${(annual * 100).toFixed(1)}% a year (last ${p.periods} periods): ${on ? (holding ? "above the exit, keep the carry" : "above the entry, open the carry") : holding ? "below the exit, close" : "below the entry, stay out"}.`,
      inputs: { annualizedFunding: round(annual), notional: round(notional) },
    };
  };
