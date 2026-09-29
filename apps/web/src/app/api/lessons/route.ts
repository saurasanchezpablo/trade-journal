import { dayKeyOf } from "@luxalgo/journal-core";
import { handler, ok, requireValue } from "@/server/api";
import { isDay } from "@/server/ai-scope";
import { lessonHistory } from "@/server/lessons";
import { getTimeZone } from "@/server/settings";

/** Keep and Fix lessons from the day notes, grouped, with how often they come back. */
export const GET = handler((request: Request) => {
  const params = new URL(request.url).searchParams;
  const to = params.get("to") ?? dayKeyOf(new Date().toISOString(), getTimeZone());
  const weeks = Number(params.get("weeks") ?? 8);
  requireValue(isDay(to), "to must be YYYY-MM-DD");
  requireValue(Number.isInteger(weeks) && weeks >= 1 && weeks <= 104, "weeks must be 1 to 104");
  const from = new Date(Date.parse(`${to}T12:00:00Z`) - (weeks * 7 - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return ok({ from, to, lessons: lessonHistory({ from, to }) });
});
