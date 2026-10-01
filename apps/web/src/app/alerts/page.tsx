"use client";

import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { AlertDelivery, type PushState } from "@/components/alerts/alert-delivery";
import { AlertKinds } from "@/components/alerts/alert-kinds";
import { NotificationLog } from "@/components/alerts/notification-log";
import { OpenChartAlerts } from "@/components/alerts/open-chart-alerts";
import { WatchedCharts } from "@/components/alerts/watched-charts";
import { useApi } from "@/lib/use-api";

/**
 * Alerts: where they go (browsers, webhook), which you receive (per kind, quiet hours, a
 * pause, muted channels), the charts the server watches, the open chart's own alerts, and
 * everything sent. Chart levels and zones, YouTube analyses and AI digests all go through it.
 */
export default function AlertsPage() {
  return (
    <Suspense>
      <FilterBar title="Alerts" />
      <AlertsContent />
    </Suspense>
  );
}

function AlertsContent() {
  const { data: push, refresh } = useApi<PushState>("/api/alerts/push");
  return (
    <div className="grid gap-3 p-4 xl:grid-cols-2">
      <div className="space-y-3">
        <AlertKinds hasWebhook={Boolean(push?.webhook)} devices={push?.devices.length ?? 0} />
        <WatchedCharts />
        <OpenChartAlerts />
      </div>
      <div className="space-y-3">
        <AlertDelivery push={push} refresh={refresh} />
        <NotificationLog />
      </div>
    </div>
  );
}
