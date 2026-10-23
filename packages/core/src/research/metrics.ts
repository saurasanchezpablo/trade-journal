import { DAYS_PER_YEAR, type DailyRecord } from "./backtest";

/**
 * Performance of a daily return series. Conventions, stated once:
 * - returns are simple daily returns, net of every cost the backtest charged;
 * - annualized over 365 days (crypto trades every day): CAGR from compounded growth,
 *   volatility as the daily standard deviation (sample, n − 1) × √365;
 * - Sharpe and Sortino on daily excess returns over the cash rate, × √365; Sortino's downside
 *   deviation is the root mean square of the negative excess returns over all days;
 * - drawdowns on the compounded equity curve; duration in days from a peak to its recovery
 *   (or to the end of the data if never recovered);
 * - VaR and CVaR at 95% as historical daily quantiles (positive numbers are losses).
 */

export interface PerformanceMetrics {
  days: number;
  years: number;
  totalReturn: number;
  cagr: number | null;
  volatility: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number;
  maxDrawdownDays: number;
  calmar: number | null;
  /** Mean daily return and its standard deviation (for statistics on the Sharpe ratio). */
  meanDaily: number;
  sdDaily: number | null;
  skewness: number | null;
  /** Excess (Fisher) kurtosis. */
  kurtosis: number | null;
  var95: number | null;
  cvar95: number | null;
  bestDay: number | null;
  worstDay: number | null;
  positiveDays: number | null;
}

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** A dispersion too small to divide by: rounding noise on a constant series, not risk. */
export const usable = (sd: number | null): sd is number => sd !== null && sd >= 1e-12;

/** Sample skewness and excess kurtosis (population moments, as most references define them). */
export function moments(xs: readonly number[]): {
  skewness: number | null;
  kurtosis: number | null;
} {
  if (xs.length < 3) return { skewness: null, kurtosis: null };
  const m = mean(xs);
  const m2 = mean(xs.map((x) => (x - m) ** 2));
  if (!(m2 > 0)) return { skewness: null, kurtosis: null };
  const m3 = mean(xs.map((x) => (x - m) ** 3));
  const m4 = mean(xs.map((x) => (x - m) ** 4));
  return { skewness: m3 / m2 ** 1.5, kurtosis: m4 / m2 ** 2 - 3 };
}

/** The `p` quantile with linear interpolation between order statistics (as numpy's default). */
export function quantile(xs: readonly number[], p: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (position - lo);
}

export function drawdowns(returns: readonly number[]): {
  maxDrawdown: number;
  maxDrawdownDays: number;
  series: number[];
} {
  let equity = 1;
  let peak = 1;
  let peakIndex = -1;
  let maxDrawdown = 0;
  let maxDrawdownDays = 0;
  const series: number[] = [];
  for (const [i, r] of returns.entries()) {
    equity *= 1 + r;
    if (equity >= peak) {
      peak = equity;
      peakIndex = i;
    }
    const dd = 1 - equity / peak;
    series.push(dd);
    maxDrawdown = Math.max(maxDrawdown, dd);
    if (dd > 0) maxDrawdownDays = Math.max(maxDrawdownDays, i - peakIndex);
  }
  return { maxDrawdown, maxDrawdownDays, series };
}

/** Daily returns in excess of the cash rate (what every Sharpe statistic is computed on). */
export const excessReturns = (returns: readonly number[], cashRate: number) =>
  returns.map((r) => r - cashRate / DAYS_PER_YEAR);

export function performance(returns: readonly number[], cashRate = 0): PerformanceMetrics {
  const n = returns.length;
  const years = n / DAYS_PER_YEAR;
  const growth = returns.reduce((g, r) => g * (1 + r), 1);
  const excess = excessReturns(returns, cashRate);
  const sd = sampleSd(returns);
  const sdExcess = sampleSd(excess);
  const downside = n ? Math.sqrt(mean(excess.map((x) => Math.min(0, x) ** 2))) : 0;
  const { maxDrawdown, maxDrawdownDays } = drawdowns(returns);
  const cagr = n && growth > 0 ? growth ** (1 / years) - 1 : n ? -1 : null;
  const var95 = quantile(returns, 0.05);
  const tail = var95 === null ? [] : returns.filter((r) => r <= var95);
  const { skewness, kurtosis } = moments(returns);
  return {
    days: n,
    years,
    totalReturn: growth - 1,
    cagr,
    volatility: sd === null ? null : sd * Math.sqrt(DAYS_PER_YEAR),
    sharpe: usable(sdExcess) ? (mean(excess) / sdExcess) * Math.sqrt(DAYS_PER_YEAR) : null,
    sortino: downside > 1e-12 ? (mean(excess) / downside) * Math.sqrt(DAYS_PER_YEAR) : null,
    maxDrawdown,
    maxDrawdownDays,
    calmar: cagr !== null && maxDrawdown > 0 ? cagr / maxDrawdown : null,
    meanDaily: mean(returns),
    sdDaily: sd,
    skewness,
    kurtosis,
    var95: var95 === null ? null : -var95,
    cvar95: tail.length ? -mean(tail) : null,
    bestDay: n ? Math.max(...returns) : null,
    worstDay: n ? Math.min(...returns) : null,
    positiveDays: n ? returns.filter((r) => r > 0).length / n : null,
  };
}

