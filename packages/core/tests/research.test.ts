import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { research } from "../src";

const {
  alignedCalendar,
  buyAndHold,
  bootstrapSharpe,
  dailySharpe,
  deflatedSharpe,
  fundingCarry,
  meanReversion,
  movingAverageTrend,
  normalCdf,
  normalQuantile,
  performance,
  probabilisticSharpe,
  probabilityOfOverfitting,
  regimes,
  relativeStrength,
  runBacktest,
  tradingMetrics,
  volatilityTarget,
  walkForward,
} = research;
type DailyBar = research.DailyBar;
type Instrument = research.Instrument;

/**
 * Expected values come from scripts/research/reference.py, an independent numpy/scipy
 * implementation of the rules in docs/trading/BACKTESTING.md, run on a synthetic market.
 */
const ref = JSON.parse(
  readFileSync(new URL("./fixtures/research-reference.json", import.meta.url), "utf8"),
) as {
  bars: Record<"BTC" | "ETH" | "PERP", DailyBar[]>;
  funding: research.FundingEvent[];
  returns: Record<string, number[]>;
  metrics: Record<string, Record<string, number>>;
  psr: Record<string, number>;
  deflated: { dsr: number; threshold: number; trialSharpes: number[] };
  pbo: { pbo: number; splits: number; blocks: number; windows: number[]; lastDays: number };
  normal: { cdf: Record<string, number>; ppf: Record<string, number> };
  cashRate: number;
};
const excess = (returns: readonly number[]) => research.excessReturns(returns, ref.cashRate);

const btc: Instrument = { id: "BTC", kind: "spot", bars: ref.bars.BTC };
const eth: Instrument = { id: "ETH", kind: "spot", bars: ref.bars.ETH };
const perp: Instrument = { id: "PERP", kind: "perp", bars: ref.bars.PERP, funding: ref.funding };

const runs: Record<string, () => research.BacktestResult> = {
  buyHold: () => runBacktest([btc], buyAndHold("BTC")),
  smaTrend50: () => runBacktest([btc], movingAverageTrend({ asset: "BTC", window: 50 })),
  volTarget: () =>
    runBacktest([btc], volatilityTarget({ asset: "BTC", target: 0.5, lookback: 30 })),
  meanReversion: () =>
    runBacktest(
      [btc],
      meanReversion({ asset: "BTC", window: 10, entryZ: 1.5, exitZ: 0, trendFilter: false }),
    ),
  rotation: () =>
    runBacktest([btc, eth], relativeStrength({ assets: ["BTC", "ETH"], lookback: 30 })),
  carry: () =>
    runBacktest(
      [btc, perp],
      fundingCarry({ spot: "BTC", perp: "PERP", periods: 21, entry: 0.1, exit: 0.05, leverage: 2 }),
      { maxGross: 2 },
    ),
};

const close = (a: number | null | undefined, b: number, digits = 9) =>
  expect(a).toBeCloseTo(b, digits);

describe("the research backtest agrees with an independent implementation", () => {
  for (const [name, run] of Object.entries(runs)) {
    it(`${name}: every daily return matches the reference to 1e-12`, () => {
      const got = run().days.map((d) => d.ret);
      const want = ref.returns[name]!;
      expect(got).toHaveLength(want.length);
      const worst = Math.max(...got.map((r, i) => Math.abs(r - want[i]!)));
      expect(worst).toBeLessThan(1e-12);
    });

    it(`${name}: performance metrics match numpy and scipy`, () => {
      const m = performance(ref.returns[name]!, ref.cashRate);
      const want = ref.metrics[name]!;
      close(m.totalReturn, want.totalReturn!);
      close(m.cagr, want.cagr!);
      close(m.volatility, want.volatility!);
      close(m.sharpe, want.sharpe!);
      close(m.sortino, want.sortino!);
      close(m.maxDrawdown, want.maxDrawdown!);
      close(m.skewness, want.skewness!);
      close(m.kurtosis, want.kurtosis!);
      close(m.var95, want.var95!);
      close(m.cvar95, want.cvar95!);
      close(probabilisticSharpe(excess(ref.returns[name]!)), ref.psr[name]!, 6);
    });
  }

  it("the normal distribution functions match scipy", () => {
    for (const [x, p] of Object.entries(ref.normal.cdf)) close(normalCdf(Number(x)), p, 6);
    for (const [q, x] of Object.entries(ref.normal.ppf)) close(normalQuantile(Number(q)), x, 6);
  });

  it("the Deflated Sharpe Ratio of the 50-day trend among six windows matches the reference", () => {
    const d = deflatedSharpe(excess(ref.returns.smaTrend50!), ref.deflated.trialSharpes);
    close(d.threshold, ref.deflated.threshold, 6);
    close(d.dsr, ref.deflated.dsr, 6);
    expect(d.trials).toBe(6);
  });

  it("the probability of backtest overfitting matches the reference CSCV", () => {
    const matrix = ref.pbo.windows.map((window) =>
      excess(
        runBacktest([btc], movingAverageTrend({ asset: "BTC", window }))
          .days.map((d) => d.ret)
          .slice(-ref.pbo.lastDays),
      ),
    );
    const got = probabilityOfOverfitting(matrix, ref.pbo.blocks);
    expect(got.splits).toBe(ref.pbo.splits);
    close(got.pbo, ref.pbo.pbo, 12);
  });
});

