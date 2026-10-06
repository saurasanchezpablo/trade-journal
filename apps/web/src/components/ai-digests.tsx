"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, Send } from "lucide-react";
import { postJson, useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { SectionCard } from "./section-card";
import { useI18n } from "./i18n";

interface DigestSettings {
  recap: { enabled: boolean; time: string; weekdays: number[] };
  weekly: { enabled: boolean; weekday: number; time: string };
  summaryInNotification: boolean;
}

interface Digest {
  id: string;
  kind: "day" | "week";
  period: string;
  status: "running" | "sent" | "skipped" | "failed";
  conversationId: string | null;
  title: string;
  detail: string;
  delivered: number;
  updatedAt: string;
}

interface DigestState {
  settings: DigestSettings;
  digests: Digest[];
  delivery: { browsers: number; webhook: boolean };
  aiConfigured: boolean;
}

/** Weekday names from Sunday (index 0), in a language: 2023-01-01 was a Sunday. */
const weekdayNames = (locale: string, weekday: "short" | "long") =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2023, 0, 1 + i)).toLocaleDateString(locale, { weekday, timeZone: "UTC" }),
  );
const STATUS: Record<Digest["status"], string> = {
  running: "Writing",
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
};

const chatUrl = (d: Digest) =>
  !d.conversationId
    ? null
    : d.kind === "day"
      ? `/journal/${d.period}?chat=${encodeURIComponent(d.conversationId)}`
      : `/reports?chat=${encodeURIComponent(d.conversationId)}`;

/**
 * Scheduled AI digests: a session recap after the close and a weekly review, written by the
 * AI chat (so you can open them and ask follow-ups) and sent to the browsers and webhook set
 * up for background alerts.
 */
