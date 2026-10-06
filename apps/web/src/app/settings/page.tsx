"use client";

import { Suspense, useEffect, useState } from "react";
import { JournalDefaultSettings } from "@/components/journal-default-settings";
import { MarketDataSettings } from "@/components/market-data-settings";
import { AiSettings } from "@/components/ai-settings";
import { LanguageSettings } from "@/components/language-settings";
import { Download } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeZonePicker } from "@/components/timezone-picker";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/i18n";
import { postJson, useApi } from "@/lib/use-api";
import { formatMultipliers, parseMultipliers, sameMultipliers } from "@/lib/multipliers";

interface SettingsPayload {
  timeZone: string;
  importTimeZone: string;
  multipliers: Record<string, number>;
}

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { t, tn } = useI18n();
  const { data, refresh } = useApi<SettingsPayload>("/api/settings");
  const [timeZone, setTimeZone] = useState("");
  const [importTimeZone, setImportTimeZone] = useState("");
  const [multipliers, setMultipliers] = useState("");
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState("");
  const [invalidMultipliers, setInvalidMultipliers] = useState(false);

  useEffect(() => {
    if (data) {
      setTimeZone(data.timeZone);
      setImportTimeZone(data.importTimeZone);
      setMultipliers(formatMultipliers(data.multipliers));
    }
  }, [data]);

  const save = async () => {
    const parsed = parseMultipliers(multipliers);
    if (parsed.invalid.length) {
      // Never drop a line silently: saving would remove that multiplier and rebuild P&L.
      setFailure(
        tn(
          parsed.invalid.length,
          "Fix this multiplier line before saving (use SYMBOL=number, for example ES=50): {lines}",
          "Fix these multiplier lines before saving (use SYMBOL=number, for example ES=50): {lines}",
          { lines: parsed.invalid.join(", ") },
        ),
      );
      setInvalidMultipliers(true);
      return;
    }
    setInvalidMultipliers(false);
    // Only a changed map is sent: saving multipliers recalculates every trade.
    const changed = !data || !sameMultipliers(parsed.multipliers, data.multipliers);
    try {
      await postJson(
        "/api/settings",
        {
          timeZone,
          importTimeZone,
          ...(changed ? { multipliers: parsed.multipliers } : {}),
        },
        "PATCH",
      );
      setFailure("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : t("Save failed"));
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    refresh();
  };

  return (
    <div>
      <FilterBar title="Settings" />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <LanguageSettings />
        <JournalDefaultSettings />
        <MarketDataSettings />
        <Card>
          <CardHeader>
            <CardTitle>{t("Journal")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label
                htmlFor="display-timezone"
                className="mb-1 block text-xs text-muted-foreground"
              >
                {t("Display timezone (IANA)")}
              </Label>
              <TimeZonePicker
                id="display-timezone"
                label={t("Display timezone")}
                value={timeZone}
                onValueChange={setTimeZone}
                disabled={!data}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Trade times, calendars, journal days, and analytics use this timezone.")}
              </p>
              <button
                className="mt-1 text-xs text-muted-foreground underline"
                onClick={() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
              >
                {t("Use this device's timezone ({zone})", {
                  zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })}
              </button>
            </div>
            <div>
              <Label htmlFor="import-timezone" className="mb-1 block text-xs text-muted-foreground">
                {t("Default import timezone (IANA)")}
              </Label>
              <TimeZonePicker
                id="import-timezone"
                label={t("Default import timezone")}
                value={importTimeZone}
                onValueChange={setImportTimeZone}
                disabled={!data}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Use your broker statement's timezone for timestamps without an offset. You can override it for each file. Changing this setting affects future imports only.",
                )}
              </p>
            </div>
            <div>
              <Label
                htmlFor="contract-multipliers"
                className="mb-1 block text-xs text-muted-foreground"
              >
                {t("Contract multipliers (futures/options), one per line as SYMBOL=multiplier")}
              </Label>
              <textarea
                id="contract-multipliers"
                aria-invalid={invalidMultipliers || undefined}
                value={multipliers}
                onChange={(event) => setMultipliers(event.target.value)}
                placeholder={"ES=50\nNQ=20\nMES=5"}
                className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Saving multipliers recalculates existing trade P&L from fills and preserves annotations.",
              )}
            </p>
            {failure && (
              <p role="alert" className="text-xs text-destructive">
                {failure}
              </p>
            )}
            <Button onClick={save} disabled={!data}>
              {saved ? t("Saved ✓") : t("Save")}
            </Button>
          </CardContent>
        </Card>

        <AiSettings />

        <Card>
          <CardHeader>
            <CardTitle>{t("Your data")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/api/export" download="trade-journal-export.json">
                <Download />
                {t("Full backup (JSON)")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/api/export?format=csv" download>
                <Download />
                {t("Trades (CSV)")}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