/** A short market built from closes, opens equal to the previous close. */
const market = (
  id: string,
  closes: number[],
  kind: research.InstrumentKind = "spot",
): Instrument => ({
  id,
  kind,
  bars: closes.map((c, i) => ({
    time: Date.UTC(2024, 0, 1 + i),
    open: i ? closes[i - 1]! : c,
    high: c,
    low: c,
    close: c,
    volume: 1,
  })),
});
const DAY = 86_400_000;
const free = { feeBps: { spot: 0, perp: 0 }, slippageBps: { spot: 0, perp: 0 }, cashRate: 0 };

describe("a backtest cannot look ahead", () => {
  it("a strategy only ever sees bars up to the day it decides", () => {
    const inst = market(
      "A",
      Array.from({ length: 60 }, (_, i) => 100 + i),
    );
    runBacktest([inst], (view) => {
      const bars = view.bars.A!;
      expect(bars[bars.length - 1]!.time).toBe(view.time);
      expect(bars.every((b) => b.time <= view.time)).toBe(true);
      return { weights: { A: 1 } };
    });
  });

  it("changing the future does not change any earlier decision", () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 * Math.exp(Math.sin(i / 7) / 5));
    const strategy = movingAverageTrend({ asset: "A", window: 20 });
    const base = runBacktest([market("A", closes)], strategy);
    const shocked = closes.map((c, i) => (i >= 80 ? c * 3 : c));
    const other = runBacktest([market("A", shocked)], strategy);
    const cut = Date.UTC(2024, 0, 1 + 80);
    const before = (r: research.BacktestResult) =>
      r.decisions.filter((d) => d.time < cut).map((d) => d.weights.A);
    expect(before(other)).toEqual(before(base));
  });

  it("a decision on day t earns the move from the open of t + 1, not the close of t", () => {
    // Day 1 jumps 10% at the close; a strategy that buys on seeing it gets none of that jump.
    const inst = market("A", [100, 110, 110, 110, 110]);
    const run = runBacktest([inst], (view) => ({ weights: { A: view.index >= 1 ? 1 : 0 } }), {
      costs: free,
    });
    expect(run.days.every((d) => Math.abs(d.ret) < 1e-15)).toBe(true);
  });

  it("funding is seen only up to the close of the decision day", () => {
    const inst = market("P", Array(20).fill(100), "perp");
    inst.funding = Array.from({ length: 60 }, (_, i) => ({
      time: inst.bars[0]!.time + i * 8 * 3_600_000,
      rate: 0.0001,
    }));
    runBacktest([inst], (view) => {
      expect(view.funding.P!.every((f) => f.time <= view.time + DAY)).toBe(true);
      return { weights: {} };
    });
  });
});

