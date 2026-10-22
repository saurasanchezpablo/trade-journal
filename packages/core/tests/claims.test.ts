import { describe, expect, it } from "vitest";
import {
  brierScore,
  evaluateClaim,
  regimeBefore,
  simulateSetup,
  strategyLevel,
  tallyOutcomes,
  tradeStats,
  wilsonInterval,
  type ClaimBar,
  type ClaimToEvaluate,
  type ExecutionCosts,
} from "../src/claims";

const H = 3_600_000;
const T0 = Date.parse("2026-03-02T00:00:00Z");
/** Hourly candles from T0 with given (open, high, low, close). */
const candles = (rows: [number, number, number, number][], start = T0): ClaimBar[] =>
  rows.map(([open, high, low, close], i) => ({ time: start + i * H, open, high, low, close }));
const flat = (n: number, price = 100, start = T0): ClaimBar[] =>
  candles(
    Array.from({ length: n }, () => [price, price + 0.5, price - 0.5, price]),
    start,
  );

/** Three flat candles before the claim at T0 + 3h, then the given ones. */
const series = (rows: [number, number, number, number][]) => [
  ...flat(3),
  ...candles(rows, T0 + 3 * H),
];
const claim = (overrides: Partial<ClaimToEvaluate> = {}): ClaimToEvaluate => ({
  direction: "long",
  claimTime: T0 + 3 * H,
  horizonEnd: T0 + 8 * H,
  horizonSource: "stated",
  targets: [105],
  invalidation: 95,
  invalidationOn: "touch",
  trigger: null,
  ...overrides,
});
const NOW = T0 + 1000 * H;

describe("a price claim against the candles that followed", () => {
  it("is right when the target trades before the invalidation inside the horizon", () => {
    const outcome = evaluateClaim(
      claim(),
      series([
        [100, 102, 99, 101],
        [101, 105.5, 100, 105],
        [105, 106, 94, 95],
        [95, 96, 94, 95],
        [95, 96, 94, 95],
      ]),
      NOW,
    );
    expect(outcome.status).toBe("target_hit");
    expect(outcome.referencePrice).toBe(100);
    expect(outcome.targetHitAt).toBe(T0 + 4 * H);
    expect(outcome.timeToTarget).toBe(H);
    expect(outcome.mfe).toBeCloseTo(0.06);
    expect(outcome.mae).toBeCloseTo(-0.06);
  });

  it("is invalidated when the invalidation comes first", () => {
    const outcome = evaluateClaim(
      claim(),
      series([
        [100, 101, 94, 96],
        [96, 106, 95, 105],
        [105, 105, 104, 104],
        [104, 105, 103, 104],
        [104, 105, 103, 104],
      ]),
      NOW,
    );
    expect(outcome.status).toBe("invalidated");
    expect(outcome.timeToInvalidation).toBe(0);
  });

  it("counts both inside one candle as ambiguous, never as a win", () => {
    const outcome = evaluateClaim(
      claim(),
      series([[100, 106, 94, 100], ...Array(4).fill([100, 101, 99, 100])]),
      NOW,
    );
    expect(outcome.status).toBe("ambiguous");
    expect(outcome.targetHitAt).toBeNull();
  });

  it("stays pending, not failed, while its horizon has not ended", () => {
    const outcome = evaluateClaim(claim(), series([[100, 101, 99, 100]]), NOW);
    expect(outcome.status).toBe("pending");
    expect(outcome.complete).toBe(false);
  });

  it("expires when the horizon ends with neither level, and notes a late target", () => {
    const quiet = Array(5).fill([100, 101, 99, 100.5]);
    expect(evaluateClaim(claim(), series(quiet), NOW).status).toBe("expired");
    const late = evaluateClaim(claim(), series([...quiet, [100, 106, 100, 105]]), NOW);
    expect(late.status).toBe("target_hit_late");
    expect(late.directional).toBe("correct");
  });

  it("needs a close beyond an invalidation stated on a close", () => {
    const rows: [number, number, number, number][] = [
      [100, 101, 94, 96],
      [96, 106, 95, 105],
      ...Array(3).fill([105, 105, 104, 104]),
    ];
    expect(evaluateClaim(claim({ invalidationOn: "close" }), series(rows), NOW).status).toBe(
      "target_hit",
    );
  });

  it("never reads what happened before the claim, nor candles after now", () => {
    // A spike to the target in the candle the claim was made inside, and after `now`.
    const bars = [...flat(3), { time: T0 + 2.5 * H, open: 100, high: 110, low: 100, close: 100 }];
    const outcome = evaluateClaim(
      claim({ claimTime: T0 + 3 * H - 1 }),
      [...bars, ...candles([[100, 101, 99, 100]], T0 + 3 * H)],
      T0 + 3 * H,
    );
    expect(outcome.targetHitAt).toBeNull();
    // The reference is the close of the last candle closed by the claim, not a later one.
    const ref = evaluateClaim(claim(), series([[200, 201, 199, 200]]), NOW);
    expect(ref.referencePrice).toBe(100);
  });

  it("follows a conditional claim only after its trigger", () => {
    const conditional = claim({ trigger: { price: 102, kind: "above" }, invalidation: null });
    const triggered = evaluateClaim(
      conditional,
      series([
        [100, 101, 99, 100],
        [100, 102.5, 100, 102],
        [102, 105.2, 101, 105],
        ...Array(2).fill([105, 105, 104, 104]),
      ]),
      NOW,
    );
    expect(triggered.status).toBe("target_hit");
    expect(triggered.triggeredAt).toBe(T0 + 4 * H);
    expect(triggered.timeToTarget).toBe(H);
    const never = evaluateClaim(conditional, series(Array(5).fill([100, 101, 99, 100])), NOW);
    expect(never.status).toBe("not_triggered");
    expect(never.directional).toBeNull();
  });

  it("is unevaluable without candles before the claim or without anything to check", () => {
    expect(evaluateClaim(claim(), candles([[100, 101, 99, 100]], T0 + 3 * H), NOW).status).toBe(
      "unevaluable",
    );
    const nothing = evaluateClaim(
      claim({ direction: "neutral", targets: [], invalidation: null }),
      series([[100, 101, 99, 100]]),
      NOW,
    );
    expect(nothing.status).toBe("unevaluable");
    expect(nothing.reason).toBeTruthy();
  });
});

