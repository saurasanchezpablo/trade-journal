"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n";

interface Pending {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  sends: number;
}

const POLL_MS = 10_000;
const BEEP_EVERY_MS = 2_500;

/**
 * Urgent alerts on every open journal page: a banner over the page with a repeating alarm
 * sound, a vibration on phones and a flashing tab title, until each alert is acknowledged
 * (here, from the notification, or on the Alerts page). Opening a notification's link
 * (`?ack=<id>`) acknowledges it. Browsers only play sound after you have interacted with the
 * page once; until then the banner offers to switch the sound on.
 */
export function UrgentAlarm() {
  const { t, intl } = useI18n();
  const [pending, setPending] = useState<Pending[]>([]);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/alerts/urgent", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { pending?: Pending[] };
      setPending(body.pending ?? []);
    } catch {
      // Offline or signed out: try again on the next poll.
    }
  }, []);

  const acknowledge = useCallback(
    async (id: string | null) => {
      setPending((list) => (id ? list.filter((p) => p.id !== id) : []));
      try {
        await fetch("/api/alerts/urgent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(id ? { action: "ack", id } : { action: "ack-all" }),
        });
      } finally {
        void load();
      }
    },
    [load],
  );

  // A notification's link acknowledges its alert, then the parameter leaves the address.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("ack");
    if (id && /^[A-Za-z0-9_-]{1,40}$/.test(id)) {
      url.searchParams.delete("ack");
      window.history.replaceState(window.history.state, "", url.toString());
      void acknowledge(id);
    } else void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [acknowledge, load]);

  const active = pending.length > 0;
  const newest = useRef<string>("");
  newest.current = pending[0]?.title ?? "";

  // The alarm: a two-tone beep every few seconds, a vibration, and a flashing tab title.
  useEffect(() => {
    if (!active) return;
    const title = document.title;
    let flip = false;
    const flash = setInterval(() => {
      flip = !flip;
      document.title = flip ? `(!) ${newest.current || title}` : title;
    }, 1_000);
    const beep = () => {
      if (muted) return;
      // Browsers refuse vibration before the page was touched once.
      if (navigator.userActivation?.hasBeenActive)
        try {
          navigator.vibrate?.([400, 150, 400]);
        } catch {
          // No vibration here.
        }
      try {
        const ctx = (audio.current ??= new AudioContext());
        if (ctx.state === "suspended") {
          void ctx.resume().catch(() => {});
          setSoundBlocked(ctx.state === "suspended");
          if (ctx.state === "suspended") return;
        }
        setSoundBlocked(false);
        const gain = ctx.createGain();
        gain.gain.value = 0.18;
        gain.connect(ctx.destination);
        [880, 660, 880].forEach((frequency, i) => {
          const tone = ctx.createOscillator();
          tone.type = "square";
          tone.frequency.value = frequency;
          tone.connect(gain);
          tone.start(ctx.currentTime + i * 0.22);
          tone.stop(ctx.currentTime + i * 0.22 + 0.18);
        });
      } catch {
        setSoundBlocked(true);
      }
    };
    beep();
    const ring = setInterval(beep, BEEP_EVERY_MS);
    return () => {
      clearInterval(flash);
      clearInterval(ring);
      document.title = title;
    };
  }, [active, muted]);

  // The first click or key press anywhere lets the browser play the alarm.
  useEffect(() => {
    if (!soundBlocked) return;
    const unlock = () => {
      void audio.current?.resume().then(() => setSoundBlocked(false));
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundBlocked]);

  if (!active) return null;
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={t("Urgent alerts")}
      className="fixed inset-x-0 top-0 z-[100] flex justify-center p-2 sm:p-4"
    >
      <div className="w-full max-w-xl space-y-3 rounded-lg border-2 border-destructive bg-background p-4 shadow-2xl">
        <div className="flex items-center gap-2">
          <BellRing className="size-5 animate-pulse text-destructive" aria-hidden="true" />
          <span className="mr-auto font-semibold">
            {t("Urgent alerts")} ({pending.length})
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? t("Sound on") : t("Sound off on this page")}
          >
            {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </Button>
        </div>
        {soundBlocked && !muted && (
          <p className="text-xs text-muted-foreground">
            {t("Click anywhere on the page to let the alarm sound.")}
          </p>
        )}
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {pending.slice(0, 5).map((p) => (
            <li key={p.id} className="rounded-md border p-2">
              <div className="text-sm font-medium">{p.title}</div>
              {p.body && <div className="text-xs text-muted-foreground">{p.body}</div>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="mr-auto text-[11px] text-muted-foreground">
                  {new Date(p.createdAt).toLocaleTimeString(intl, { timeStyle: "short" })}
                  {p.sends > 1 && ` · ${t("sent {n} times", { n: p.sends })}`}
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link href={p.url} onClick={() => void acknowledge(p.id)}>
                    {t("Open")}
                  </Link>
                </Button>
                <Button type="button" size="sm" onClick={() => void acknowledge(p.id)}>
                  {t("Acknowledge")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {pending.length > 1 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={() => void acknowledge(null)}
          >
            {t("Acknowledge all")}
          </Button>
        )}
      </div>
    </div>
  );
}
