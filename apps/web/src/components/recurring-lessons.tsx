"use client";

import Link from "next/link";
import { useState } from "react";
import type { TrackedLesson } from "@/lib/lesson-tracking";
import { useApi } from "@/lib/use-api";
import { Badge } from "./ui/badge";
import { SectionCard } from "./section-card";

const RANGES = [4, 8, 26] as const;

const repeat = (l: TrackedLesson) =>
  l.streak >= 2
    ? `${l.streak} weeks in a row`
    : l.weeks >= 2
      ? `in ${l.weeks} different weeks`
      : "this week only";

/**
 * The Keep and Fix lessons in your day notes that keep coming back, grouped when they say
 * the same thing. Recaps and weekly reviews mention them too.
 */
export function RecurringLessons() {
  const [weeks, setWeeks] = useState<(typeof RANGES)[number]>(8);
  const { data, error } = useApi<{ from: string; to: string; lessons: TrackedLesson[] }>(
    `/api/lessons?weeks=${weeks}`,
  );
  const recurring = data?.lessons.filter((l) => l.days.length > 1) ?? [];
  const once = (data?.lessons.length ?? 0) - recurring.length;
  const fixes = recurring.filter((l) => l.kind === "fix").length;
  return (
    <SectionCard
      id="journal-recurring-lessons"
      title="Lessons that keep coming back"
      summary={data ? `${fixes} fix, ${recurring.length - fixes} keep` : undefined}
      contentClassName="space-y-2 text-sm"
      actions={
        <select
          aria-label="Weeks to look back"
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value) as (typeof RANGES)[number])}
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
        >
          {RANGES.map((n) => (
            <option key={n} value={n}>
              Last {n} weeks
            </option>
          ))}
        </select>
      }
    >
      <p className="text-xs text-muted-foreground">
        From the Keep and Fix lists in your day notes (all accounts). Lessons written in other words
        are grouped.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {data && recurring.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No lesson has come back yet{once ? ` (${once} written once)` : ""}. Recaps end with Keep
          and Fix lists you can edit.
        </p>
      )}
      {recurring.length > 0 && (
        <ul className="divide-y rounded-md border">
          {recurring.map((l) => (
            <li key={`${l.kind}-${l.firstSeen}-${l.text}`} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={l.kind === "fix" ? "loss" : "profit"}>
                  {l.kind === "fix" ? "FIX" : "KEEP"}
                </Badge>
                <span className="min-w-0 flex-1">{l.text}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {repeat(l)} · {l.days.length} days · last on{" "}
                <Link href={`/journal/${l.lastSeen}`} className="underline">
                  {l.lastSeen}
                </Link>
                {l.variants.length > 0 &&
                  ` · also written as ${l.variants.map((v) => `"${v}"`).join(", ")}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {recurring.length > 0 && once > 0 && (
        <p className="text-xs text-muted-foreground">And {once} written once.</p>
      )}
    </SectionCard>
  );
}
