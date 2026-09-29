import { describe, expect, it } from "vitest";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
import {
  describeGoal,
  goalStatus,
  measurePeriod,
  parsePeriod,
  periodOf,
  previousPeriod,
  type Goal,
} from "../src/lib/goals";

let n = 0;
const trade = (
  closedAt: string,
  pnl: number,
  over: Partial<AnnotatedTrade> = {},
): AnnotatedTrade => ({
  key: `k${++n}`,
  accountId: "a",
  symbol: "ES",
  direction: "long",
  status: pnl > 0 ? "win" : "loss",
  openedAt: new Date(Date.parse(closedAt) - 600_000).toISOString(),
  closedAt,
  quantity: 1,
  openQuantity: 0,
  avgEntry: 100,
  avgExit: 100,
  grossPnl: pnl,
  fees: 0,
  netPnl: pnl,
  executionCount: 2,
  executionIds: [],
  exits: [],
  durationMs: 600_000,
  ...over,
});

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  periodKind: "month",
  period: "2026-09",
  metric: "winRate",
  comparator: "atLeast",
  target: 0.5,
  text: "",
  createdAt: "x",
  ...over,
});

describe("review periods", () => {
  it("cover months and quarters, and step back across years", () => {
    expect(parsePeriod("month", "2026-02")).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
      label: "February 2026",
    });
    expect(parsePeriod("quarter", "2026-Q3")).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
      label: "Q3 2026",
    });
    expect(parsePeriod("month", "2026-13")).toBeNull();
    expect(periodOf("quarter", "2026-11-05").id).toBe("2026-Q4");
    expect(previousPeriod(parsePeriod("month", "2026-01")!).id).toBe("2025-12");
    expect(previousPeriod(parsePeriod("quarter", "2026-Q1")!).id).toBe("2025-Q4");
  });
});

describe("goals", () => {
  const september = parsePeriod("month", "2026-09")!;
  const trades = [
    trade("2026-09-01T15:00:00Z", 50, { annotations: { stopLoss: 95, reviewed: true } }),
    trade("2026-09-01T16:00:00Z", -20),
    trade("2026-09-01T17:00:00Z", -20),
    trade("2026-09-02T15:00:00Z", 40),
    trade("2026-08-31T15:00:00Z", -500), // August: left out
  ];
  const measures = measurePeriod(trades, september, "UTC");

  it("are measured from the period's own trades", () => {
    expect(measures).toMatchObject({
      netPnl: 50,
      winRate: 0.5,
      tradesPerDay: 2,
      maxTradesInDay: 3,
      reviewedShare: 0.25,
      stopShare: 0.25,
      routineAdherence: null,
    });
    expect(measures.profitFactor).toBeCloseTo(90 / 40);
  });

  it("are met or missed against their target, and unknown without data or a metric", () => {
    expect(goalStatus(goal({}), measures)).toBe("met");
    expect(
      goalStatus(goal({ metric: "maxTradesInDay", comparator: "atMost", target: 2 }), measures),
    ).toBe("missed");
    expect(goalStatus(goal({ metric: "routineAdherence" }), measures)).toBe("unknown");
    expect(
      goalStatus(
        goal({ metric: null, comparator: null, target: null, text: "Be patient" }),
        measures,
      ),
    ).toBe("unknown");
    expect(describeGoal(goal({ text: "Pick better setups" }), measures)).toBe(
      'Win rate at least 50%: 50% (met); "Pick better setups"',
    );
  });

  it("count routines done over the days they were scheduled", () => {
    const rules = [
      {
        id: "r",
        title: "Plan the day",
        stage: "Before trading",
        weekdays: [1, 2, 3, 4, 5],
        createdAt: "2026-09-01T00:00:00Z",
        archivedAt: null,
      },
    ];
    const checks = [
      { ruleId: "r", date: "2026-09-01", done: true },
      { ruleId: "r", date: "2026-09-02", done: true },
    ];
    // September 2026 has 22 weekdays.
    const withRoutines = measurePeriod(trades, september, "UTC", { rules, checks });
    expect(withRoutines.routineAdherence).toBeCloseTo(2 / 22);
  });
});
