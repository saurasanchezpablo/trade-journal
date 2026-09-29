import { describe, expect, it } from "vitest";
import {
  describeLesson,
  lessonSimilarity,
  lessonWords,
  trackLessons,
  weekOf,
} from "../src/lib/lesson-tracking";

const note = (keep: string[], fix: string[]) =>
  `Some thoughts.\n\n**Keep**\n${keep.map((k) => `- ${k}`).join("\n")}\n\n**Fix**\n${fix.map((f) => `- ${f}`).join("\n")}\n`;

describe("lessons that keep coming back", () => {
  it("group the same lesson written in different words", () => {
    expect(
      lessonSimilarity(
        lessonWords("No trades after 3pm"),
        lessonWords("no more trading after 3 pm"),
      ),
    ).toBeGreaterThanOrEqual(0.6);
    expect(
      lessonSimilarity(lessonWords("Waited for the retest"), lessonWords("No trades after 3pm")),
    ).toBe(0);
  });

  it("count days, weeks and weeks in a row, and describe the streak", () => {
    const lessons = trackLessons([
      { date: "2026-09-10", note: note(["Waited for the retest"], ["No trades after 3pm"]) },
      { date: "2026-09-16", note: note([], ["No more trading after 3 pm"]) },
      { date: "2026-09-17", note: note([], ["Stop trading after 3pm!"]) },
      { date: "2026-09-24", note: note(["Sized down after a loss"], ["no trades after 3pm"]) },
    ]);
    const late = lessons[0]!;
    expect(late).toMatchObject({
      kind: "fix",
      text: "no trades after 3pm",
      days: ["2026-09-10", "2026-09-16", "2026-09-17", "2026-09-24"],
      weeks: 3,
      streak: 3,
      firstSeen: "2026-09-10",
    });
    expect(late.variants).toEqual([
      "No trades after 3pm",
      "No more trading after 3 pm",
      "Stop trading after 3pm!",
    ]);
    expect(describeLesson(late)).toBe(
      "Fix, third week in a row: no trades after 3pm (4 days since 2026-09-10)",
    );
    // One-off lessons come after the recurring one.
    expect(lessons.slice(1).map((l) => l.days.length)).toEqual([1, 1]);
  });

  it("keep Keep and Fix apart, and break a streak on a week without it", () => {
    const lessons = trackLessons(
      [
        { date: "2026-09-01", note: note(["Patience at the open"], []) },
        { date: "2026-09-15", note: note(["patience at the open"], ["Patience at the open"]) },
      ],
      "2026-09-16",
    );
    const keep = lessons.find((l) => l.kind === "keep")!;
    expect(keep).toMatchObject({ weeks: 2, streak: 1 });
    expect(describeLesson(keep)).toBe(
      "Keep, in 2 different weeks: patience at the open (2 days since 2026-09-01)",
    );
    expect(lessons.filter((l) => l.kind === "fix")).toHaveLength(1);
  });

  it("keep a streak through the current week until it is over", () => {
    const fix = (t: string) => `**Fix**\n- ${t}\n`;
    const [lesson] = trackLessons(
      [
        { date: "2026-09-08", note: fix("No trades after 3pm") },
        { date: "2026-09-16", note: fix("No trades after 3pm") },
        { date: "2026-09-23", note: fix("No trades after 3pm") },
      ],
      // Tuesday of the next week, before the lesson has come back this week.
      "2026-09-29",
    );
    expect(lesson!.streak).toBe(3);
  });

  it("start weeks on Monday", () => {
    expect(weekOf("2026-09-28")).toBe("2026-09-28");
    expect(weekOf("2026-10-04")).toBe("2026-09-28");
  });
});
