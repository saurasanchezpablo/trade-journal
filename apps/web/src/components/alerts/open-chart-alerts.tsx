"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { openChartAlerts, type OpenChartAlerts as Choices } from "@/lib/alert-preferences";
import { useT } from "@/components/i18n";

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
  const t = useT();
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
      title={t("While a chart is open")}
      summary={choices.on ? t("On in this browser") : t("Off in this browser")}
      contentClassName="space-y-3"
    >
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={choices.on}
          onCheckedChange={(checked) => change({ on: checked === true })}
        />
        <span>
          {t("Alert me on the Charts page while it is open and live")}
          <span className="block text-xs text-muted-foreground">
            {t(
              "In this browser only (also the On/Off switch of the chart's Alerts card). Indicator alerts only run here, never in the background.",
            )}
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
            {t(kind.label)}
          </label>
        ))}
      </fieldset>
      {permission === "default" && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {t("The page can also show them as browser notifications.")}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void Notification.requestPermission().then((answer) => setPermission(answer))
            }
          >
            {t("Allow notifications")}
          </Button>
        </div>
      )}
      {permission === "denied" && (
        <p className="text-xs text-muted-foreground">
          {t("Browser notifications are blocked for this site, so these show on the page only.")}
        </p>
      )}
    </SectionCard>
  );
}
