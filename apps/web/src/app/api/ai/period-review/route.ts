import { dayKeyOf, detectBehaviours } from "@luxalgo/journal-core";
import { bad, handler, requireValue } from "@/server/api";
import { aiModel } from "@/server/ai";
import { readAiRequest } from "@/server/ai-scope";
import { ndjsonResponse } from "@/server/ai-stream";
import { chatTurn } from "@/server/ai-agent/chat";
import { createConversation, getConversation } from "@/server/ai-agent/store";
import { listGoals, periodMeasures } from "@/server/goals";
import { lessonHistory } from "@/server/lessons";
import { queryTrades } from "@/server/trades-query";
import {
  GOAL_METRICS,
  describeGoal,
  formatMeasure,
  parsePeriod,
  type GoalMetric,
} from "@/lib/goals";
import { describeLesson, weekOf } from "@/lib/lesson-tracking";

/**
 * A monthly or quarterly review, tied to the period's goals: the journal measures each goal
 * and the period against the one before, and the AI chat writes the review from those facts
 * (it can look up more). It is saved as a chat, so you can ask follow-ups; it streams as the
 * chat does.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { kind?: unknown; period?: unknown; timeZone?: unknown };
  requireValue(
    body && Object.keys(body).every((k) => ["kind", "period", "timeZone"].includes(k)),
    "Unknown review field",
  );
  const period = parsePeriod(body.kind, body.period);
  requireValue(period, "Choose a month (YYYY-MM) or a quarter (YYYY-Qn).");
  const noun = period.kind === "month" ? "monthly" : "quarterly";
  const display = `${noun[0]!.toUpperCase()}${noun.slice(1)} review for ${period.label}`;
  const scope = readAiRequest(
    { question: display, filters: { from: period.from, to: period.to }, timeZone: body.timeZone },
    "question",
  );
  const { trades } = queryTrades(scope.filters);
  const goals = listGoals(period.kind, period.id);
  const lessons = lessonHistory({ from: period.from, to: period.to }).filter(
    (l) => l.days.length > 1,
  );
  if (!trades.length && !lessons.length && !goals.length)
    return bad(`Nothing to review for ${period.label}: no trades, goals or recurring lessons.`);
  aiModel();

  const { current, before, previous } = periodMeasures(period);
  const weeks = new Map<string, { trades: number; net: number }>();
  for (const t of trades.filter((t) => t.status !== "open")) {
    const week = weekOf(dayKeyOf(t.closedAt!, scope.timeZone));
    const w = weeks.get(week) ?? { trades: 0, net: 0 };
    weeks.set(week, { trades: w.trades + 1, net: w.net + t.netPnl });
  }
  const habits = detectBehaviours(trades, { timeZone: scope.timeZone }).patterns.filter(
    (p) => p.flagged,
  );
  const metricLines = (Object.keys(GOAL_METRICS) as GoalMetric[]).map(
    (m) =>
      `- ${GOAL_METRICS[m].label}: ${formatMeasure(m, current[m])} (${previous.label}: ${formatMeasure(m, before[m])})`,
  );
  const question = `Write my ${noun} trading review for ${period.label} (${period.from} to ${period.to}) in first person
("I"), ${period.kind === "month" ? "250-400" : "350-550"} words, markdown with these sections:
"**Goals**" (each goal below, met or missed, with its number; judge written goals from the facts,
and say when the facts can't tell), "**What worked**", "**What cost me**" (name habits and
lessons that came back), and "**Next ${period.kind}**" (at most three goals, measurable where
possible). Compare with ${previous.label} where it matters. Use the facts below, and the tools
for detail when a claim needs it. All accounts; amounts are not converted between currencies.

Goals for ${period.label}:
${goals.map((g) => `- ${describeGoal(g, current)}`).join("\n") || "- none set"}

Measures (${period.label}, then ${previous.label}):
${metricLines.join("\n")}

By week (starting Monday):
${
  [...weeks]
    .sort()
    .map(([w, v]) => `- ${w}: ${v.trades} trades, net ${v.net.toFixed(2)}`)
    .join("\n") || "- no closed trades"
}

Habits the journal flags this ${period.kind}:
${habits.map((h) => `- ${h.title}: ${h.summary}`).join("\n") || "- none flagged"}

Lessons that came back in my day notes:
${
  lessons
    .slice(0, 10)
    .map((l) => `- ${describeLesson(l)}`)
    .join("\n") || "- none"
}`;

  const conversation = createConversation({
    title: `${noun[0]!.toUpperCase()}${noun.slice(1)} review · ${period.label}`,
    kind: "journal",
    anchor: null,
    filters: scope.filters,
    scopeLabel: scope.scope.label,
  });
  return ndjsonResponse(request, async (send, stop) => {
    send({ type: "conversation", conversation: getConversation(conversation.id) ?? conversation });
    for await (const event of chatTurn({
      scope,
      conversation,
      question,
      display,
      signal: stop,
    }))
      send(event);
  });
});
