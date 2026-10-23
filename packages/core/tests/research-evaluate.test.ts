import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { research } from "../src";

const { STRATEGIES, evaluateStrategy, judge, replaySignals, runBacktest, strategyById } = research;

const ref = JSON.parse(
  readFileSync(new URL("./fixtures/research-reference.json", import.meta.url), "utf8"),
) as {
  bars: Record<"BTC" | "ETH" | "PERP", research.DailyBar[]>;
  funding: research.FundingEvent[];
};

const instruments: research.Instrument[] = [
  { id: "BTC-SPOT", kind: "spot", bars: ref.bars.BTC },
  { id: "ETH-SPOT", kind: "spot", bars: ref.bars.ETH },
  { id: "BTC-PERP", kind: "perp", bars: ref.bars.PERP, funding: ref.funding },
];
const HOLDOUT = Date.UTC(2022, 0, 1);
const options = { holdoutFrom: HOLDOUT, trainDays: 200, testDays: 60 };
const benchmark = () => {
  const def = strategyById("btc-buy-hold")!;
  const run = runBacktest(instruments.slice(0, 1), def.build({}), { warmup: 0 });
  return new Map(run.days.map((d) => [d.time, d.ret]));
};
/** The catalog's definitions with a shorter warm-up, to fit the 900-day synthetic market. */
const short = (id: string) => ({ ...strategyById(id)!, warmup: 30 });

describe("the catalog", () => {
  it("declares one benchmark and the five kinds of candidate the method requires", () => {
    expect(STRATEGIES.filter((s) => s.role === "benchmark").map((s) => s.id)).toEqual([
      "btc-buy-hold",
    ]);
    const families = new Set(STRATEGIES.filter((s) => s.role === "candidate").map((s) => s.family));
    for (const f of ["trend", "mean-reversion", "regime", "carry"] as const)
      expect(families).toContain(f);
  });

  it("every configuration has a unique id and builds a strategy", () => {
    for (const s of STRATEGIES) {
      const ids = s.grid.map((g) => g.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const g of s.grid) expect(typeof s.build(g.params)).toBe("function");
    }
  });
});

describe("a strategy's report keeps each kind of evidence apart", () => {
  const report = evaluateStrategy(
    short("btc-sma-trend"),
    instruments,
    benchmark(),
    ref.bars.BTC,
    options,
  );

  it("in-sample and walk-forward days all end before the holdout; holdout days all after", () => {
    expect(report.inSample!.equity.every((d) => d.time < HOLDOUT)).toBe(true);
    expect(report.walkForward!.equity.every((d) => d.time < HOLDOUT)).toBe(true);
    expect(report.holdout!.equity.every((d) => d.time >= HOLDOUT)).toBe(true);
    expect(report.holdout!.equity[0]!.time).toBe(HOLDOUT);
    expect(report.inSample!.category).toBe("in-sample");
    expect(report.walkForward!.category).toBe("walk-forward");
    expect(report.holdout!.category).toBe("holdout");
  });

  it("the in-sample choice is the configuration with the best in-sample Sharpe", () => {
    const best = [...report.configs].sort((a, b) => (b.sharpe ?? -9) - (a.sharpe ?? -9))[0]!;
    expect(report.selected!.id).toBe(best.id);
    expect(report.inSample!.metrics.sharpe).toBeCloseTo(best.sharpe!, 12);
  });

  it("every configuration counts as a trial, and the deflated Sharpe is below the plain one", () => {
    expect(report.deflated.trials).toBe(5);
    expect(report.walkForward!.trials).toBe(report.walkForward!.folds.length * 5);
    expect(report.deflated.dsr!).toBeLessThan(report.inSample!.probabilisticSharpe!);
    expect(report.pbo!.splits).toBe(252);
  });

  it("the benchmark is compared over exactly the same days", () => {
    const bench = benchmark();
    const days = report.walkForward!.equity.map((d) => d.time);
    const expected = research.performance(
      days.map((t) => bench.get(t)!),
      research.DEFAULT_COSTS.cashRate,
    ).sharpe;
    expect(report.walkForward!.benchmark!.sharpe).toBeCloseTo(expected!, 12);
  });

  it("is deterministic", () => {
    expect(
      evaluateStrategy(short("btc-sma-trend"), instruments, benchmark(), ref.bars.BTC, options),
    ).toEqual(report);
  });

  it("the verdict follows the criteria (the synthetic market has too little history)", () => {
    expect(report.verdict).toBe("insufficient-data");
    expect(report.criteria.find((c) => c.id === "sample")!.passed).toBe(false);
  });
});