export function AiDigests({ timeZone }: { timeZone: string }) {
  const { t, tx, intl } = useI18n();
  const WEEKDAYS = weekdayNames(intl, "short");
  const WEEKDAY_NAMES = weekdayNames(intl, "long");
  // A sentence with a link in it: the translation keeps "{link}" where the link goes.
  const withLink = (text: string, link: React.ReactNode, vars?: Record<string, number>) => {
    const [before, after] = t(text, vars).split("{link}");
    return (
      <>
        {before}
        {link}
        {after}
      </>
    );
  };
  const { data, refresh } = useApi<DigestState>("/api/ai/digests");
  const [saved, setSaved] = useState<DigestState | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState<"day" | "week" | null>(null);
  const current = saved ?? data;
  const settings = current?.settings;

  const save = async (next: DigestSettings) => {
    setError("");
    setSaved(current ? { ...current, settings: next } : null);
    try {
      setSaved(await postJson<DigestState>("/api/ai/digests", next, "PUT"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save."));
      setSaved(null);
      refresh();
    }
  };
  const sendNow = async (kind: "day" | "week") => {
    setSending(kind);
    setError("");
    try {
      await postJson("/api/ai/digests/run", { kind });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not send it."));
    } finally {
      setSending(null);
      setSaved(null);
      refresh();
    }
  };

  const delivery = current?.delivery;
  const nowhere = delivery && !delivery.browsers && !delivery.webhook;
  const summary = settings
    ? [
        settings.recap.enabled ? t("recap at {time}", { time: settings.recap.time }) : "",
        settings.weekly.enabled
          ? t("weekly on {day} {time}", {
              day: WEEKDAYS[settings.weekly.weekday] ?? "",
              time: settings.weekly.time,
            })
          : "",
      ]
        .filter(Boolean)
        .join(", ") || tx("digest", "off")
    : undefined;

  return (
    <SectionCard
      id="journal-ai-digests"
      title={t("Scheduled digests")}
      summary={summary}
      contentClassName="space-y-3 text-sm"
    >
      <p className="text-xs text-muted-foreground">
        {t(
          "The AI writes a session recap and a weekly review on schedule, in {timeZone}, and sends them to your devices. Each is saved as a chat you can open and ask follow-ups in. Days with no closed trades or note are skipped.",
          { timeZone },
        )}
      </p>
      {current && !current.aiConfigured && (
        <p role="status" className="text-xs">
          {withLink(
            "Add an AI provider key in {link} first.",
            <Link href="/settings" className="underline">
              {t("Settings")}
            </Link>,
          )}
        </p>
      )}
      {settings && (
        <div className="space-y-3">
          <fieldset className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.recap.enabled}
                onChange={(e) =>
                  void save({
                    ...settings,
                    recap: { ...settings.recap, enabled: e.target.checked },
                  })
                }
              />
              {t("Session recap at")}
            </label>
            <input
              type="time"
              aria-label={t("Recap time")}
              value={settings.recap.time}
              onChange={(e) =>
                e.target.value &&
                void save({ ...settings, recap: { ...settings.recap, time: e.target.value } })
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
            />
            <span className="text-muted-foreground">{tx("digest", "on")}</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t("Recap weekdays")}>
              {WEEKDAYS.map((name, day) => {
                const on = settings.recap.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      void save({
                        ...settings,
                        recap: {
                          ...settings.recap,
                          weekdays: on
                            ? settings.recap.weekdays.filter((d) => d !== day)
                            : [...settings.recap.weekdays, day].sort(),
                        },
                      })
                    }
                    className={`h-7 rounded-md border px-2 text-xs ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.weekly.enabled}
                onChange={(e) =>
                  void save({
                    ...settings,
                    weekly: { ...settings.weekly, enabled: e.target.checked },
                  })
                }
              />
              {t("Weekly review on")}
            </label>
            <select
              aria-label={t("Weekly review day")}
              value={settings.weekly.weekday}
              onChange={(e) =>
                void save({
                  ...settings,
                  weekly: { ...settings.weekly, weekday: Number(e.target.value) },
                })
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {WEEKDAY_NAMES.map((name, day) => (
                <option key={day} value={day}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">{tx("digest", "at")}</span>
            <input
              type="time"
              aria-label={t("Weekly review time")}
              value={settings.weekly.time}
              onChange={(e) =>
                e.target.value &&
                void save({ ...settings, weekly: { ...settings.weekly, time: e.target.value } })
              }
              className="h-8 rounded-md border bg-background px-2 text-sm"
            />
          </fieldset>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.summaryInNotification}
              onChange={(e) => void save({ ...settings, summaryInNotification: e.target.checked })}
            />
            <span>
              {t(
                "Put the start of the review in the notification. It can include amounts, which then show on lock screens and in webhook messages (an ntfy.sh topic can be read by anyone who knows its name).",
              )}
            </span>
          </label>
        </div>
      )}
      {delivery && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {nowhere ? (
            <span>
              {withLink(
                "No browser or webhook receives notifications yet: turn them on under {link}. Digests are still written and listed here.",
                <Link href="/alerts" className="underline">
                  {t("Alerts")}
                </Link>,
              )}
            </span>
          ) : (
            <span>
              {withLink(
                delivery.webhook
                  ? delivery.browsers === 1
                    ? "Sent to {count} browser and the webhook set up under {link}, where AI digests can also be held back or sent to one of them only."
                    : "Sent to {count} browsers and the webhook set up under {link}, where AI digests can also be held back or sent to one of them only."
                  : delivery.browsers === 1
                    ? "Sent to {count} browser set up under {link}, where AI digests can also be held back or sent to one of them only."
                    : "Sent to {count} browsers set up under {link}, where AI digests can also be held back or sent to one of them only.",
                <Link href="/alerts" className="underline">
                  {t("Alerts")}
                </Link>,
                { count: delivery.browsers },
              )}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(["day", "week"] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant="outline"
            disabled={sending !== null || !current?.aiConfigured}
            onClick={() => void sendNow(kind)}
          >
            <Send />
            {sending === kind
              ? t("Writing…")
              : kind === "day"
                ? t("Send today's recap now")
                : t("Send this week's review now")}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {current && current.digests.length > 0 && (
        <ul className="divide-y rounded-md border" aria-label={t("Recent digests")}>
          {current.digests.map((d) => {
            const url = chatUrl(d);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {d.title ||
                      (d.kind === "day"
                        ? t("Session recap · {period}", { period: d.period })
                        : t("Weekly review · {period}", { period: d.period }))}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {tx("digest", STATUS[d.status])}
                    {d.detail ? `: ${t(d.detail)}` : ""}
                  </span>
                </span>
                {url && (
                  <Link href={url} className="text-xs underline">
                    {t("Open")}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
