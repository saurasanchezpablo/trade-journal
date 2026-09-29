import { bad, handler, ok, requireValue } from "@/server/api";
import { GOAL_METRICS, goalStatus, isGoalMetric, parsePeriod } from "@/lib/goals";
import { MAX_GOALS, addGoal, listGoals, periodMeasures, removeGoal } from "@/server/goals";

const periodFrom = (kind: unknown, id: unknown) => {
  const period = parsePeriod(kind, id);
  requireValue(period, "Choose a month (YYYY-MM) or a quarter (YYYY-Qn).");
  return period;
};

const state = (kind: unknown, id: unknown) => {
  const period = periodFrom(kind, id);
  const { current, before, previous } = periodMeasures(period);
  return {
    period,
    previous,
    measures: current,
    previousMeasures: before,
    metrics: GOAL_METRICS,
    goals: listGoals(period.kind, period.id).map((goal) => ({
      ...goal,
      status: goalStatus(goal, current),
      value: goal.metric ? current[goal.metric] : null,
    })),
  };
};

/** A period's goals, with each one measured, and the period's measures against the last. */
export const GET = handler((request: Request) => {
  const params = new URL(request.url).searchParams;
  return ok(state(params.get("kind"), params.get("period")));
});

export const POST = handler(async (request: Request) => {
  const b = (await request.json()) as Record<string, unknown>;
  requireValue(b && typeof b === "object", "Invalid goal");
  requireValue(
    Object.keys(b).every((k) =>
      ["kind", "period", "metric", "comparator", "target", "text"].includes(k),
    ),
    "Unknown goal field",
  );
  const period = periodFrom(b.kind, b.period);
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 300) : "";
  const metric = b.metric ?? null;
  requireValue(metric === null || isGoalMetric(metric), "Unknown goal metric");
  if (metric) {
    requireValue(
      b.comparator === "atLeast" || b.comparator === "atMost",
      "Choose at least or at most",
    );
    requireValue(
      typeof b.target === "number" && Number.isFinite(b.target),
      "Enter a target number",
    );
  } else requireValue(text, "Write the goal, or choose a metric");
  requireValue(
    listGoals(period.kind, period.id).length < MAX_GOALS,
    `At most ${MAX_GOALS} goals a period`,
  );
  addGoal({
    periodKind: period.kind,
    period: period.id,
    metric: metric as never,
    comparator: metric ? (b.comparator as "atLeast" | "atMost") : null,
    target: metric ? (b.target as number) : null,
    text,
  });
  return ok(state(period.kind, period.id));
});

export const DELETE = handler(async (request: Request) => {
  const b = (await request.json()) as { id?: unknown; kind?: unknown; period?: unknown };
  requireValue(typeof b?.id === "string", "id is required");
  if (!removeGoal(b.id)) return bad("Goal not found", 404);
  return ok(state(b.kind, b.period));
});