const setup = {
  direction: "long" as const,
  entryLow: 99,
  entryHigh: 100,
  stop: 97,
  targets: [104],
};
const timing = { claimTime: T0 + 3 * H, horizonEnd: T0 + 10 * H };
const free: ExecutionCosts = { commissionBps: 0, slippageBps: 0, targetBufferBps: 0 };

describe("a stated trade setup, simulated", () => {
  it("is backtestable only with an entry, a stop and a target", () => {
    expect(strategyLevel(setup)).toBe("C");
    expect(strategyLevel({ ...setup, stop: null })).toBe("B");
    expect(strategyLevel({ ...setup, entryLow: null, entryHigh: null, stop: null })).toBe("A");
    const result = simulateSetup({ ...setup, stop: null }, timing, series([]), NOW);
    expect(result.trade).toBeNull();
  });

  it("enters at the zone's edge and exits at the target once traded beyond it", () => {
    const result = simulateSetup(
      setup,
      timing,
      series([
        [101, 101, 99.5, 100.5],
        [100.5, 104, 100, 103.5],
        [103.5, 104.5, 103, 104],
      ]),
      NOW,
      { ...free, targetBufferBps: 10 },
    );
    expect(result.trade).toMatchObject({ entryPrice: 100, exit: "target", exitPrice: 104 });
    // 104 was touched but not traded through on the second candle: the third one fills.
    expect(result.trade!.exitTime).toBe(T0 + 5 * H);
    expect(result.trade!.r).toBeCloseTo(4 / 3);
  });

  it("fills a gap at the open, takes the stop first in a shared candle and charges costs", () => {
    const gap = simulateSetup(
      setup,
      timing,
      series([
        [98, 99, 97.5, 98.5],
        [98.5, 99, 90, 91],
      ]),
      NOW,
      free,
    );
    expect(gap.trade).toMatchObject({ entryPrice: 98, exit: "stop", exitPrice: 97 });
    const both = simulateSetup(
      setup,
      timing,
      series([
        [101, 101, 99.5, 100],
        [100, 105, 96, 100],
      ]),
      NOW,
      free,
    );
    expect(both.trade).toMatchObject({ exit: "stop", ambiguous: true });
    const costly = simulateSetup(
      setup,
      timing,
      series([
        [101, 101, 99.5, 100],
        [100, 105, 100, 104.5],
      ]),
      NOW,
      { commissionBps: 10, slippageBps: 0, targetBufferBps: 0 },
    );
    expect(costly.trade!.grossReturn).toBeCloseTo(0.04);
    expect(costly.trade!.netReturn).toBeCloseTo(0.038);
  });

  it("exits at the horizon's end, and stays open while the data runs short", () => {
    const quiet = Array(8).fill([100, 101, 99.5, 100.5]);
    const timed = simulateSetup(setup, timing, series(quiet), NOW, free);
    expect(timed.trade).toMatchObject({ exit: "time", exitPrice: 100.5 });
    const open = simulateSetup(
      setup,
      { ...timing, horizonEnd: null },
      series(quiet.slice(0, 3)),
      NOW,
      free,
    );
    expect(open.trade).toMatchObject({ exit: "open", netReturn: null });
  });

  it("does not enter when price never reaches the zone", () => {
    const result = simulateSetup(setup, timing, series(Array(8).fill([102, 103, 101, 102])), NOW);
    expect(result.trade).toBeNull();
  });
});

