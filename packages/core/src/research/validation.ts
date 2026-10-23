import {
  DAYS_PER_YEAR,
  runBacktest,
  type BacktestOptions,
  type DailyRecord,
  type Instrument,
  type StrategyFn,
} from "./backtest";
import { moments, performance, sampleSd, usable } from "./metrics";

/**
 * Validation: is a backtest's result more than luck and selection? Every method here works on
 * daily returns and is deterministic (resampling uses a seeded generator).
 */

// ── Normal distribution ──

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error("normalQuantile: p must be in (0, 1)");
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}

// ── Sharpe ratio statistics (Bailey & López de Prado) ──

/** Daily (non-annualized) Sharpe ratio of a return series. */
export const dailySharpe = (returns: readonly number[]): number | null => {
  const sd = sampleSd(returns);
  return usable(sd) ? returns.reduce((a, b) => a + b, 0) / returns.length / sd : null;
};

/**
 * Probabilistic Sharpe Ratio: the probability that the true Sharpe exceeds `benchmark`, given
 * the observed one, the sample length and the returns' skewness and kurtosis:
 * Z[(SR − SR*)·√(T − 1) / √(1 − γ₃·SR + (γ₄ − 1)/4·SR²)], all per period (daily), γ₄ the
 * (non-excess) kurtosis.
 */
export function probabilisticSharpe(returns: readonly number[], benchmark = 0): number | null {
  const sr = dailySharpe(returns);
  const { skewness, kurtosis } = moments(returns);
  if (sr === null || skewness === null || kurtosis === null) return null;
  const g4 = kurtosis + 3;
  const denominator = 1 - skewness * sr + ((g4 - 1) / 4) * sr * sr;
  if (!(denominator > 0)) return null;
  return normalCdf(((sr - benchmark) * Math.sqrt(returns.length - 1)) / Math.sqrt(denominator));
}

const EULER_GAMMA = 0.5772156649015329;

/**
 * The Sharpe ratio expected from the best of `trials` independent strategies with no skill,
 * whose Sharpe estimates vary with variance `variance` (per period):
 * √V·((1 − γ)·Z⁻¹[1 − 1/N] + γ·Z⁻¹[1 − 1/(N·e)]).
 */
export function expectedMaxSharpe(trials: number, variance: number): number {
  if (trials < 2 || !(variance > 0)) return 0;
  return (
    Math.sqrt(variance) *
    ((1 - EULER_GAMMA) * normalQuantile(1 - 1 / trials) +
      EULER_GAMMA * normalQuantile(1 - 1 / (trials * Math.E)))
  );
}

/**
 * Deflated Sharpe Ratio: the Probabilistic Sharpe Ratio against the Sharpe expected from the
 * best of all the configurations tried (`trialSharpes`, per period), so a winner picked from
 * many tries must clear a higher bar. Null without at least two trials.
 */
export function deflatedSharpe(
  returns: readonly number[],
  trialSharpes: readonly number[],
): { dsr: number | null; threshold: number; trials: number } {
  const finite = trialSharpes.filter(Number.isFinite);
  const m = finite.reduce((a, b) => a + b, 0) / (finite.length || 1);
  const variance =
    finite.length > 1 ? finite.reduce((s, x) => s + (x - m) ** 2, 0) / (finite.length - 1) : 0;
  const threshold = expectedMaxSharpe(finite.length, variance);
  return {
    dsr: finite.length > 1 ? probabilisticSharpe(returns, threshold) : null,
    threshold,
    trials: finite.length,
  };
}

// ── Probability of Backtest Overfitting (CSCV) ──

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === k) return void out.push([...chosen]);
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return out;
}

/**
 * Combinatorially Symmetric Cross-Validation (Bailey, Borwein, López de Prado & Zhu): the rows
 * (days) of `matrix[config][day]` are cut into `blocks` equal parts; for every way of choosing
 * half of them as in-sample, the best in-sample configuration's rank out of sample is recorded.
 * PBO is the share of splits where it ranks below the median out of sample.
 */
