import { dayKeyOf } from "@luxalgo/journal-core";
import { bad, handler, ok, requireValue } from "@/server/api";
import { read, runAiObject } from "@/server/ai-structured";
import { describeAnalysis } from "@/server/ai-analyses";
import { getAnalysis } from "@/server/chart-analyses";
import { candles } from "@/server/day-price-action";
import { recurringLessonsText } from "@/server/lessons";
import { getTimeZone } from "@/server/settings";
import { isDay } from "@/server/ai-scope";
import { DAY_MS, dailyBarsBefore, dayWindow } from "@/lib/day-window";
import { analysisLevels, sessionSummary } from "@/lib/day-levels";
import { describePlan } from "@/lib/analysis-plan";
import { fmtPrice } from "@/lib/analysis-text";
import { checkScenarioPrices, type DraftScenario } from "@/lib/plan-draft";

const MAX_DRAFT = 4;
const TIMEOUT_MS = 8_000;

/**
 * A pre-market plan for a chart analysis: a bias and up to four scenarios (trigger, target,
 * invalidation) from the chart's own levels and the previous session. Offered to the
 * trader, who adds what they want to the plan; nothing is saved here.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { analysisId?: unknown; day?: unknown };
  requireValue(
    body &&
      typeof body.analysisId === "string" &&
      Object.keys(body).every((k) => ["analysisId", "day"].includes(k)),
    "analysisId is required",
  );
  requireValue(body.day === undefined || isDay(body.day), "day must be YYYY-MM-DD");
  const analysis = getAnalysis(body.analysisId);
  if (!analysis) return bad("Chart analysis not found", 404);
  const timeZone = getTimeZone();
  const day = (body.day as string | undefined) ?? dayKeyOf(new Date().toISOString(), timeZone);
  const { from, to } = dayWindow(day, timeZone);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]);

  // The previous sessions from daily candles, and today's so far.
  const market: string[] = [];
  try {
    const daily = dailyBarsBefore(
      await candles(analysis, "1d", from - 20 * DAY_MS, from, signal),
      from,
      14,
    );
    const last = daily.at(-1);
    if (last) {
      const average = daily.reduce((s, b) => s + (b.high - b.low), 0) / daily.length;
      market.push(
        `Previous session: open ${fmtPrice(last.open)}, high ${fmtPrice(last.high)}, low ${fmtPrice(last.low)}, close ${fmtPrice(last.close)}. Average daily range over ${daily.length} days: ${fmtPrice(average)}.`,
      );
    }
  } catch (error) {
    market.push(
      `Previous sessions: unavailable (${error instanceof Error ? error.message : "source failed"}).`,
    );
  }
  if (from < Date.now())
    try {
      const today = sessionSummary(
        await candles(analysis, "15m", from, Math.min(to, Date.now()), signal),
      );
      if (today)
        market.push(
          `Today so far: open ${fmtPrice(today.open)}, high ${fmtPrice(today.high)}, low ${fmtPrice(today.low)}, last ${fmtPrice(today.close)}.`,
        );
    } catch {
      // Today's candles are a bonus; the plan stands on the previous session and the levels.
    }
  const levels = analysisLevels(analysis, to);
  const current = describePlan(analysis.plan);

  const prompt = `Draft my trading plan for ${analysis.symbol} on ${day}: a bias and up to ${MAX_DRAFT} scenarios ("if price
does X, I go long/short"), each with a trigger price, a target and an invalidation (where the
idea is wrong). Take prices from the levels on my chart where one fits and name it in
"levelNote" (for example "yesterday's high" or the drawing's name); only use other prices when
no level fits, and say so. A long's invalidation is below its trigger and its target above; a
short's the other way. Keep names short. Leave a price null rather than guess.

Levels on my chart (label: price or range):
${levels.map((l) => `- ${l.label}: ${l.low === l.high ? fmtPrice(l.low) : `${fmtPrice(l.low)} to ${fmtPrice(l.high)}`}`).join("\n") || "- none"}

${market.join("\n")}

${current ? `My plan so far (do not repeat these scenarios):\n${current}` : "No plan yet."}

${describeAnalysis(analysis).slice(0, 6000)}

${recurringLessonsText(day)}`;

  const draft = await runAiObject({
    prompt,
    name: "plan_draft",
    maxOutputTokens: 1200,
    schema: {
      type: "object",
      properties: {
        bias: { type: ["string", "null"], enum: ["long", "short", "neutral", null] },
        biasReason: { type: "string" },
        scenarios: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              direction: { type: "string", enum: ["long", "short"] },
              trigger: { type: ["number", "null"] },
              target: { type: ["number", "null"] },
              invalidation: { type: ["number", "null"] },
              note: { type: "string" },
              levelNote: { type: "string" },
            },
            required: [
              "name",
              "direction",
              "trigger",
              "target",
              "invalidation",
              "note",
              "levelNote",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["bias", "biasReason", "scenarios"],
      additionalProperties: false,
    },
    read: (value) => {
      const o = read.object(value);
      const price = (v: unknown) => (v === null ? null : read.number(v));
      return {
        bias: o.bias === "long" || o.bias === "short" || o.bias === "neutral" ? o.bias : null,
        biasReason: read.text(o.biasReason, 400),
        scenarios: read
          .array(o.scenarios, MAX_DRAFT * 2)
          .slice(0, MAX_DRAFT)
          .map((item): DraftScenario => {
            const s = read.object(item);
            const direction = read.oneOf(s.direction, ["long", "short"] as const);
            const checked = checkScenarioPrices({
              direction,
              trigger: price(s.trigger),
              target: price(s.target),
              invalidation: price(s.invalidation),
            });
            return {
              name: read.text(s.name, 80),
              direction,
              trigger: checked.trigger,
              target: checked.target,
              invalidation: checked.invalidation,
              note: read.text(s.note, 300),
              levelNote: read.text(s.levelNote, 200),
              problems: checked.problems,
            };
          }),
      };
    },
  });
  return ok({ day, ...draft });
});
