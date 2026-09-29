import { clockTime, dayKeyOf } from "@luxalgo/journal-core";

/**
 * When scheduled digests are due. Pure: settings, the time and the journal's timezone in,
 * the digests due out. A slot that passed while the server was down is still sent if it is
 * recent (a few hours for a recap, a day for the weekly review), never a stale one.
 */

export type DigestKind = "day" | "week";

export interface DigestSettings {
  /** The session recap, on the chosen weekdays at the chosen local time. */
  recap: { enabled: boolean; time: string; weekdays: number[] };
  /** The weekly review of the seven days ending on the chosen weekday. */
  weekly: { enabled: boolean; weekday: number; time: string };
  /**
   * Put the start of the answer in the notification. Off by default: notifications show on
   * lock screens, and webhook topics (such as ntfy.sh) may be readable by others.
   */
  summaryInNotification: boolean;
}

export const DEFAULT_DIGESTS: DigestSettings = {
  recap: { enabled: false, time: "17:00", weekdays: [1, 2, 3, 4, 5] },
  weekly: { enabled: false, weekday: 5, time: "18:00" },
  summaryInNotification: false,
};

/** How late a missed slot is still sent. */
export const CATCH_UP_MS: Record<DigestKind, number> = {
  day: 3 * 3_600_000,
  week: 24 * 3_600_000,
};

export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/** Hand-checked settings; anything malformed falls back to the default for that field. */
export function readDigestSettings(value: unknown): DigestSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const recap = (v.recap && typeof v.recap === "object" ? v.recap : {}) as Record<string, unknown>;
  const weekly = (v.weekly && typeof v.weekly === "object" ? v.weekly : {}) as Record<
    string,
    unknown
  >;
  const day = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
  return {
    recap: {
      enabled: recap.enabled === true,
      time:
        typeof recap.time === "string" && TIME.test(recap.time)
          ? recap.time
          : DEFAULT_DIGESTS.recap.time,
      weekdays: Array.isArray(recap.weekdays)
        ? [...new Set(recap.weekdays.filter(day) as number[])].sort()
        : DEFAULT_DIGESTS.recap.weekdays,
    },
    weekly: {
      enabled: weekly.enabled === true,
      weekday: day(weekly.weekday) ? (weekly.weekday as number) : DEFAULT_DIGESTS.weekly.weekday,
      time:
        typeof weekly.time === "string" && TIME.test(weekly.time)
          ? weekly.time
          : DEFAULT_DIGESTS.weekly.time,
    },
    summaryInNotification: v.summaryInNotification === true,
  };
}

/**
 * The local day a slot at `time` fell on, looking back from `now` over the catch-up window:
 * today when the slot has passed today, else yesterday's slot if it is still recent.
 */
function slotDays(now: number, timeZone: string, time: string, window: number): string[] {
  const days: string[] = [];
  const today = dayKeyOf(new Date(now).toISOString(), timeZone);
  const clock = minutes(clockTime(new Date(now).toISOString(), timeZone));
  const slot = minutes(time);
  // Minutes since the slot today; negative before it.
  const sinceToday = clock - slot;
  if (sinceToday >= 0 && sinceToday * 60_000 <= window) days.push(today);
  const yesterday = dayKeyOf(new Date(now - 86_400_000).toISOString(), timeZone);
  if (yesterday !== today && (sinceToday + 24 * 60) * 60_000 <= window) days.push(yesterday);
  return days;
}

/** The digests due at `now`: each a kind and its period (the day, or the week's last day). */
export function dueDigests(
  settings: DigestSettings,
  now: number,
  timeZone: string,
): { kind: DigestKind; period: string }[] {
  const due: { kind: DigestKind; period: string }[] = [];
  if (settings.recap.enabled)
    for (const day of slotDays(now, timeZone, settings.recap.time, CATCH_UP_MS.day))
      if (settings.recap.weekdays.includes(weekdayOf(day))) due.push({ kind: "day", period: day });
  if (settings.weekly.enabled)
    for (const day of slotDays(now, timeZone, settings.weekly.time, CATCH_UP_MS.week))
      if (weekdayOf(day) === settings.weekly.weekday) due.push({ kind: "week", period: day });
  return due;
}

/** The first sentences of an answer as plain text, for a notification. */
export function summaryOf(markdown: string, max = 220): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  return sentence > max / 2 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
