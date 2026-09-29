import { dayKeyOf } from "@luxalgo/journal-core";
import { handler, ok, requireValue } from "@/server/api";
import { isDay } from "@/server/ai-scope";
import { getTimeZone } from "@/server/settings";
import { dayWindow } from "@/lib/day-window";
import { listVideos } from "@/server/external-analysis/store";

/**
 * External opinions for a journal day: videos published that day or the day before (a
 * pre-market analysis often comes out the evening before), newest first.
 */
export const GET = handler(async (request: Request) => {
  const date = new URL(request.url).searchParams.get("date");
  requireValue(isDay(date), "date (YYYY-MM-DD) is required");
  const timeZone = getTimeZone();
  const { to } = dayWindow(date, timeZone);
  const previous = new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { from } = dayWindow(previous, timeZone);
  const videos = listVideos({
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    limit: 40,
  }).map((v) => ({ ...v, day: dayKeyOf(v.publishedAt, timeZone) }));
  return ok({ date, timeZone, videos });
});
