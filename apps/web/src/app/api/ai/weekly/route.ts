import { bad, handler, ok, requireValue } from "@/server/api";
import { runAi } from "@/server/ai";
import { streamedAnswer, wantsStream } from "@/server/ai-stream";
import { getTimeZone } from "@/server/settings";
import { weekContext } from "@/server/journal-history";
import { isDayKey } from "@/lib/chart-analysis";
import { weekEnding } from "@/lib/journal-lessons";

/**
 * A weekly review of the seven journal days ending on `end`: trades, plan grades, trades
 * taken from a plan, and the Keep/Fix lessons from your day notes. Covers all accounts, as
 * day notes are shared across them.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { end?: unknown; stream?: unknown } | null;
  requireValue(body && isDayKey(body.end), "Choose the last day of the week.");
  const streamed = wantsStream(body.stream);
  const end = body.end as string;
  const { text, tradeCount } = weekContext(end, getTimeZone());
  const days = weekEnding(end);
  if (!tradeCount && !text.includes("Keep:") && !text.includes("Fix:"))
    return bad("Nothing to review that week: no closed trades or day lessons.");
  const prompt = `Write my weekly trading review for ${days[0]} to ${end} in first person ("I"), 200-320 words,
markdown with these sections: "**What worked**", "**What cost me**" (name repeated mistakes and
Fix items that came back), "**Plans**" (how often my graded scenarios played out, and whether
trades taken from a plan did better than the rest), and "**Next week**" (at most three concrete
rules). Use only the facts below; if something is missing, say so briefly instead of guessing.
All accounts; amounts are not converted between currencies.

${text}`;
  const result = (review: string) => ({ review, from: days[0], to: end });
  if (streamed) return streamedAnswer(request, { prompt, maxOutputTokens: 1400 }, result);
  return ok(result(await runAi(prompt, 1400)));
});