describe("costs and funding are charged as stated", () => {
  it("each trade pays commission and slippage on the notional traded", () => {
    const inst = market("A", Array(6).fill(100));
    const costs = { feeBps: { spot: 10, perp: 5 }, slippageBps: { spot: 5, perp: 5 }, cashRate: 0 };
    const run = runBacktest([inst], (v) => ({ weights: { A: v.index % 2 ? 0.5 : 1 } }), { costs });
    expect(run.days[0]!.fees).toBeCloseTo(0.001, 15); // 0 → 1
    expect(run.days[0]!.ret).toBeCloseTo(-0.0015, 15);
    // The costs shrank equity, so the position is slightly over 1 before going to 0.5.
    const drifted = 1 / (1 - 0.0015);
    expect(run.days[1]!.turnover).toBeCloseTo(drifted - 0.5, 15);
    expect(run.days[1]!.fees).toBeCloseTo((drifted - 0.5) * 0.001, 15);
    expect(run.days[1]!.slippage).toBeCloseTo((drifted - 0.5) * 0.0005, 15);
  });

  it("holding a constant weight trades back to it as prices move", () => {
    // Half in A, which doubles: A is then 2/3 of equity and a third of the book is sold.
    const inst = market("A", [100, 100, 100, 200, 200, 200]);
    inst.bars = inst.bars.map((b, i) => ({ ...b, open: i >= 3 ? 200 : 100 }));
    const free0 = { feeBps: { spot: 0, perp: 0 }, slippageBps: { spot: 0, perp: 0 }, cashRate: 0 };
    const run = runBacktest([inst], () => ({ weights: { A: 0.5 } }), { costs: free0 });
    expect(run.days[1]!.ret).toBeCloseTo(0.5, 15);
    expect(run.days[2]!.turnover).toBeCloseTo(2 / 3 - 0.5, 15);
  });

  it("a short perpetual receives positive funding and a long one pays it", () => {
    const inst = market("P", Array(6).fill(100), "perp");
    inst.funding = Array.from({ length: 18 }, (_, i) => ({
      time: inst.bars[0]!.time + i * 8 * 3_600_000,
      rate: 0.0001,
    }));
    const short = runBacktest([inst], () => ({ weights: { P: -1 } }), { costs: free });
    const long = runBacktest([inst], () => ({ weights: { P: 1 } }), { costs: free });
    // Three funding times in (open of t + 1, open of t + 2].
    expect(short.days[0]!.funding).toBeCloseTo(0.0003, 15);
    expect(long.days[0]!.funding).toBeCloseTo(-0.0003, 15);
  });

  it("uninvested capital earns the cash rate, invested capital does not", () => {
    const inst = market("A", Array(6).fill(100));
    const run = runBacktest([inst], () => ({ weights: { A: 0.25 } }), {
      costs: { ...free, cashRate: 0.0365 },
    });
    expect(run.days[1]!.cash).toBeCloseTo(0.75 * 0.0001, 15);
  });

  it("gross exposure is capped and weights scaled proportionally", () => {
    const run = runBacktest([market("A", Array(6).fill(1)), market("B", Array(6).fill(1))], () => ({
      weights: { A: 2, B: -2 },
    }));
    expect(run.days[0]!.weights).toEqual({ A: 0.5, B: -0.5 });
  });

  it("non-finite weights count as no position", () => {
    const run = runBacktest([market("A", Array(6).fill(1))], () => ({ weights: { A: NaN } }));
    expect(run.days.every((d) => d.weights.A === 0)).toBe(true);
  });

  it("the trading summary adds up the costs the days charged", () => {
    const run = runs.meanReversion!();
    const t = tradingMetrics(run.days);
    expect(t.fees).toBeCloseTo(
      run.days.reduce((s, d) => s + d.fees, 0),
      15,
    );
    expect(t.trades).toBeGreaterThan(0);
    expect(t.exposure).toBeGreaterThan(0);
    expect(t.exposure).toBeLessThanOrEqual(1);
  });
});

describe("the calendar only trades days every instrument has", () => {
  it("a day missing from one instrument is skipped for both", () => {
    const a = market("A", Array(10).fill(1));
    const b = market("B", Array(10).fill(1));
    b.bars.splice(4, 1);
    const days = alignedCalendar([a, b]);
    expect(days).toHaveLength(9);
    expect(days).not.toContain(a.bars[4]!.time);
  });

  it("too short a history gives no days rather than an error", () => {
    expect(runBacktest([market("A", [1, 1])], buyAndHold("A")).days).toEqual([]);
    expect(performance([]).sharpe).toBeNull();
    expect(dailySharpe([0.01])).toBeNull();
  });

  it("a constant series has no Sharpe ratio instead of an infinite one", () => {
    expect(performance(Array(30).fill(0.001)).sharpe).toBeNull();
    expect(probabilisticSharpe(Array(30).fill(0.001))).toBeNull();
  });
});