describe("the statistics behind a comparison", () => {
  it("gives Wilson intervals that widen with fewer observations", () => {
    const small = wilsonInterval(3, 4)!;
    const large = wilsonInterval(75, 100)!;
    expect(small.high - small.low).toBeGreaterThan(large.high - large.low);
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it("scores stated probabilities with Brier, and only those", () => {
    expect(brierScore([])).toBeNull();
    expect(
      brierScore([
        { probability: 0.7, happened: true },
        { probability: 0.7, happened: false },
      ]),
    ).toBeCloseTo((0.09 + 0.49) / 2);
  });

  it("counts pending and ambiguous claims apart, never as misses, and flags small samples", () => {
    const outcomes = [
      evaluateClaim(
        claim(),
        series([[100, 106, 100, 105], ...Array(4).fill([105, 105, 104, 104])]),
        NOW,
      ),
      evaluateClaim(claim(), series([[100, 101, 99, 100]]), NOW),
      evaluateClaim(
        claim(),
        series([[100, 106, 94, 100], ...Array(4).fill([100, 101, 99, 100])]),
        NOW,
      ),
    ];
    const tally = tallyOutcomes(outcomes);
    expect(tally).toMatchObject({
      claims: 3,
      resolved: 1,
      targetHits: 1,
      pending: 1,
      ambiguous: 1,
    });
    expect(tally.targetHitRate).toBe(1);
    expect(tally.insufficient).toBe(true);
  });

  it("sums trades into expectancy, profit factor and drawdown", () => {
    const trade = (netReturn: number, i: number) => ({
      side: "long" as const,
      entryTime: i,
      entryPrice: 100,
      exitTime: i + 1,
      exitPrice: 100,
      exit: "target" as const,
      stop: 99,
      target: 102,
      grossReturn: netReturn,
      netReturn,
      r: netReturn / 0.01,
      bars: 2,
      ambiguous: false,
    });
    const stats = tradeStats([0.02, -0.01, -0.01, 0.03].map(trade));
    expect(stats.expectancy).toBeCloseTo(0.0075);
    expect(stats.profitFactor).toBeCloseTo(2.5);
    expect(stats.maxDrawdown).toBeCloseTo(0.02);
    expect(stats.winRate).toBe(0.5);
  });

  it("reads the market regime only from candles before the claim", () => {
    const rising = candles(
      Array.from(
        { length: 60 },
        (_, i) => [100 + i, 101 + i, 99 + i, 100.5 + i] as [number, number, number, number],
      ),
    );
    expect(regimeBefore(rising, T0 + 60 * H).trend).toBe("up");
    expect(regimeBefore(rising, T0 + 10 * H).trend).toBe("unknown");
  });
});