export function probabilityOfOverfitting(
  matrix: readonly (readonly number[])[],
  blocks = 10,
): { pbo: number | null; splits: number; logits: number[] } {
  const configs = matrix.length;
  const length = Math.min(...matrix.map((r) => r.length));
  if (configs < 2 || blocks < 2 || blocks % 2 || length < blocks * 5)
    return { pbo: null, splits: 0, logits: [] };
  const size = Math.floor(length / blocks);
  const parts = Array.from(
    { length: blocks },
    (_, b) => [b * size, b === blocks - 1 ? length : (b + 1) * size] as const,
  );
  const score = (row: readonly number[], chosen: number[]) => {
    const values: number[] = [];
    for (const b of chosen) for (let i = parts[b]![0]; i < parts[b]![1]; i++) values.push(row[i]!);
    return dailySharpe(values) ?? -Infinity;
  };
  const logits: number[] = [];
  for (const train of combinations(blocks, blocks / 2)) {
    const test = parts.map((_, i) => i).filter((i) => !train.includes(i));
    const inSample = matrix.map((row) => score(row, train));
    const best = inSample.indexOf(Math.max(...inSample));
    const outSample = matrix.map((row) => score(row, test));
    // Relative rank of the in-sample winner out of sample (1 = worst, N = best), as ω = r/(N+1).
    const rank = outSample.filter((x) => x < outSample[best]!).length + 1;
    const omega = rank / (configs + 1);
    logits.push(Math.log(omega / (1 - omega)));
  }
  return {
    pbo: logits.filter((l) => l <= 0).length / logits.length,
    splits: logits.length,
    logits,
  };
}

// ── Bootstrap ──

/** A small seeded generator (mulberry32), so resampling is reproducible. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stationary bootstrap (Politis & Romano): resampled series built from blocks of random
 * (geometric) length, wrapping around, which keeps the returns' short-range dependence. Gives
 * a percentile interval for the annualized Sharpe ratio and the share of resamples above 0.
 */
export function bootstrapSharpe(
  returns: readonly number[],
  options: { samples?: number; meanBlock?: number; seed?: number } = {},
): { low: number; high: number; median: number; positive: number } | null {
  const n = returns.length;
  if (n < 30) return null;
  const samples = options.samples ?? 2000;
  const p = 1 / (options.meanBlock ?? 10);
  const rand = seededRandom(options.seed ?? 1);
  const values: number[] = [];
  const draw = new Array<number>(n);
  for (let s = 0; s < samples; s++) {
    let i = Math.floor(rand() * n);
    for (let k = 0; k < n; k++) {
      draw[k] = returns[i]!;
      i = rand() < p ? Math.floor(rand() * n) : (i + 1) % n;
    }
    const sr = dailySharpe(draw);
    if (sr !== null) values.push(sr * Math.sqrt(DAYS_PER_YEAR));
  }
  // A series with no dispersion (a book that never traded) has no Sharpe ratio to resample.
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]!;
  return {
    low: at(0.025),
    high: at(0.975),
    median: at(0.5),
    positive: values.filter((v) => v > 0).length / values.length,
  };
}

// ── Walk-forward ──

export interface WalkForwardFold {
  trainFrom: number;
  trainTo: number;
  testFrom: number;
  testTo: number;
  /** The configuration chosen on the training window, and its training Sharpe. */
  chosen: string;
  trainSharpe: number | null;
  testDays: DailyRecord[];
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  /** The out-of-sample days, every fold's test window in order. */
  outOfSample: DailyRecord[];
  /** Configurations × folds evaluated (each a trial for selection-bias accounting). */
  trials: number;
}

/**
 * Walk-forward: on each training window every configuration is backtested and the best by
 * Sharpe is chosen; it then trades the next test window, which no choice ever saw. Windows
 * roll forward by the test length. Strategies see the history before each window (warm-up),
 * never after it.
 */
