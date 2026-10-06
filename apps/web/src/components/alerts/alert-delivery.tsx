"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Send, Smartphone, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson } from "@/lib/use-api";
import { useI18n } from "@/components/i18n";

export interface PushState {
  publicKey: string;
  devices: { endpoint: string; label: string; createdAt: string; lastSuccessAt: string | null }[];
  webhook: string | null;
  running: boolean;
}

/** VAPID public keys are base64url; PushManager wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const deviceLabel = () => {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Mac/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "browser";
  return `${os} ${browser}`;
};

/**
 * Where alerts go: Web Push to the browsers (and installed apps) you turn on, and one
 * optional webhook such as an ntfy topic. Every alert the server sends uses these.
 */
export function AlertDelivery({ push, refresh }: { push: PushState | null; refresh: () => void }) {
  const { t, tn, intl } = useI18n();
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [webhook, setWebhook] = useState<string | null>(null);

  const readSubscription = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
      setSupported(false);
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    setEndpoint(subscription?.endpoint ?? null);
  }, []);
  useEffect(() => void readSubscription(), [readSubscription]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("Something went wrong."));
    } finally {
      setBusy(false);
    }
  };

  const enableDevice = () =>
    run(async () => {
      if (!push) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          t("Notifications are blocked for this site. Allow them in the browser settings."),
        );
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(push.publicKey) as BufferSource,
      });
      await postJson("/api/alerts/push", {
        subscription: subscription.toJSON(),
        label: deviceLabel(),
      });
      setEndpoint(subscription.endpoint);
      refresh();
    });

  const removeDevice = (target: string) =>
    run(async () => {
      if (target === endpoint) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        await (await registration?.pushManager.getSubscription())?.unsubscribe();
        setEndpoint(null);
      }
      await postJson("/api/alerts/push", { endpoint: target }, "DELETE");
      refresh();
    });

  const test = () =>
    run(async () => {
      const result = await postJson<{ delivered: number }>("/api/alerts/test", {});
      setMessage(
        result.delivered
          ? tn(result.delivered, "Sent to {count} destination.", "Sent to {count} destinations.")
          : t("Nothing received it. Turn on notifications in a browser or add a webhook first."),
      );
      refresh();
    });

  const saveWebhook = () =>
    run(async () => {
      await postJson("/api/alerts/webhook", { url: webhook ?? "" }, "PUT");
      setWebhook(null);
      refresh();
    });

  const thisDevice = endpoint && push?.devices.some((d) => d.endpoint === endpoint);
  const count = (push?.devices.length ?? 0) + (push?.webhook ? 1 : 0);
  return (
    <SectionCard
      id="alerts-delivery"
      title={t("Where alerts go")}
      summary={count ? tn(count, "{count} destination", "{count} destinations") : t("None yet")}
      contentClassName="space-y-4"
    >
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Browsers and installed apps")}</p>
        {!supported ? (
          <p className="text-xs text-muted-foreground">
            {t(
              "This browser can't receive push notifications here. Use Chrome, Edge, Firefox or Safari with the journal on https (or localhost).",
            )}
          </p>
        ) : thisDevice ? (
          <p className="flex items-center gap-1.5 text-xs">
            <Smartphone className="size-3.5" aria-hidden="true" />{" "}
            {t("This browser receives alerts.")}
          </p>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !push}
            onClick={() => void enableDevice()}
          >
            <BellRing /> {t("Notify this browser")}
          </Button>
        )}
        {push && push.devices.length > 0 ? (
          <ul className="divide-y rounded-md border text-xs">
            {push.devices.map((device) => (
              <li
                key={device.endpoint}
                className="flex items-center justify-between gap-2 px-2 py-1.5"
              >
                <span className="min-w-0 truncate">
                  {device.label || t("Device")}
                  {device.endpoint === endpoint ? ` ${t("(this one)")}` : ""}
                  <span className="text-muted-foreground">
                    {device.lastSuccessAt
                      ? ` · ${t("last alert {date}", { date: new Date(device.lastSuccessAt).toLocaleDateString(intl) })}`
                      : ` · ${t("no alert yet")}`}
                  </span>
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={t("Stop notifying {device}", {
                    device: device.label || t("this device"),
                  })}
                  disabled={busy}
                  onClick={() => void removeDevice(device.endpoint)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          push && (
            <p className="text-xs text-muted-foreground">{t("No browser receives alerts yet.")}</p>
          )
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="alerts-webhook" className="text-sm font-medium">
          Webhook
        </label>
        <p className="text-xs text-muted-foreground">
          {t(
            "A URL that receives every alert as a text POST, such as an {ntfy} topic for your phone.",
          )
            .split("{ntfy}")
            .flatMap((part, i) =>
              i === 0
                ? [part]
                : [
                    <a
                      key="ntfy"
                      href="https://ntfy.sh"
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      ntfy
                    </a>,
                    part,
                  ],
            )}
        </p>
        <div className="flex gap-2">
          <Input
            id="alerts-webhook"
            value={webhook ?? push?.webhook ?? ""}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://ntfy.sh/your-topic"
            className="h-8 text-xs"
          />
          {webhook !== null && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void saveWebhook()}
            >
              {webhook.trim() ? t("Save") : t("Remove")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void test()}
        >
          <Send /> {t("Send a test")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("A test reaches every destination, even in quiet hours.")}
        </span>
      </div>
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {push && !push.running && (
        <p className="text-xs text-destructive">
          {t(
            "The background watcher is not running on the server (JOURNAL_BACKGROUND_ALERTS=off), so charts are not watched while no page is open.",
          )}
        </p>
      )}
    </SectionCard>
  );
}
