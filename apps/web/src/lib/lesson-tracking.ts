import { lessonsFrom } from "./journal-lessons";

/**
 * Lessons that keep coming back. Every Keep and Fix item in your day notes is read (the
 * notes stay the only copy, so editing a note changes the history), and items that say the
 * same thing in slightly different words are grouped: "no trades after 3pm" and "No more
 * trading after 3 pm" are one lesson. Each lesson then counts its days, its weeks and how
 * many weeks in a row it has come back.
 */

export interface LessonOccurrence {
  date: string;
  text: string;
}

export interface TrackedLesson {
  kind: "keep" | "fix";
  /** The latest wording. */
  text: string;
  /** Other wordings grouped with it. */
  variants: string[];
  days: string[];
  /** Distinct weeks (Monday to Sunday) it appeared in. */
  weeks: number;
  /**
   * Weeks in a row it appeared, counting back from the week of `asOf` (or the week before,
   * while `asOf`'s week has not had it yet).
   */
  streak: number;
  firstSeen: string;
  lastSeen: string;
}

const STOP = new Set(
  "a an the to of and or in on at for with my i me is am are be been it its this that than then do don't dont not no more less too very just so when while from by as".split(
    " ",
  ),
);

/** Normalised words: lower case, no punctuation or filler, light stemming. */
export function lessonWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/(\d)\s*(am|pm)\b/g, "$1$2")
    .replace(/[^a-z0-9%]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) =>
      w.length > 5 && w.endsWith("ing")
        ? w.slice(0, -3)
        : w.length > 4 && w.endsWith("ed")
          ? w.slice(0, -2)
          : w.length > 3 && w.endsWith("s") && !w.endsWith("ss")
            ? w.slice(0, -1)
            : w,
    );
  return new Set(words);
}

/** How alike two lessons are: shared words over the shorter one's words (0 to 1). */
export function lessonSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/** Same lesson: most words shared, and at least two unless both are one word. */
const SAME = 0.6;
const sameLesson = (a: Set<string>, b: Set<string>) => {
  const similarity = lessonSimilarity(a, b);
  if (Math.min(a.size, b.size) <= 1) return similarity === 1 && Math.max(a.size, b.size) <= 2;
  return similarity >= SAME;
};

/** The Monday of a day's week, "YYYY-MM-DD". */
export function weekOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  const back = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Every lesson in the notes, grouped; lessons seen on more than one day first, the longest
 * streaks first. `asOf` (default: the latest note) anchors the streak.
 */
export function trackLessons(
  notes: { date: string; note: string }[],
  asOf?: string,
): TrackedLesson[] {
  const groups: {
    kind: "keep" | "fix";
    members: { words: Set<string>; text: string; date: string }[];
  }[] = [];
  const sorted = [...notes].sort((a, b) => a.date.localeCompare(b.date));
  for (const { date, note } of sorted) {
    const lessons = lessonsFrom(note);
    for (const kind of ["keep", "fix"] as const)
      for (const text of lessons[kind]) {
        const words = lessonWords(text);
        if (!words.size) continue;
        let best: (typeof groups)[number] | null = null;
        let bestScore = 0;
        for (const group of groups) {
          if (group.kind !== kind) continue;
          for (const member of group.members) {
            const score = lessonSimilarity(words, member.words);
            if (sameLesson(words, member.words) && score > bestScore) {
              best = group;
              bestScore = score;
            }
          }
        }
        if (best) best.members.push({ words, text, date });
        else groups.push({ kind, members: [{ words, text, date }] });
      }
  }
  const anchor = weekOf(asOf ?? sorted.at(-1)?.date ?? new Date().toISOString().slice(0, 10));
  return groups
    .map((group) => {
      const days = [...new Set(group.members.map((m) => m.date))].sort();
      const weeks = new Set(days.map(weekOf));
      let streak = 0;
      // The anchor's week may not be over: a streak that reached last week still counts.
      const back = (week: string) =>
        new Date(Date.parse(`${week}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
      for (
        let week = weeks.has(anchor) ? anchor : back(anchor);
        weeks.has(week);
        week = new Date(Date.parse(`${week}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)
      )
        streak += 1;
      const latest = group.members.at(-1)!.text;
      return {
        kind: group.kind,
        text: latest,
        variants: [...new Set(group.members.map((m) => m.text))].filter((t) => t !== latest),
        days,
        weeks: weeks.size,
        streak,
        firstSeen: days[0]!,
        lastSeen: days.at(-1)!,
      };
    })
    .sort(
      (a, b) =>
        Number(b.days.length > 1) - Number(a.days.length > 1) ||
        b.streak - a.streak ||
        b.days.length - a.days.length ||
        b.lastSeen.localeCompare(a.lastSeen),
    );
}

const ORDINAL = ["", "", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** "Fix, third week in a row: late-day overtrading (5 days since 2026-09-01)". */
export function describeLesson(lesson: TrackedLesson): string {
  const label = lesson.kind === "fix" ? "Fix" : "Keep";
  const repeat =
    lesson.streak >= 2
      ? `, ${ORDINAL[lesson.streak] ?? `${lesson.streak}th`} week in a row`
      : lesson.weeks >= 2
        ? `, in ${lesson.weeks} different weeks`
        : "";
  return `${label}${repeat}: ${lesson.text} (${lesson.days.length} day${lesson.days.length === 1 ? "" : "s"} since ${lesson.firstSeen})`;
}
