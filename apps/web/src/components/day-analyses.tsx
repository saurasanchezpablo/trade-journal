"use client";

import { useState } from "react";
import Link from "next/link";
import { CandlestickChart, FilePlus2, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { DayReview } from "./day-review";
import { postJson, useApi } from "@/lib/use-api";
import { formatTimestamp } from "@/lib/timezone";
import { useFilters } from "./filter-bar";
import { useI18n } from "./i18n";
import {
  analysisEditPath,
  analysisLabel,
  snapshotImagePath,
  snapshotMarkdown,
  snapshotViewPath,
  type AnalysisSnapshotSummary,
} from "@/lib/chart-analysis";

/**
 * The chart analyses as they stood on this journal day. Every analysis edited that day
 * appears here on its own; today's keep updating until the day ends, earlier days stay
 * as they were.
 */
export function DayAnalyses({
  date,
  today,
  note,
  onInsert,
}: {
  date: string;
  today: boolean;
  note: string;
  onInsert: (markdown: string) => void;
}) {
  const { t, tn } = useI18n();
  const { data, error, refresh } = useApi<{ snapshots: AnalysisSnapshotSummary[] }>(
    `/api/analysis-snapshots?day=${date}`,
  );
  // Save times in the journal's time zone, like the day itself.
  const { timeZone } = useFilters();
  const [problem, setProblem] = useState("");
  const snapshots = data?.snapshots ?? [];
  const remove = async (s: AnalysisSnapshotSummary) => {
    if (
      !confirm(
        t("Remove this day's version of {label}? The live analysis stays.", {
          label: analysisLabel(toLabel(s)),
        }),
      )
    )
      return;
    setProblem("");
    try {
      await postJson(
        `/api/analyses/${encodeURIComponent(s.analysisId)}/snapshots/${date}`,
        {},
        "DELETE",
      );
      refresh();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("Could not remove it."));
    }
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("Chart analyses this day")}</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href={`/charts?day=${date}`}>
            <CandlestickChart />
            {t("Open Charts")}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {today
            ? t(
                "Analyses you edit today are saved here as they stand, and stop changing when the day ends. The live chart keeps evolving.",
              )
            : t(
                "Each analysis as it was at the end of this day. Later changes to the live chart do not alter it.",
              )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {data && snapshots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("No chart analysis was edited this day.")}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {snapshots.map((s) => {
            const label = analysisLabel(toLabel(s));
            const inNote = note.includes(snapshotImagePath(s.analysisId, date));
            return (
              <figure key={s.analysisId} className="overflow-hidden rounded-lg border bg-card">
                <Link
                  href={snapshotViewPath(s.analysisId, date)}
                  aria-label={t("Open {label} as of {date}", { label, date })}
                >
                  {s.hasImage ? (
                    <img
                      src={`${snapshotImagePath(s.analysisId, date)}?v=${encodeURIComponent(s.updatedAt)}`}
                      alt={t("{label} on {date}", { label, date })}
                      loading="lazy"
                      className="block h-auto w-full"
                    />
                  ) : (
                    <span className="block p-6 text-center text-sm text-muted-foreground">
                      {t("No picture was saved for this day.")}
                    </span>
                  )}
                </Link>
                <figcaption className="space-y-1.5 border-t px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{label}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {tn(s.drawingCount, "{count} drawing", "{count} drawings")} ·{" "}
                      {t(today ? "updated {time}" : "last saved {time}", {
                        time: formatTimestamp(s.updatedAt, timeZone).slice(11, 16),
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href={snapshotViewPath(s.analysisId, date)} className="underline">
                      {t("View this version")}
                    </Link>
                    <Link href={analysisEditPath(s.analysisId)} className="underline">
                      {t("Live chart")}
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 underline disabled:no-underline disabled:opacity-60"
                      disabled={inNote}
                      onClick={() => onInsert(snapshotMarkdown(toLabel(s), date))}
                    >
                      <FilePlus2 aria-hidden="true" className="size-3" />
                      {inNote ? t("In the note") : t("Add to note")}
                    </button>
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"
                      aria-label={t("Remove {label} from this day", { label })}
                      onClick={() => void remove(s)}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                    </button>
                  </div>
                  <DayReview analysisId={s.analysisId} date={date} />
                </figcaption>
              </figure>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const toLabel = (s: AnalysisSnapshotSummary) => ({
  id: s.analysisId,
  title: s.title,
  symbol: s.symbol,
  resolution: s.resolution,
});