export interface TradingMetrics {
  /** Σ|Δweight| a year: 2 means the book is bought and sold once a year. */
  annualTurnover: number;
  /** Mean Σ|weight|: how much of the capital is at work. */
  exposure: number;
  /** A trade: a run of days with a non-zero position in the same direction. */
  trades: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  /** Costs as a share of starting capital, summed over the period. */
  fees: number;
  slippage: number;
  funding: number;
  cashIncome: number;
}

/** Trades, turnover and costs of a backtest's days. */
export function tradingMetrics(days: readonly DailyRecord[]): TradingMetrics {
  const years = days.length / DAYS_PER_YEAR;
  const trades: number[] = [];
  let open: { sign: number; growth: number } | null = null;
  const gross = (w: Record<string, number>) =>
    Object.values(w).reduce((s, x) => s + Math.abs(x), 0);
  const direction = (w: Record<string, number>) =>
    Math.sign(Object.values(w).reduce((s, x) => s + x, 0)) || (gross(w) > 0 ? 1 : 0);
  for (const day of days) {
    const sign = gross(day.weights) > 0 ? direction(day.weights) : 0;
    if (open && sign !== open.sign) {
      trades.push(open.growth - 1);
      open = null;
    }
    if (sign !== 0) {
      open ??= { sign, growth: 1 };
      open.growth *= 1 + day.ret;
    }
  }
  if (open) trades.push(open.growth - 1);
  const wins = trades.filter((t) => t > 0);
  const losses = trades.filter((t) => t <= 0);
  const lossSum = -losses.reduce((a, b) => a + b, 0);
  return {
    annualTurnover: years > 0 ? days.reduce((s, d) => s + d.turnover, 0) / years : 0,
    exposure: days.length ? mean(days.map((d) => gross(d.weights))) : 0,
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    avgWin: wins.length ? mean(wins) : null,
    avgLoss: losses.length ? mean(losses) : null,
    profitFactor: lossSum > 0 ? wins.reduce((a, b) => a + b, 0) / lossSum : null,
    expectancy: trades.length ? mean(trades) : null,
    fees: days.reduce((s, d) => s + d.fees, 0),
    slippage: days.reduce((s, d) => s + d.slippage, 0),
    funding: days.reduce((s, d) => s + d.funding, 0),
    cashIncome: days.reduce((s, d) => s + d.cash, 0),
  };
}

export interface RelativeMetrics {
  beta: number | null;
  correlation: number | null;
  /** Annualized mean of the daily return difference (strategy − benchmark). */
  excessReturn: number;
  trackingError: number | null;
  informationRatio: number | null;
}

/** Against a benchmark's daily returns over the same days. */
export function relativeTo(
  returns: readonly number[],
  benchmark: readonly number[],
): RelativeMetrics {
  const n = Math.min(returns.length, benchmark.length);
  const a = returns.slice(0, n);
  const b = benchmark.slice(0, n);
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let vb = 0;
  let va = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i]! - ma) * (b[i]! - mb);
    vb += (b[i]! - mb) ** 2;
    va += (a[i]! - ma) ** 2;
  }
  const diff = a.map((x, i) => x - b[i]!);
  const te = sampleSd(diff);
  return {
    beta: vb > 0 ? cov / vb : null,
    correlation: va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : null,
    excessReturn: mean(diff) * DAYS_PER_YEAR,
    trackingError: te === null ? null : te * Math.sqrt(DAYS_PER_YEAR),
    informationRatio: usable(te) ? (mean(diff) / te) * Math.sqrt(DAYS_PER_YEAR) : null,
  };
}
