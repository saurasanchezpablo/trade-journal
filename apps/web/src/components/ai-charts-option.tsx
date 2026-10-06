"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { analysisEditPath } from "@/lib/chart-analysis";
import { tr } from "@/lib/i18n";
import { useI18n } from "./i18n";

/** A chart analysis an AI review looked at, as the recap and critique routes report it. */
export interface AiAnalysisUsed {
  id: string;
  label: string;
  /** Whether its snapshot was sent as an image. */
  image: boolean;
}

const KEY = "journal-ai-charts-v1";

/** Whether AI reviews send linked chart analyses (on unless turned off on this device). */
export function useAiCharts(): [boolean, (value: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(KEY) !== "off");
    } catch {
      // Default on.
    }
  }, []);
  const change = (value: boolean) => {
    setOn(value);
    try {
      localStorage.setItem(KEY, value ? "on" : "off");
    } catch {
      // This page only.
    }
  };
  return [on, change];
}

export function AiChartsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <label
      className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
      title={t(
        "Chart analyses embedded in the notes or assigned to the day, with their snapshots as images",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t("Include linked chart analyses")}
    </label>
  );
}

export function AiChartsUsed({ analyses }: { analyses: AiAnalysisUsed[] | undefined }) {
  const { t } = useI18n();
  if (!analyses?.length) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {analyses.length === 1 ? t("Checked against chart:") : t("Checked against charts:")}{" "}
      {analyses.map((a, i) => (
        <span key={a.id}>
          {i > 0 && ", "}
          <Link href={analysisEditPath(a.id)} className="underline">
            {a.label}
          </Link>
          {!a.image && ` ${t("(no snapshot)")}`}
        </span>
      ))}
    </p>
  );
}

/** A markdown line naming the analyses a recap used, for the saved note (in its language). */
export const analysesUsedMarkdown = (analyses: AiAnalysisUsed[] | undefined) =>
  analyses?.length
    ? `_${tr("Checked against: {charts}", {
        charts: analyses.map((a) => a.label.replace(/[\\`*_{}[\]<>#]/g, "")).join(", "),
      })}_\n\n`
    : "";
