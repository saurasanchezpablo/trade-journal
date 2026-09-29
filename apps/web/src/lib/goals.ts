import {
  computeMetrics,
  dayKeyOf,
  detectBehaviours,
  type AnnotatedTrade,
} from "@luxalgo/journal-core";
import { progressScore, type Routine, type RoutineCheck } from "./progress";

/**
 * Goals for a month or a quarter, and how far you got: each measurable goal is a metric, a
 * comparison and a target, measured from the period's trades (and routines); a written goal
 * without a metric is judged by the AI review from the facts.
 */

export type PeriodKind = "month" | "quarter";

/** "2026-09" or "2026-Q3" with its first and last day. */
export interface Period {
  kind: PeriodKind;
  id: string;
  from: string;
  to: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function parsePeriod(kind: unknown, id: unknown): Period | null {
  if (kind === "month" && typeof id === "string") {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(id);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    return {
      kind,
      id,
      from: `${id}-01`,
      to: `${id}-${pad(lastDay(year, month))}`,
      label: `${MONTHS[month - 1]} ${year}`,
    };
  }
  if (kind === "quarter" && typeof id === "string") {
    const m = /^(\d{4})-Q([1-4])$/.exec(id);
    if (!m) return null;
    const year = Number(m[1]);
    const q = Number(m[2]);
    const first = (q - 1) * 3 + 1;
    return {
      kind,
      id,
      from: `${year}-${pad(first)}-01`,
      to: `${year}-${pad(first + 2)}-${pad(lastDay(year, first + 2))}`,
      label: `Q${q} ${year}`,
    };
  }
  return null;
}

/** The period a day falls in. */
export function periodOf(kind: PeriodKind, day: string): Period {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return kind === "month"
    ? parsePeriod("month", `${year}-${pad(month)}`)!
    : parsePeriod("quarter", `${year}-Q${Math.ceil(month / 3)}`)!;
}

export function previousPeriod(period: Period): Period {
  const before = new Date(Date.parse(`${period.from}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return periodOf(period.kind, before);
}

export const GOAL_METRICS = {
  netPnl: { label: "Net P&L", unit: "money", better: "higher" },
  winRate: { label: "Win rate", unit: "percent", better: "higher" },
  profitFactor: { label: "Profit factor", unit: "ratio", better: "higher" },
  maxDrawdown: { label: "Max drawdown", unit: "money", better: "lower" },
  avgRealizedR: { label: "Average realized R", unit: "R", better: "higher" },
  greenDays: { label: "Green days", unit: "percent", better: "higher" },
  tradesPerDay: { label: "Trades per trading day", unit: "count", better: "lower" },
  maxTradesInDay: { label: "Most trades in a day", unit: "count", better: "lower" },
  revengeTrades: { label: "Revenge trades", unit: "count", better: "lower" },
  reviewedShare: { label: "Trades reviewed", unit: "percent", better: "higher" },
  stopShare: { label: "Trades with a stop", unit: "percent", better: "higher" },
  routineAdherence: { label: "Routines done", unit: "percent", better: "higher" },
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;
export const isGoalMetric = (v: unknown): v is GoalMetric =>
  typeof v === "string" && Object.hasOwn(GOAL_METRICS, v);

export interface Goal {
  id: string;
  periodKind: PeriodKind;
  period: string;
  /** Null for a written goal the review judges. */
  metric: GoalMetric | null;
  comparator: "atLeast" | "atMost" | null;
  /** Percent metrics are shares from 0 to 1. */
  target: number | null;
  text: string;
  createdAt: string;
}

export type Measures = Record<GoalMetric, number | null>;

/** Every metric for the period's trades (closed in it) and routines. */
export function measurePeriod(
  trades: AnnotatedTrade[],
  period: Pick<Period, "from" | "to">,
  timeZone: string,
  routines: { rules: Routine[]; checks: RoutineCheck[] } = { rules: [], checks: [] },
): Measures {
  const inPeriod = trades.filter((t) => {
    const day = dayKeyOf(t.closedAt ?? t.openedAt, timeZone);
    return day >= period.from && day <= period.to;
  });
  const closed = inPeriod.filter((t) => t.status !== "open");
  const m = computeMetrics(inPeriod, { timeZone });
  const perDay = new Map<string, number>();
  for (const t of closed) {
    const day = dayKeyOf(t.openedAt, timeZone);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const revenge = detectBehaviours(closed, { timeZone }).patterns.find((p) => p.kind === "revenge");
  let scheduled = 0;
  let done = 0;
  for (
    let day = period.from;
    day <= period.to;
    day = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  ) {
    const score = progressScore(routines.rules, routines.checks, day);
    scheduled += score.total;
    done += score.completed;
  }
  const share = (n: number) => (closed.length ? n / closed.length : null);
  return {
    netPnl: closed.length ? m.netPnl : null,
    winRate: m.winRate,
    profitFactor: m.profitFactorIsInfinite ? Infinity : m.profitFactor,
    maxDrawdown: closed.length ? m.maxDrawdown : null,
    avgRealizedR: m.avgRealizedR,
    greenDays: m.dayWinRate,
    tradesPerDay: perDay.size ? closed.length / perDay.size : null,
    maxTradesInDay: perDay.size ? Math.max(...perDay.values()) : null,
    revengeTrades: closed.length ? (revenge?.flaggedSide.trades ?? 0) : null,
    reviewedShare: share(closed.filter((t) => t.annotations?.reviewed).length),
    stopShare: share(closed.filter((t) => t.annotations?.stopLoss != null).length),
    routineAdherence: scheduled ? done / scheduled : null,
  };
}

/** Met, missed, or unknown (no data, or a written goal). */
export function goalStatus(goal: Goal, measures: Measures): "met" | "missed" | "unknown" {
  if (!goal.metric || goal.target === null || !goal.comparator) return "unknown";
  const value = measures[goal.metric];
  if (value === null || Number.isNaN(value)) return "unknown";
  return (goal.comparator === "atLeast" ? value >= goal.target : value <= goal.target)
    ? "met"
    : "missed";
}

/** A metric's value as plain text (money without a currency sign). */
export function formatMeasure(metric: GoalMetric, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (!Number.isFinite(value)) return "no losses";
  const unit = GOAL_METRICS[metric].unit;
  if (unit === "percent") return `${Math.round(value * 100)}%`;
  if (unit === "money") return value.toFixed(2);
  if (unit === "R") return `${value.toFixed(2)}R`;
  if (unit === "count") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value.toFixed(2);
}

/** "Win rate at least 55%: 61% (met)". */
export function describeGoal(goal: Goal, measures: Measures): string {
  const status = goalStatus(goal, measures);
  if (!goal.metric || goal.target === null || !goal.comparator) return `Written goal: ${goal.text}`;
  const target = formatMeasure(goal.metric, goal.target);
  return `${GOAL_METRICS[goal.metric].label} ${goal.comparator === "atLeast" ? "at least" : "at most"} ${target}: ${formatMeasure(goal.metric, measures[goal.metric])} (${status === "unknown" ? "no data" : status})${goal.text ? `; "${goal.text}"` : ""}`;
}