describe("the results are reproducible", () => {
  it("running the same backtest twice gives identical days", () => {
    expect(runs.carry!()).toEqual(runs.carry!());
  });

  it("the bootstrap with the same seed gives the same interval, a different seed a close one", () => {
    const r = ref.returns.buyHold!;
    expect(bootstrapSharpe(r, { seed: 7 })).toEqual(bootstrapSharpe(r, { seed: 7 }));
    const a = bootstrapSharpe(r, { seed: 7 })!;
    const b = bootstrapSharpe(r, { seed: 8 })!;
    expect(Math.abs(a.median - b.median)).toBeLessThan(0.15);
    expect(a.low).toBeLessThan(a.median);
    expect(a.high).toBeGreaterThan(a.median);
  });
});

describe("selection bias is measured, not ignored", () => {
  it("on pure noise, the best of many configurations does not pass the Deflated Sharpe test", () => {
    const rand = research.seededRandom(3);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
    const trials = Array.from({ length: 50 }, () =>
      Array.from({ length: 730 }, () => gauss() * 0.02),
    );
    const sharpes = trials.map((t) => dailySharpe(t)!);
    const best = trials[sharpes.indexOf(Math.max(...sharpes))]!;
    expect(probabilisticSharpe(best)!).toBeGreaterThan(0.9); // looks good alone...
    expect(deflatedSharpe(best, sharpes).dsr!).toBeLessThan(0.95); // ...but not after 50 tries.
  });

  it("on pure noise, the probability of overfitting is high; with one real edge it is low", () => {
    const rand = research.seededRandom(11);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
    const noise = Array.from({ length: 12 }, () =>
      Array.from({ length: 1000 }, () => gauss() * 0.02),
    );
    expect(probabilityOfOverfitting(noise, 10).pbo!).toBeGreaterThan(0.25);
    const edge = noise.map((row, i) => (i === 0 ? row.map((x) => x + 0.004) : row));
    expect(probabilityOfOverfitting(edge, 10).pbo!).toBeLessThan(0.05);
  });

  it("walk-forward never tests a configuration on the days it was chosen on", () => {
    const calendar = alignedCalendar([btc]);
    const configs = [20, 50, 100].map((window) => ({
      id: `sma-${window}`,
      strategy: movingAverageTrend({ asset: "BTC", window }),
    }));
    const wf = walkForward([btc], configs, calendar, { trainDays: 365, testDays: 90, warmup: 100 });
    expect(wf.folds.length).toBeGreaterThan(2);
    expect(wf.trials).toBe(wf.folds.length * configs.length);
    for (const f of wf.folds) {
      expect(f.testFrom).toBeGreaterThan(f.trainTo);
      expect(f.testDays.every((d) => d.time > f.trainTo)).toBe(true);
    }
    const times = wf.outOfSample.map((d) => d.time);
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("regimes use only the past", () => {
  it("each day's label depends on earlier closes only", () => {
    const bars = ref.bars.BTC;
    const full = regimes(bars);
    const cut = 500;
    const partial = regimes(bars.slice(0, cut + 1));
    for (const [time, label] of partial) expect(full.get(time)).toBe(label);
    expect(partial.size).toBeGreaterThan(200);
  });
});

describe("live decisions", () => {
  it("are the backtest's decisions, continued to the last day with data", () => {
    const strategy = meanReversion({
      asset: "BTC",
      window: 10,
      entryZ: 1.5,
      exitZ: 0,
      trendFilter: false,
    });
    const run = runBacktest([btc], strategy);
    const live = research.decisionsThrough([btc], strategy);
    expect(live).toHaveLength(run.decisions.length + 2);
    expect(live.slice(0, run.decisions.length).map((d) => d.weights)).toEqual(
      run.decisions.map((d) => d.weights),
    );
    expect(live[live.length - 1]!.time).toBe(btc.bars[btc.bars.length - 1]!.time);
  });
});

describe("the bootstrap", () => {
  it("gives no interval for a book that never traded, rather than an empty one", () => {
    expect(bootstrapSharpe(Array(60).fill(0))).toBeNull();
  });
});
