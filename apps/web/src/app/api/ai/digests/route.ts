import { handler, ok, requireValue } from "@/server/api";
import { aiConfigured } from "@/server/ai";
import { listSubscriptions, webhookUrl } from "@/server/background-alerts/delivery";
import { TIME, type DigestSettings } from "@/server/ai-digests/schedule";
import { getDigestSettings, listDigests, saveDigestSettings } from "@/server/ai-digests/store";

const state = () => ({
  settings: getDigestSettings(),
  digests: listDigests(),
  delivery: { browsers: listSubscriptions().length, webhook: Boolean(webhookUrl()) },
  aiConfigured: aiConfigured(),
});

/** Scheduled digests: their settings, where they go, and the latest ones. */
export const GET = handler(async () => ok(state()));

const isWeekday = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

export const PUT = handler(async (request: Request) => {
  const body = (await request.json()) as unknown;
  requireValue(isObject(body), "Invalid digest settings");
  requireValue(
    Object.keys(body).every((k) => ["recap", "weekly", "summaryInNotification"].includes(k)),
    "Unknown digest setting",
  );
  const { recap, weekly } = body;
  requireValue(
    isObject(recap) &&
      Object.keys(recap).every((k) => ["enabled", "time", "weekdays"].includes(k)) &&
      typeof recap.enabled === "boolean" &&
      typeof recap.time === "string" &&
      TIME.test(recap.time) &&
      Array.isArray(recap.weekdays) &&
      recap.weekdays.length <= 7 &&
      recap.weekdays.every(isWeekday),
    "Recap: choose a time (HH:MM) and weekdays",
  );
  requireValue(
    isObject(weekly) &&
      Object.keys(weekly).every((k) => ["enabled", "weekday", "time"].includes(k)) &&
      typeof weekly.enabled === "boolean" &&
      isWeekday(weekly.weekday) &&
      typeof weekly.time === "string" &&
      TIME.test(weekly.time),
    "Weekly review: choose a weekday and a time (HH:MM)",
  );
  requireValue(
    typeof body.summaryInNotification === "boolean",
    "summaryInNotification must be true or false",
  );
  saveDigestSettings({
    recap: {
      enabled: recap.enabled as boolean,
      time: recap.time as string,
      weekdays: [...new Set(recap.weekdays as number[])].sort(),
    },
    weekly: {
      enabled: weekly.enabled as boolean,
      weekday: weekly.weekday as number,
      time: weekly.time as string,
    },
    summaryInNotification: body.summaryInNotification as boolean,
  } satisfies DigestSettings);
  return ok(state());
});
