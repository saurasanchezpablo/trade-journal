"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import { analysisEditPath, type ChartAnalysisSummary } from "@/lib/chart-analysis";
import { providerInfo } from "@/lib/market-providers";
import { postJson, useApi } from "@/lib/use-api";
import { fmtNumber } from "@/lib/utils";

interface WatchStatus {
  state: string;
  error: string | null;
  lines: number;
  zones: number;
  lastPrice: number | null;
}

interface WatchList {
  running: boolean;
  max: number;
  watched: { analysisId: string; since: string; watch: WatchStatus | null }[];
}

const STATE: Record<string, string> = {
  starting: "Starting",
  live: "Live",
  polling: "Checked periodically",
  reconnecting: "Reconnecting",
  error: "Not watching",
};

export function watchSummary(watch: WatchStatus | null, running: boolean): string {
  if (!running) return "The background watcher is off on the server.";
  if (!watch) return "Nothing to watch: draw a horizontal line, ray or trend line, or add a zone.";
  if (watch.state === "error") return `Not watching: ${watch.error ?? "unknown error"}`;
  const what = `${watch.lines} line${watch.lines === 1 ? "" : "s"}, ${watch.zones} zone${watch.zones === 1 ? "" : "s"}`;
  const price = watch.lastPrice !== null ? ` · last ${fmtNumber(watch.lastPrice)}` : "";
  return `${STATE[watch.state] ?? watch.state} · ${what}${price}`;
}

/**
 * The chart analyses the server watches with no page open: their lines and zones alert
 * as on the open chart. Switch one on or off here, or from its chart's Alerts card.
 */
export function WatchedCharts() {
  const { data, refresh } = useApi<WatchList>("/api/alerts/watch");
  const { data: all } = useApi<{ analyses: ChartAnalysisSummary[] }>("/api/analyses");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);
  const byId = useMemo(() => new Map((all?.analyses ?? []).map((a) => [a.id, a])), [all]);
  const watchedIds = new Set(data?.watched.map((w) => w.analysisId));
  const unwatched = (all?.analyses ?? []).filter((a) => !watchedIds.has(a.id));

  const setWatched = async (analysisId: string, watched: boolean) => {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/alerts/watch", { analysisId, watched }, "PUT");
      setAdding("");
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change it.");
    } finally {
      setBusy(false);
    }
  };

  const count = data?.watched.length ?? 0;
  return (
    <SectionCard
      id="alerts-watched"
      title="Charts watched in the background"
      summary={`${count} of ${data?.max ?? 25}`}
      contentClassName="space-y-3"
    >
      <p className="text-xs text-muted-foreground">
        The server checks these analyses&apos; visible lines and zones with no page open, at most
        once a minute per level, and sends their alerts as chosen under What you receive.
      </p>
      {data && count === 0 && (
        <p className="text-sm text-muted-foreground">No chart is watched in the background yet.</p>
      )}
      {data && count > 0 && (
        <ul className="divide-y rounded-md border">
          {data.watched.map(({ analysisId, watch }) => {
            const analysis = byId.get(analysisId);
            return (
              <li key={analysisId} className="flex items-start gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={analysisEditPath(analysisId)}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {analysis?.title || analysis?.symbol || "Chart analysis"}
                  </Link>
                  {analysis && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {analysis.symbol} · {analysis.resolution} ·{" "}
                      {providerInfo(analysis.provider)?.name ?? analysis.provider}
                    </span>
                  )}
                  <p
                    className={
                      watch?.state === "error"
                        ? "text-xs text-destructive"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {watchSummary(watch, data.running)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void setWatched(analysisId, false)}
                >
                  <EyeOff /> Stop watching
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {unwatched.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <OptionSelect
            aria-label="Chart analysis to watch"
            className="h-8 w-72 max-w-full text-xs"
            value={adding}
            onValueChange={setAdding}
          >
            <option value="" disabled>
              Watch another chart analysis…
            </option>
            {unwatched.map((analysis) => (
              <option key={analysis.id} value={analysis.id}>
                {`${analysis.title || analysis.symbol} · ${analysis.symbol} ${analysis.resolution}`}
              </option>
            ))}
          </OptionSelect>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!adding || busy}
            onClick={() => void setWatched(adding, true)}
          >
            <Eye /> Watch
          </Button>
        </div>
      )}
      {all && all.analyses.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Draw lines or zones on a chart first: each chart saves itself as an analysis.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
