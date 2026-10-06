"use client";

import Link from "next/link";
import { useState } from "react";
import type { TrackedLesson } from "@/lib/lesson-tracking";
import { useApi } from "@/lib/use-api";
import { Badge } from "./ui/badge";
import { SectionCard } from "./section-card";
import { tr } from "@/lib/i18n";
import { useI18n } from "./i18n";

const RANGES = [4, 8, 26] as const;

const repeat = (l: TrackedLesson) =>
  l.streak >= 2
    ? tr("{count} weeks in a row", { count: l.streak })
    : l.weeks >= 2
      ? tr("in {count} different weeks", { count: l.weeks })
      : tr("this week only");

/**
 * The Keep and Fix lessons in your day notes that keep coming back, grouped when they say
 * the same thing. Recaps and weekly reviews mention them too.
 */
export function RecurringLessons() {
  const { t, tn } = useI18n();
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
      title={t("Lessons that keep coming back")}
      summary={
        data
          ? t("{fix} fix, {keep} keep", { fix: fixes, keep: recurring.length - fixes })
          : undefined
      }
      contentClassName="space-y-2 text-sm"
      actions={
        <select
          aria-label={t("Weeks to look back")}
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value) as (typeof RANGES)[number])}
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
        >
          {RANGES.map((n) => (
            <option key={n} value={n}>
              {t("Last {count} weeks", { count: n })}
            </option>
          ))}
        </select>
      }
    >
      <p className="text-xs text-muted-foreground">
        {t(
          "From the Keep and Fix lists in your day notes (all accounts). Lessons written in other words are grouped.",
        )}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {data && recurring.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {once
            ? t(
                "No lesson has come back yet ({count} written once). Recaps end with Keep and Fix lists you can edit.",
                { count: once },
              )
            : t("No lesson has come back yet. Recaps end with Keep and Fix lists you can edit.")}
        </p>
      )}
      {recurring.length > 0 && (
        <ul className="divide-y rounded-md border">
          {recurring.map((l) => (
            <li key={`${l.kind}-${l.firstSeen}-${l.text}`} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={l.kind === "fix" ? "loss" : "profit"}>
                  {l.kind === "fix" ? t("FIX") : t("KEEP")}
                </Badge>
                <span className="min-w-0 flex-1">{l.text}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {repeat(l)} · {tn(l.days.length, "{count} day", "{count} days")} · {t("last on")}{" "}
                <Link href={`/journal/${l.lastSeen}`} className="underline">
                  {l.lastSeen}
                </Link>
                {l.variants.length > 0 &&
                  ` · ${t("also written as {variants}", {
                    variants: l.variants.map((v) => `"${v}"`).join(", "),
                  })}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {recurring.length > 0 && once > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("And {count} written once.", { count: once })}
        </p>
      )}
    </SectionCard>
  );
}