export function walkForward(
  instruments: readonly Instrument[],
  configs: readonly { id: string; strategy: StrategyFn }[],
  calendar: readonly number[],
  options: { trainDays: number; testDays: number; warmup: number } & Pick<
    BacktestOptions,
    "costs" | "maxGross"
  >,
): WalkForwardResult {
  const folds: WalkForwardFold[] = [];
  let trials = 0;
  for (
    let start = options.warmup;
    start + options.trainDays + options.testDays < calendar.length - 2;
    start += options.testDays
  ) {
    const trainFrom = calendar[start]!;
    const trainTo = calendar[start + options.trainDays - 1]!;
    const testFrom = calendar[start + options.trainDays]!;
    const testTo =
      calendar[Math.min(calendar.length - 3, start + options.trainDays + options.testDays - 1)]!;
    let best: { id: string; strategy: StrategyFn; sharpe: number | null } | null = null;
    for (const config of configs) {
      trials++;
      const run = runBacktest(instruments, config.strategy, {
        ...options,
        warmup: options.warmup,
        from: trainFrom,
        to: trainTo,
      });
      const sharpe = performance(
        run.days.map((d) => d.ret),
        options.costs?.cashRate ?? 0,
      ).sharpe;
      if (!best || (sharpe ?? -Infinity) > (best.sharpe ?? -Infinity)) best = { ...config, sharpe };
    }
    const test = runBacktest(instruments, best!.strategy, {
      ...options,
      warmup: options.warmup,
      from: testFrom,
      to: testTo,
    });
    folds.push({
      trainFrom,
      trainTo,
      testFrom,
      testTo,
      chosen: best!.id,
      trainSharpe: best!.sharpe,
      testDays: test.days,
    });
  }
  return { folds, outOfSample: folds.flatMap((f) => f.testDays), trials };
}

// ── Regimes (from the benchmark's past only) ──

export type RegimeLabel =
  "uptrend-calm" | "uptrend-volatile" | "downtrend-calm" | "downtrend-volatile";

/**
 * Each day's market regime from the benchmark's bars before it: trend is the previous close
 * against its 200-day average; volatility is the previous 30 days' realized volatility against
 * the median of that measure over all earlier days. Days without enough history get none.
 */
export function regimes(
  bars: readonly { time: number; close: number }[],
): Map<number, RegimeLabel> {
  const out = new Map<number, RegimeLabel>();
  const vols: number[] = [];
  const returns = bars.map((b, i) => (i ? Math.log(b.close / bars[i - 1]!.close) : 0));
  for (let i = 201; i < bars.length; i++) {
    const prev = i - 1;
    const sma = bars.slice(prev - 199, prev + 1).reduce((s, b) => s + b.close, 0) / 200;
    const vol = sampleSd(returns.slice(prev - 29, prev + 1))!;
    const sorted = [...vols].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : vol;
    vols.push(vol);
    out.set(
      bars[i]!.time,
      `${bars[prev]!.close >= sma ? "uptrend" : "downtrend"}-${vol > median ? "volatile" : "calm"}` as RegimeLabel,
    );
  }
  return out;
}

/** Performance of the days in each regime. */
export function byRegime(
  days: readonly DailyRecord[],
  labels: Map<number, RegimeLabel>,
  cashRate = 0,
) {
  const groups = new Map<RegimeLabel, number[]>();
  for (const d of days) {
    const label = labels.get(d.time);
    if (!label) continue;
    groups.set(label, [...(groups.get(label) ?? []), d.ret]);
  }
  return [...groups.entries()].map(([regime, rets]) => {
    const p = performance(rets, cashRate);
    return {
      regime,
      days: rets.length,
      annualizedMean: p.meanDaily * DAYS_PER_YEAR,
      sharpe: p.sharpe,
      worstDay: p.worstDay,
    };
  });
}
