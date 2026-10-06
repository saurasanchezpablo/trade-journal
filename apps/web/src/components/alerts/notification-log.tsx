"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import {
  ALERT_KINDS,
  ALERT_KIND_LABELS,
  MUTE_REASONS,
  type MuteReason,
} from "@/lib/alert-preferences";
import { postJson, useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n";

interface Entry {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  at: string;
  delivered: number;
  muted: MuteReason | null;
}

const FILTERS = [
  { value: "", label: "All" },
  ...ALERT_KINDS.map((kind) => ({ value: kind, label: ALERT_KIND_LABELS[kind].title })),
  { value: "test", label: "Tests" },
];

const kindLabel = (kind: string) =>
  kind === "test"
    ? "Test"
    : (ALERT_KIND_LABELS[kind as keyof typeof ALERT_KIND_LABELS]?.title ?? kind);

/** Every notification the server sent or held back, newest first, with what became of it. */
export function NotificationLog() {
  const { t, tn, tx, intl } = useI18n();
  const [kind, setKind] = useState("");
  const { data, refresh } = useApi<{ notifications: Entry[] }>(
    `/api/alerts/log${kind ? `?kind=${kind}` : ""}`,
  );
  useEffect(() => {
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);
  const entries = data?.notifications ?? [];
  return (
    <SectionCard
      id="alerts-log"
      title={t("Recent alerts")}
      summary={t("{count} shown", { count: entries.length })}
      actions={
        entries.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void postJson("/api/alerts/log", {}, "DELETE").then(refresh)}
          >
            <Trash2 /> {t("Clear")}
          </Button>
        ) : undefined
      }
      contentClassName="space-y-3"
    >
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("Show alerts of one kind")}>
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            size="sm"
            variant={kind === filter.value ? "secondary" : "ghost"}
            aria-pressed={kind === filter.value}
            className="h-7 px-2 text-xs"
            onClick={() => setKind(filter.value)}
          >
            {filter.value ? t(filter.label) : tx("alerts", "All")}
          </Button>
        ))}
      </div>
      {data && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("No alerts yet.")}</p>
      )}
      {entries.length > 0 && (
        <ul className="max-h-[560px] divide-y overflow-y-auto rounded-md border">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-0.5 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(kindLabel(entry.kind))}
                </span>
                <Link href={entry.url} className="font-medium underline-offset-2 hover:underline">
                  {entry.title}
                </Link>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(entry.at).toLocaleString(intl)}
                </span>
              </div>
              <p className="whitespace-pre-line text-xs text-muted-foreground">{entry.body}</p>
              <p
                className={cn(
                  "text-xs",
                  entry.muted || !entry.delivered ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {entry.muted
                  ? t("Not sent: {reason}", { reason: t(MUTE_REASONS[entry.muted]) })
                  : entry.delivered
                    ? tn(
                        entry.delivered,
                        "Sent to {count} destination",
                        "Sent to {count} destinations",
                      )
                    : t("Not delivered: no browser or webhook took it")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
