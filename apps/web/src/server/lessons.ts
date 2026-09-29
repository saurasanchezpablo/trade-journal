import { and, gte, lte } from "drizzle-orm";
import { db, journalDays } from "@/db";
import { describeLesson, trackLessons, type TrackedLesson } from "@/lib/lesson-tracking";

/**
 * Lessons from the day notes between two days (inclusive). Day notes are shared across
 * accounts, so lessons are too: only all-account, otherwise unfiltered views show them.
 */
export function lessonHistory(options: { from?: string; to?: string; asOf?: string } = {}) {
  const notes = db
    .select({ date: journalDays.date, note: journalDays.note })
    .from(journalDays)
    .where(
      and(
        options.from ? gte(journalDays.date, options.from) : undefined,
        options.to ? lte(journalDays.date, options.to) : undefined,
      ),
    )
    .all();
  return trackLessons(notes, options.asOf ?? options.to);
}

export const RECURRING_WEEKS = 8;

/** Lessons seen on more than one day in the weeks up to `end`, as lines for the AI. */
export function recurringLessonsText(end: string, limit = 8): string {
  const from = new Date(Date.parse(`${end}T12:00:00Z`) - (RECURRING_WEEKS * 7 - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const lines = lessonHistory({ from, to: end })
    .filter((l: TrackedLesson) => l.days.length > 1)
    .slice(0, limit)
    .map((l) => `- ${describeLesson(l)}`);
  return lines.length
    ? `Lessons that keep coming back in my day notes (last ${RECURRING_WEEKS} weeks):\n${lines.join("\n")}`
    : "";
}
