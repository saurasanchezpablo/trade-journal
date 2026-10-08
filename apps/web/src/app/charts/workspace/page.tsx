"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ChartWorkspace, workspaceSaved } from "@/components/chart-workspace";
import { useT } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import type { ChartScript } from "@/lib/chart-indicators";
import { seedCells, startingMarket, workspaceSources } from "@/lib/chart-workspace";
import { tr } from "@/lib/i18n";
import type { MarketConnection } from "@/lib/market-data";
import { recentSymbols } from "@/lib/recent-symbols";
import { useApi } from "@/lib/use-api";
import { usePrivacy } from "@/components/privacy";
import type { CalendarState, EconomicEvent } from "@/lib/economic-calendar";
import { tradePath } from "@/lib/trade-links";

const NO_EVENTS: EconomicEvent[] = [];

export default function ChartWorkspacePage() {
  return (
    <Suspense>
      <WorkspaceLoader />
    </Suspense>
  );
}

type Saved = { state: string | null } | { error: string };

/** Loads what the workspace starts from, then shows it over the whole window. */
function WorkspaceLoader() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { data: connections, error: connectionError } = useApi<{
    connections: MarketConnection[];
  }>("/api/market-data/connections");
  const { data: settings } = useApi<{ timeZone: string }>("/api/settings");
  const { data: scriptData, error: scriptError } = useApi<{ scripts: ChartScript[] }>(
    "/api/chart-scripts",
  );
  const privacy = usePrivacy();
  // The economic calendar, as the Charts page reads it: a year back and two weeks ahead.
  const [calendarWindow] = useState(() => {
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    return `from=${hour - 366 * 86_400_000}&to=${hour + 14 * 86_400_000}`;
  });
  const { data: calendar } = useApi<CalendarState>(`/api/economic-events?${calendarWindow}`);
  const events = calendar?.enabled ? calendar.events : NO_EVENTS;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setSaved(null);
    // A workspace closed a moment ago may still be saving: read after it.
    void workspaceSaved()
      .then(() => fetch("/api/chart-workspace", { cache: "no-store" }))
      .then(async (response) => {
        const body = (await response.json()) as { state?: string | null; error?: string };
        if (!response.ok)
          throw new Error(
            body.error
              ? tr(body.error)
              : tr("Request failed ({status})", { status: response.status }),
          );
        if (!cancelled) setSaved({ state: body.state ?? null });
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setSaved({ error: cause instanceof Error ? cause.message : tr("Network error") });
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  const sources = useMemo(
    () => (connections ? workspaceSources(connections.connections) : null),
    [connections],
  );
  const linked = useMemo(() => {
    const provider = params.get("provider");
    const symbol = params.get("symbol");
    return provider && symbol ? { provider, dataset: params.get("dataset") || null, symbol } : null;
  }, [params]);

  // The workspace covers the page; the page behind it must not scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const problem =
    connectionError ??
    (saved && "error" in saved
      ? t("The saved workspace could not be read: {reason}", { reason: saved.error })
      : null);
  const ready = sources && settings && (scriptData || scriptError) && saved && "state" in saved;
  return (
    <div className="fixed inset-0 z-[60] bg-background">
      {problem ? (
        <Notice>
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        </Notice>
      ) : !ready ? (
        <Notice>
          <p className="text-sm text-muted-foreground">{t("Opening the workspace…")}</p>
        </Notice>
      ) : !sources.length ? (
        <Notice>
          <p className="text-sm">
            {t(
              "The workspace shows candles from your market data sources. Turn one on in Settings (Binance, Yahoo Finance and the other public sources need no key).",
            )}
          </p>
          <Button asChild size="sm">
            <Link href="/settings">{t("Set up market data")}</Link>
          </Button>
        </Notice>
      ) : (
        <ChartWorkspace
          key={generation}
          sources={sources}
          saved={saved.state}
          seed={
            saved.state
              ? null
              : seedCells(sources, startingMarket(sources, linked, recentSymbols.read()))
          }
          scripts={scriptData?.scripts ?? []}
          timeZone={settings.timeZone}
          onExit={() => router.push(linked ? `/charts?${params}` : "/charts")}
          onOpenInCharts={(target) => {
            const query = new URLSearchParams({ provider: target.provider, symbol: target.symbol });
            if (target.dataset) query.set("dataset", target.dataset);
            if (target.tf) query.set("tf", target.tf);
            router.push(`/charts?${query}`);
          }}
          events={events}
          privacy={privacy}
          // A record opens in a new tab: the workspace stays as it is.
          onOpenTrade={(key) => window.open(tradePath(key), "_blank", "noopener")}
          onOpenMissed={() => window.open("/missed", "_blank", "noopener")}
          onStartOver={() => {
            void fetch("/api/chart-workspace", { method: "DELETE" }).finally(() =>
              setGeneration((n) => n + 1),
            );
          }}
        />
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
      <Link
        href="/charts"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        {t("Back to Charts")}
      </Link>
    </div>
  );
}
