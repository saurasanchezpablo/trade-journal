import { detectBehaviours } from "@luxalgo/journal-core";
import { handler, ok, requireValue } from "@/server/api";
import { read, runAiObject } from "@/server/ai-structured";
import { listGoals, periodMeasures } from "@/server/goals";
import { lessonHistory } from "@/server/lessons";
import { queryTrades } from "@/server/trades-query";
import { getTimeZone } from "@/server/settings";
import {
  GOAL_METRICS,
  formatMeasure,
  isGoalMetric,
  parsePeriod,
  previousPeriod,
  type GoalMetric,
} from "@/lib/goals";
import { describeLesson } from "@/lib/lesson-tracking";

/**
 * Up to three goals for a period, from how the period before went: its measures, flagged
 * habits and recurring lessons. Suggestions only; a goal exists once you add it.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { kind?: unknown; period?: unknown };
  requireValue(
    body && Object.keys(body).every((k) => ["kind", "period"].includes(k)),
    "Unknown field",
  );
  const period = parsePeriod(body.kind, body.period);
  requireValue(period, "Choose a month (YYYY-MM) or a quarter (YYYY-Qn).");
  const last = previousPeriod(period);
  const { before } = periodMeasures(period);
  const timeZone = getTimeZone();
  const { trades } = queryTrades({ from: last.from, to: last.to });
  const habits = detectBehaviours(trades, { timeZone }).patterns.filter((p) => p.flagged);
  const lessons = lessonHistory({ from: last.from, to: last.to }).filter((l) => l.days.length > 1);
  const existing = listGoals(period.kind, period.id);
  const metrics = Object.keys(GOAL_METRICS) as GoalMetric[];

  const prompt = `Suggest up to three goals for my trading in ${period.label}, from how ${last.label} went. Prefer
process goals I control (discipline, risk, routines) over P&L; make each measurable with one of
the metrics below when one fits, with a realistic target, else a short written goal. Give a
one-sentence reason from the facts. Percent targets are shares from 0 to 1 (0.6 for 60%).

Metrics: ${metrics.map((m) => `${m} (${GOAL_METRICS[m].label}, better ${GOAL_METRICS[m].better})`).join("; ")}

${last.label}:
${metrics.map((m) => `- ${GOAL_METRICS[m].label}: ${formatMeasure(m, before[m])}`).join("\n")}
Flagged habits: ${habits.map((h) => h.summary).join(" ") || "none"}
Recurring lessons: ${lessons.slice(0, 8).map(describeLesson).join("; ") || "none"}
Goals already set for ${period.label}: ${existing.map((g) => g.text || g.metric).join("; ") || "none"}`;

  const goals = await runAiObject({
    prompt,
    name: "goals",
    maxOutputTokens: 700,
    schema: {
      type: "object",
      properties: {
        goals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              metric: { type: ["string", "null"], enum: [...metrics, null] },
              comparator: { type: ["string", "null"], enum: ["atLeast", "atMost", null] },
              target: { type: ["number", "null"] },
              text: { type: "string" },
              reason: { type: "string" },
            },
            required: ["metric", "comparator", "target", "text", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["goals"],
      additionalProperties: false,
    },
    read: (value) =>
      read
        .array(read.object(value).goals, 6)
        .map((item) => {
          const g = read.object(item);
          const metric = isGoalMetric(g.metric) ? g.metric : null;
          const comparator =
            g.comparator === "atLeast" || g.comparator === "atMost" ? g.comparator : null;
          const target =
            typeof g.target === "number" && Number.isFinite(g.target) ? g.target : null;
          const measurable = metric !== null && comparator !== null && target !== null;
          return {
            metric: measurable ? metric : null,
            comparator: measurable ? comparator : null,
            target: measurable ? target : null,
            text: read.text(g.text, 300),
            reason: read.text(g.reason, 300),
          };
        })
        .filter((g) => g.metric || g.text)
        .slice(0, 3),
  });
  return ok({ period, basedOn: last, goals });
});
