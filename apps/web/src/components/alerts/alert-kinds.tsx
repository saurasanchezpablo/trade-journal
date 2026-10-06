"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Moon, Pause, Play } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ALERT_KINDS,
  ALERT_KIND_LABELS,
  inQuietHours,
  type AlertKind,
  type AlertPreferences,
  type AlertRoute,
} from "@/lib/alert-preferences";
import { postJson, useApi } from "@/lib/use-api";
import { useI18n, useT } from "@/components/i18n";

interface Channel {
  channelId: string;
  title: string;
}

const PAUSES = [1, 4, 24];

/**
 * What you receive and where: each kind of alert on or off for the browsers and for the
 * webhook, YouTube channels muted one by one, quiet hours and a pause. Saved on the server,
 * which applies them to every notification.
 */
export function AlertKinds({ hasWebhook, devices }: { hasWebhook: boolean; devices: number }) {
  const { t, tn, tx, intl } = useI18n();
  const {
    data,
    error: loadError,
    refresh,
  } = useApi<{ preferences: AlertPreferences }>("/api/alerts/preferences");
  const { data: settings } = useApi<{ timeZone: string }>("/api/settings");
  const { data: external } = useApi<{ channels: Channel[] }>("/api/external");
  const [prefs, setPrefs] = useState<AlertPreferences | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (data) setPrefs(data.preferences);
  }, [data]);
  // The pause and quiet hours read the clock: keep their status current.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const timeZone = settings?.timeZone ?? "UTC";

  /** Saves go one after another, each a patch of what changed; the newest answer wins. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const sent = useRef(0);
  /** Shows the change at once; puts the saved value back if the server refuses it. */
  const save = (patch: Partial<AlertPreferences>) => {
    setPrefs((current) =>
      current
        ? { ...current, ...patch, kinds: { ...current.kinds, ...(patch.kinds ?? {}) } }
        : current,
    );
    setError("");
    const seq = ++sent.current;
    queue.current = queue.current
      .then(() =>
        postJson<{ preferences: AlertPreferences }>("/api/alerts/preferences", patch, "PUT"),
      )
      .then((result) => {
        if (seq === sent.current) setPrefs(result.preferences);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : t("Could not save."));
        refresh();
      });
  };
  // Only the kind that changed, merged on the server: two quick clicks never undo each other.
  const setRoute = (kind: AlertKind, change: Partial<AlertRoute>) =>
    prefs &&
    save({
      kinds: { [kind]: { ...prefs.kinds[kind], ...change } } as AlertPreferences["kinds"],
    });

  if (!prefs)
    return (
      <SectionCard id="alerts-kinds" title={t("What you receive")}>
        <p className="text-sm text-muted-foreground">{loadError ?? t("Loading…")}</p>
      </SectionCard>
    );

  const paused = prefs.pausedUntil && Date.parse(prefs.pausedUntil) > now;
  const quietNow = inQuietHours(prefs.quiet, now, timeZone);
  const channels = external?.channels ?? [];
  const on = ALERT_KINDS.filter((k) => prefs.kinds[k].push || prefs.kinds[k].webhook).length;
  return (
    <SectionCard
      id="alerts-kinds"
      title={t("What you receive")}
      summary={
        paused
          ? tx("alerts", "Paused")
          : t("{on} of {total} kinds on", { on, total: ALERT_KINDS.length })
      }
      contentClassName="space-y-4"
    >
      {paused ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
        >
          <Pause className="size-4" aria-hidden="true" />
          <span className="mr-auto">
            {t("Paused until {time}: nothing is sent (alerts are still logged).", {
              time: new Date(prefs.pausedUntil!).toLocaleString(intl, {
                timeZone,
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => save({ pausedUntil: null })}
          >
            <Play /> {t("Resume")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("Pause everything for")}</span>
          {PAUSES.map((hours) => (
            <Button
              key={hours}
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                save({ pausedUntil: new Date(Date.now() + hours * 3_600_000).toISOString() })
              }
            >
              {tn(hours, "{count} hour", "{count} hours")}
            </Button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-normal">{t("Alert")}</th>
              <th className="w-24 px-2 py-1.5 text-center font-normal">
                {t("Browsers")}
                <span className="block text-[11px]">
                  {devices ? t("{count} on", { count: devices }) : t("none yet")}
                </span>
              </th>
              <th className="w-24 px-2 py-1.5 text-center font-normal">
                {t("Webhook")}
                <span className="block text-[11px]">
                  {hasWebhook ? t("set up") : t("none yet")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ALERT_KINDS.map((kind) => {
              const label = ALERT_KIND_LABELS[kind];
              return (
                <tr key={kind} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{t(label.title)}</span>
                    <span className="block text-xs text-muted-foreground">{t(label.detail)}</span>
                    {kind === "external" && channels.length > 0 && (
                      <ChannelMutes
                        channels={channels}
                        muted={prefs.muted}
                        disabled={!prefs.kinds.external.push && !prefs.kinds.external.webhook}
                        onChange={(muted) => save({ muted })}
                      />
                    )}
                    {kind === "digest" && (
                      <span className="block text-xs text-muted-foreground">
                        {t("When they are written:")}{" "}
                        <Link href="/journal" className="underline">
                          {t("Daily journal → Scheduled digests")}
                        </Link>
                        .
                      </span>
                    )}
                  </td>
                  {(["push", "webhook"] as const).map((target) => (
                    <td key={target} className="px-2 py-2 text-center">
                      <Checkbox
                        aria-label={`${t(label.title)}: ${target === "push" ? t("browsers") : t("webhook")}`}
                        checked={prefs.kinds[kind][target]}
                        onCheckedChange={(checked) =>
                          setRoute(kind, { [target]: checked === true })
                        }
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={prefs.quiet.enabled}
            onCheckedChange={(checked) =>
              save({ quiet: { ...prefs.quiet, enabled: checked === true } })
            }
          />
          <Moon className="size-4" aria-hidden="true" /> {t("Quiet hours")}
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("Hold every alert from")}</span>
          <TimeField
            label={t("Quiet hours start")}
            value={prefs.quiet.from}
            onChange={(from) => save({ quiet: { ...prefs.quiet, from } })}
          />
          <span className="text-muted-foreground">{tx("time range", "to")}</span>
          <TimeField
            label={t("Quiet hours end")}
            value={prefs.quiet.to}
            onChange={(to) => save({ quiet: { ...prefs.quiet, to } })}
          />
          <span className="text-xs text-muted-foreground">({timeZone})</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {prefs.quiet.enabled
            ? quietNow
              ? t("Quiet hours now: alerts are logged but not sent.")
              : t("Alerts held in quiet hours are logged, not sent later.")
            : t("Off: alerts go out at any hour.")}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </SectionCard>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      type="time"
      aria-label={label}
      className="h-8 w-28"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => /^\d\d:\d\d$/.test(draft) && draft !== value && onChange(draft)}
    />
  );
}

function ChannelMutes({
  channels,
  muted,
  disabled,
  onChange,
}: {
  channels: Channel[];
  muted: string[];
  disabled: boolean;
  onChange: (muted: string[]) => void;
}) {
  const t = useT();
  return (
    <fieldset className="mt-2 space-y-1" disabled={disabled}>
      <legend className="text-xs text-muted-foreground">{t("Channels")}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {channels.map((channel) => {
          const key = `external:${channel.channelId}`;
          const on = !muted.includes(key);
          return (
            <label key={channel.channelId} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={on}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(checked === true ? muted.filter((m) => m !== key) : [...muted, key])
                }
              />
              {channel.title}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