describe("the evidence standard", () => {
  const passing = {
    inSample: { metrics: { days: 2000 } },
    holdout: { metrics: { days: 400, totalReturn: 0.1 } },
    walkForward: {
      metrics: { sharpe: 1.2, totalReturn: 0.8 },
      benchmark: { sharpe: 0.9 },
      bootstrap: { low: 0.2, high: 2, median: 1.1, positive: 0.99 },
    },
    deflated: { dsr: 0.97, threshold: 0.05, trials: 5 },
    pbo: { pbo: 0.1, splits: 252 },
  } as unknown as Parameters<typeof judge>[1];
  const candidate = { role: "candidate" as const, grid: Array(5).fill({}) };

  it("a strategy that clears every criterion meets the standard", () => {
    expect(judge(candidate, passing).verdict).toBe("meets-standard");
  });

  it("missing any single criterion leaves it experimental", () => {
    const worse = { ...passing, pbo: { pbo: 0.6, splits: 252 } };
    expect(judge(candidate, worse).verdict).toBe("experimental");
    const noBeat = {
      ...passing,
      walkForward: { ...passing.walkForward!, benchmark: { sharpe: 1.5 } },
    };
    expect(judge(candidate, noBeat as never).verdict).toBe("experimental");
  });

  it("a holdout that earned no more than cash leaves it experimental", () => {
    const idle = {
      ...passing,
      costs: { cashRate: 0.03 },
      holdout: { metrics: { days: 400, totalReturn: 0.02 } },
    };
    expect(judge(candidate, idle as never).verdict).toBe("experimental");
  });

  it("a walk-forward Sharpe ratio not above cash rejects it", () => {
    const losing = {
      ...passing,
      walkForward: { ...passing.walkForward!, metrics: { sharpe: -0.2, totalReturn: -0.1 } },
    };
    expect(judge(candidate, losing as never).verdict).toBe("rejected");
  });

  it("the benchmark is never judged", () => {
    expect(judge({ role: "benchmark", grid: [{} as never] }, passing).verdict).toBe("benchmark");
  });
});

describe("paper trading replays the recorded signals only", () => {
  const btc = instruments.slice(0, 1);
  const day = (i: number) => ref.bars.BTC[i]!.time;

  it("a signal trades from the first open at or after it could be executed, never earlier", () => {
    const signals = [
      { executeAt: day(100), weights: { "BTC-SPOT": 1 } },
      { executeAt: day(110), weights: { "BTC-SPOT": 0 } },
    ];
    const run = runBacktest(btc, replaySignals(signals), { from: day(95), to: day(120) });
    const held = run.days.filter((d) => d.weights["BTC-SPOT"] === 1).map((d) => d.time);
    expect(held[0]).toBe(day(100));
    expect(held[held.length - 1]).toBe(day(109));
  });

  it("the same signals executed at the decision day's next open give the backtest's own result", () => {
    const def = strategyById("btc-sma-trend")!;
    const strategy = def.build({ window: 50 });
    const run = runBacktest(btc, strategy, { warmup: 60 });
    const signals = run.decisions.map((d) => ({
      executeAt: d.time + 86_400_000,
      weights: d.weights,
    }));
    const replay = runBacktest(btc, replaySignals(signals), { warmup: 60 });
    expect(replay.days.map((d) => d.ret)).toEqual(run.days.map((d) => d.ret));
  });
});

describe("trial counting", () => {
  it("a configuration that never trades still counts as a trial", () => {
    const def = {
      ...strategyById("btc-sma-trend")!,
      warmup: 30,
      grid: [
        { id: "a", label: "50-day", params: { window: 50 } },
        { id: "never", label: "never trades", params: { window: 100_000 } },
      ],
    };
    const report = evaluateStrategy(def, instruments, null, ref.bars.BTC, options);
    expect(report.deflated.trials).toBe(2);
  });
});
