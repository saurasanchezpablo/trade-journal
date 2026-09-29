import { asc } from "drizzle-orm";
import { db, progressChecks, progressRules } from "@/db";
import {
  measurePeriod,
  previousPeriod,
  type Goal,
  type GoalMetric,
  type Period,
  type PeriodKind,
} from "@/lib/goals";
import { newId, nowIso } from "./ids";
import { getTimeZone } from "./settings";
import { queryTrades } from "./trades-query";

/**
 * Goals for months and quarters, in a table of their own (created on first use, like the
 * other add-ons). Measured values are never stored: they are worked out from the trades each
 * time, so they follow edits and imports.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS review_goals (
 id TEXT PRIMARY KEY, period_kind TEXT NOT NULL, period TEXT NOT NULL,
 metric TEXT, comparator TEXT, target REAL, text TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS review_goals_period ON review_goals(period_kind, period);
`;
const ready = new WeakSet<object>();
const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

export const MAX_GOALS = 12;

interface Row {
  id: string;
  period_kind: string;
  period: string;
  metric: string | null;
  comparator: string | null;
  target: number | null;
  text: string;
  created_at: string;
}
const toGoal = (r: Row): Goal => ({
  id: r.id,
  periodKind: r.period_kind === "quarter" ? "quarter" : "month",
  period: r.period,
  metric: r.metric as GoalMetric | null,
  comparator: r.comparator === "atLeast" || r.comparator === "atMost" ? r.comparator : null,
  target: r.target,
  text: r.text,
  createdAt: r.created_at,
});

export const listGoals = (kind: PeriodKind, period: string): Goal[] =>
  (
    client()
      .prepare(
        "SELECT * FROM review_goals WHERE period_kind = ? AND period = ? ORDER BY created_at, rowid",
      )
      .all(kind, period) as Row[]
  ).map(toGoal);

export function addGoal(goal: Omit<Goal, "id" | "createdAt">): Goal {
  const row: Row = {
    id: newId(),
    period_kind: goal.periodKind,
    period: goal.period,
    metric: goal.metric,
    comparator: goal.comparator,
    target: goal.target,
    text: goal.text,
    created_at: nowIso(),
  };
  client()
    .prepare(
      "INSERT INTO review_goals (id, period_kind, period, metric, comparator, target, text, created_at) VALUES (@id, @period_kind, @period, @metric, @comparator, @target, @text, @created_at)",
    )
    .run(row);
  return toGoal(row);
}

export const removeGoal = (id: string) =>
  client().prepare("DELETE FROM review_goals WHERE id = ?").run(id).changes > 0;

const routines = () => ({
  rules: db
    .select()
    .from(progressRules)
    .orderBy(asc(progressRules.createdAt))
    .all()
    .map((r) => ({ ...r, weekdays: JSON.parse(r.weekdaysJson) as number[] })),
  checks: db.select().from(progressChecks).all(),
});

/** The period's measures and the previous period's, over all accounts. */
export function periodMeasures(period: Period) {
  const timeZone = getTimeZone();
  const previous = previousPeriod(period);
  const { trades } = queryTrades({ from: previous.from, to: period.to });
  const r = routines();
  return {
    timeZone,
    previous,
    current: measurePeriod(trades, period, timeZone, r),
    before: measurePeriod(trades, previous, timeZone, r),
  };
}
