"use client";

import { Sparkles } from "lucide-react";
import type { AnalysisFilters } from "@luxalgo/journal-core";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";
import { useState } from "react";
import { postAiStream } from "@/lib/ai-stream";
import { useAiRequest, type AiScope } from "@/lib/use-ai-request";
import { AiChartsToggle, useAiCharts, type AiAnalysisUsed } from "./ai-charts-option";
import { useI18n } from "./i18n";

/** The parent keys this component by date, filters and timezone. */
export function AiRecap({
  date,
  filters,
  timeZone,
  disabled,
  onRecap,
}: {
  date: string;
  filters: AnalysisFilters;
  timeZone: string;
  disabled: boolean;
  onRecap: (result: { recap: string; scope: AiScope; analyses?: AiAnalysisUsed[] }) => void;
}) {
  const { t } = useI18n();
  const { run, busy, error, dismiss } = useAiRequest();
  const [charts, setCharts] = useAiCharts();
  // The recap as it is written; it joins the note once complete.
  const [preview, setPreview] = useState("");
  const generate = () => {
    setPreview("");
    return run(
      () =>
        postAiStream<{ recap: string; scope: AiScope; analyses?: AiAnalysisUsed[] }>(
          "/api/ai/recap",
          {
            date,
            filters,
            timeZone,
            // The server includes linked analyses unless told not to.
            ...(charts ? {} : { includeAnalyses: false }),
          },
          setPreview,
        ),
      onRecap,
    );
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void generate()}
          disabled={busy || disabled}
        >
          <Sparkles />
          {busy ? t("Writing…") : t("AI recap")}
        </Button>
        <AiChartsToggle checked={charts} onChange={setCharts} />
      </div>
      {busy && preview && (
        <p
          aria-live="polite"
          aria-label={t("Recap being written")}
          className="whitespace-pre-wrap rounded-md border p-3 text-sm leading-relaxed text-muted-foreground"
        >
          {preview}
        </p>
      )}
      {error && <AiNotice error={error} onRetry={() => void generate()} onDismiss={dismiss} />}
    </div>
  );
}
