"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { postJson, useApi } from "@/lib/use-api";
import { watchSummary } from "./alerts/watched-charts";
import { useT } from "./i18n";

interface WatchState {
  watched: boolean;
  running: boolean;
  watch: {
    state: string;
    error: string | null;
    lines: number;
    zones: number;
    lastPrice: number | null;
  } | null;
}

interface AlertEvent {
  id: string;
  title: string;
  message: string;
  at: string;
  delivered: number;
}

/**
 * Alerts that keep working with the page closed: the server watches this analysis's lines
 * and zones and notifies you. Where they go and which you receive are set on the Alerts
 * page. Self-contained: it keeps its own state through /api/alerts, so the chart page only
 * renders it.
 */
export function BackgroundAlerts({
  analysisId,
  disabledReason,
  ensureAnalysis,
}: {
  analysisId: string | null;
  /** Why the switch can't be used right now (a read-only day version). */
  disabledReason?: string;
  /** Saves the chart as an analysis when it has none yet; returns its id. */
  ensureAnalysis: () => Promise<string | null>;
}) {
  const t = useT();
  const { data: watchState, refresh: refreshWatch } = useApi<WatchState>(
    analysisId ? `/api/alerts/watch?analysisId=${encodeURIComponent(analysisId)}` : null,
  );
  const enabled = Boolean(analysisId && watchState?.watched);
  const { data: events, refresh: refreshEvents } = useApi<{ events: AlertEvent[] }>(
    analysisId ? `/api/alerts/events?analysisId=${encodeURIComponent(analysisId)}` : null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  /** The switch shows the new state while it saves, and goes back if saving fails. */
  const [pending, setPending] = useState<boolean | null>(null);
  const checked = pending ?? enabled;

  useEffect(() => {
    const timer = setInterval(() => {
      refreshWatch();
      refreshEvents();
    }, 15_000);
    return () => clearInterval(timer);
  }, [refreshWatch, refreshEvents]);

  const toggle = async (next: boolean) => {
    setPending(next);
    setBusy(true);
    setMessage("");
    try {
      const id = analysisId ?? (await ensureAnalysis());
      if (!id) throw new Error(t("Draw something first, so there is an analysis to watch."));
      await postJson("/api/alerts/watch", { analysisId: id, watched: next }, "PUT");
      refreshWatch();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("Something went wrong."));
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t pt-2">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          disabled={busy || Boolean(disabledReason)}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>
          {t("Keep watching when this page is closed")}
          <span className="block text-xs text-muted-foreground">
            {disabledReason ??
              t(
                "The server checks this analysis's lines and zones and notifies you. Indicator alerts only run while the chart is open.",
              )}
          </span>
        </span>
      </label>
      {checked && watchState && (
        <p
          role="status"
          className={
            watchState.watch?.state === "error"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {watchSummary(watchState.watch, watchState.running)}
        </p>
      )}
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("Browsers, webhook, which alerts you receive, quiet hours and every chart watched:")}{" "}
        <Link href="/alerts" className="underline">
          {t("Alerts")}
        </Link>
        .
      </p>

      {events && events.events.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">{t("Sent by the server")}</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {events.events.map((event) => (
              <li key={event.id}>
                {event.message}
                <span className="block text-muted-foreground">
                  {new Date(event.at).toLocaleString()}
                  {event.delivered ? "" : ` · ${t("not sent (see Alerts)")}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
