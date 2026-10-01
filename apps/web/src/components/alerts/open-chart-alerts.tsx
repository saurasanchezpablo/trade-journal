"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { openChartAlerts, type OpenChartAlerts as Choices } from "@/lib/alert-preferences";

const KINDS: { key: "lines" | "zones" | "indicators"; label: string }[] = [
  { key: "lines", label: "Price crosses a horizontal line, ray or trend line" },
  { key: "zones", label: "Price enters or breaks a support or resistance zone" },
  { key: "indicators", label: "An indicator calls alert()" },
];

/**
 * Alerts the Charts page raises while it is open and live, in this browser: shown on the
 * page and as a browser notification when allowed. Remembered per browser.
 */
export function OpenChartAlerts() {
  const [choices, setChoices] = useState<Choices>(() => openChartAlerts.read());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    setChoices(openChartAlerts.read());
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  const change = (patch: Partial<Choices>) => {
    const next = { ...choices, ...patch };
    setChoices(next);
    openChartAlerts.write(next);
  };
  return (
    <SectionCard
      id="alerts-open-chart"
      title="While a chart is open"
      summary={choices.on ? "On in this browser" : "Off in this browser"}
      contentClassName="space-y-3"
    >
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={choices.on}
          onCheckedChange={(checked) => change({ on: checked === true })}
        />
        <span>
          Alert me on the Charts page while it is open and live
          <span className="block text-xs text-muted-foreground">
            In this browser only (also the On/Off switch of the chart&apos;s Alerts card). Indicator
            alerts only run here, never in the background.
          </span>
        </span>
      </label>
      <fieldset className="space-y-1.5 pl-6" disabled={!choices.on}>
        {KINDS.map((kind) => (
          <label key={kind.key} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={choices[kind.key]}
              disabled={!choices.on}
              onCheckedChange={(checked) => change({ [kind.key]: checked === true })}
            />
            {kind.label}
          </label>
        ))}
      </fieldset>
      {permission === "default" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          The page can also show them as browser notifications.
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void Notification.requestPermission().then((answer) => setPermission(answer))
            }
          >
            Allow notifications
          </Button>
        </div>
      )}
      {permission === "denied" && (
        <p className="text-xs text-muted-foreground">
          Browser notifications are blocked for this site, so these show on the page only.
        </p>
      )}
    </SectionCard>
  );
}
