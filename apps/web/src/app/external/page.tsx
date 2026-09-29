"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { dayKeyOf } from "@luxalgo/journal-core";
import type { ExternalSummary } from "@/lib/external-summary";
import { postJson, useApi } from "@/lib/use-api";
import { FilterBar } from "@/components/filter-bar";
import { SectionCard } from "@/components/section-card";
import { ExternalSummaryView } from "@/components/external-summary-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Status = "new" | "waiting" | "summarized" | "no_transcript" | "failed" | "skipped";

interface Channel {
  id: string;
  channelId: string;
  title: string;
  url: string;
  enabled: boolean;
  checkedAt: string | null;
  checkError: string | null;
}

interface Video {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  url: string;
  publishedAt: string;
  status: Status;
  detail: string;
  source: "captions" | "pasted" | "video" | null;
  lengthSeconds: number | null;
  summary: ExternalSummary | null;
  nextAttemptAt: string | null;
}

interface Settings {
  checkTime: string;
  maxAgeDays: number;
  minMinutes: number;
  language: string;
  notify: boolean;
}

interface State {
  settings: Settings;
  languages: string[];
  channels: Channel[];
  videos: Video[];
  checking: boolean;
  ai: { configured: boolean; provider: string };
}

const STATUS: Record<Status, string> = {
  new: "QUEUED",
  waiting: "WAITING",
  summarized: "SUMMARISED",
  no_transcript: "NO TRANSCRIPT",
  failed: "FAILED",
  skipped: "NOT SUMMARISED",
};

const SOURCE = {
  captions: "from its captions",
  pasted: "from your transcript",
  video: "watched by Gemini",
};

export default function ExternalPage() {
  return (
    <Suspense>
      <ExternalAnalysis />
    </Suspense>
  );
}

function ExternalAnalysis() {
  const focus = useSearchParams()?.get("video") ?? null;
  const [channelFilter, setChannelFilter] = useState("");
  const { data, error, refresh } = useApi<State>(
    `/api/external${channelFilter ? `?channel=${encodeURIComponent(channelFilter)}` : ""}`,
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const { data: settingsData } = useApi<{ timeZone: string }>("/api/settings");
  const timeZone = settingsData?.timeZone ?? "UTC";

  // While work is under way, follow it.
  const working = Boolean(data && (data.checking || data.videos.some((v) => v.status === "new")));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  const act = async (label: string, run: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setMessage(null);
    try {
      await run();
      if (done) setMessage({ text: done, error: false });
    } catch (cause) {
      setMessage({
        text: cause instanceof Error ? cause.message : "It did not work.",
        error: true,
      });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const follow = () =>
    act("follow", async () => {
      const result = await postJson<{ channel: Channel; existed: boolean }>(
        "/api/external/channels",
        { input },
      );
      setInput("");
      setMessage({
        text: result.existed
          ? `You already follow ${result.channel.title}.`
          : `Following ${result.channel.title}. Its newest video is being summarised.`,
        error: false,
      });
    });

  const saveSettings = (patch: Partial<Settings>) =>
    act("settings", () => postJson("/api/external", patch, "PUT"));

  return (
    <div>
      <FilterBar
        title="External analysis"
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!data?.channels.length || data.checking || busy !== null}
            onClick={() =>
              void act(
                "check",
                () => postJson("/api/external/check", {}),
                "Checking every channel now.",
              )
            }
          >
            <RefreshCw className={data?.checking ? "animate-spin" : undefined} />
            {data?.checking ? "Checking…" : "Check now"}
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Follow YouTube channels whose analysis you watch. Every day the journal looks for new
          videos and the AI summarises each into its main and secondary scenario, the reasons for
          each, the author&apos;s trades, and when they would go long or short with the stop loss
          and take profits. Add a summary to a{" "}
          <Link href="/journal" className="underline">
            journal day
          </Link>{" "}
          as an external opinion.
        </p>
        {data && !data.ai.configured && (
          <p role="status" className="text-sm">
            Add an AI provider key in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            to summarise videos.
          </p>
        )}
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={`text-sm ${message.error ? "text-destructive" : "text-muted-foreground"}`}
          >
            {message.text}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid gap-3 xl:grid-cols-3">
          <SectionCard
            id="external-channels"
            title="Channels"
            summary={data ? `${data.channels.length} followed` : undefined}
            contentClassName="space-y-3"
          >
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) void follow();
              }}
            >
              <input
                aria-label="YouTube channel"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="@channel, channel link or a video link"
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              />
              <Button type="submit" size="sm" disabled={!input.trim() || busy !== null}>
                <Plus />
                {busy === "follow" ? "Adding…" : "Follow"}
              </Button>
            </form>
            {data?.channels.length === 0 && (
              <p className="text-xs text-muted-foreground">No channels yet.</p>
            )}
            <ul className="divide-y rounded-md border" aria-label="Followed channels">
              {data?.channels.map((c) => (
                <li key={c.id} className="space-y-1 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {c.title}
                    </a>
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        aria-label={`Check ${c.title} daily`}
                        onChange={(e) =>
                          void act("toggle", () =>
                            postJson(
                              "/api/external/channels",
                              { id: c.id, enabled: e.target.checked },
                              "PATCH",
                            ),
                          )
                        }
                      />
                      Daily
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Stop following ${c.title}`}
                      onClick={() => {
                        if (confirm(`Stop following ${c.title}? Its summaries are removed too.`))
                          void act("remove", () =>
                            postJson("/api/external/channels", { id: c.id }, "DELETE"),
                          );
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.checkError
                      ? `Last check failed: ${c.checkError}`
                      : c.checkedAt
                        ? `Checked ${new Date(c.checkedAt).toLocaleString()}`
                        : "Not checked yet"}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            id="external-settings"
            title="Daily check"
            contentClassName="space-y-2 text-sm"
          >
            {data ? (
              <>
                <label className="flex flex-wrap items-center gap-2">
                  Check every day at
                  <input
                    type="time"
                    aria-label="Daily check time"
                    value={data.settings.checkTime}
                    onChange={(e) =>
                      e.target.value && void saveSettings({ checkTime: e.target.value })
                    }
                    className="h-8 rounded-md border bg-background px-2"
                  />
                  <span className="text-xs text-muted-foreground">({timeZone})</span>
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  Summaries in
                  <select
                    aria-label="Summary language"
                    value={data.settings.language}
                    onChange={(e) => void saveSettings({ language: e.target.value })}
                    className="h-8 rounded-md border bg-background px-2"
                  >
                    {data.languages.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  Summarise videos up to
                  <input
                    type="number"
                    min={1}
                    max={30}
                    aria-label="Maximum age in days"
                    value={data.settings.maxAgeDays}
                    onChange={(e) =>
                      Number(e.target.value) >= 1 &&
                      void saveSettings({ maxAgeDays: Number(e.target.value) })
                    }
                    className="h-8 w-16 rounded-md border bg-background px-2"
                  />
                  days old, skipping those under
                  <input
                    type="number"
                    min={0}
                    max={60}
                    aria-label="Minimum length in minutes"
                    value={data.settings.minMinutes}
                    onChange={(e) =>
                      Number(e.target.value) >= 0 &&
                      void saveSettings({ minMinutes: Number(e.target.value) })
                    }
                    className="h-8 w-16 rounded-md border bg-background px-2"
                  />
                  minutes
                </label>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={data.settings.notify}
                    onChange={(e) => void saveSettings({ notify: e.target.checked })}
                  />
                  <span>
                    Notify me when a summary is ready (the browsers and webhook set up under{" "}
                    <Link href="/charts" className="underline">
                      Charts → Alerts
                    </Link>
                    ).
                  </span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Videos are read from their captions (sent to your AI provider to summarise).
                  Automatic captions can take a few hours to appear, so a new video is tried again
                  every two hours for two days. With Google Gemini as the provider, a video without
                  captions is watched instead.
                </p>
              </>
            ) : (
              <Skeleton className="h-32" />
            )}
          </SectionCard>

          <SectionCard id="external-filter" title="Show" contentClassName="space-y-2 text-sm">
            <select
              aria-label="Channel to show"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2"
            >
              <option value="">Every channel</option>
              {data?.channels.map((c) => (
                <option key={c.channelId} value={c.channelId}>
                  {c.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {data
                ? `${data.videos.filter((v) => v.status === "summarized").length} summaries, newest first.`
                : ""}
            </p>
          </SectionCard>
        </div>

        {!data ? (
          <Skeleton className="h-64" />
        ) : data.videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.channels.length ? "No videos yet." : "Follow a channel to see its analysis here."}
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Videos">
            {data.videos.map((v, index) => (
              <VideoCard
                key={v.videoId}
                video={v}
                timeZone={timeZone}
                open={focus ? focus === v.videoId : index === 0 && v.status === "summarized"}
                focused={focus === v.videoId}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VideoCard({
  video,
  timeZone,
  open: initiallyOpen,
  focused,
  onChanged,
}: {
  video: Video;
  timeZone: string;
  open: boolean;
  focused: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [day, setDay] = useState(() => dayKeyOf(video.publishedAt, timeZone));
  const [pasting, setPasting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "start" });
  }, [focused]);

  const post = async (
    body: Record<string, unknown>,
    done?: (r: { added?: boolean; reason?: string }) => string,
  ) => {
    setBusy(true);
    setNote(null);
    try {
      const result = await postJson<{ added?: boolean; reason?: string }>(
        `/api/external/videos/${video.videoId}`,
        body,
      );
      if (done) setNote({ text: done(result), error: false });
    } catch (cause) {
      setNote({ text: cause instanceof Error ? cause.message : "It did not work.", error: true });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const minutes = video.lengthSeconds ? Math.round(video.lengthSeconds / 60) : null;
  return (
    <li ref={ref} id={`video-${video.videoId}`}>
      <Card className={focused ? "ring-1 ring-primary" : undefined}>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <a
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium hover:underline"
              >
                {video.title}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
              <p className="text-xs text-muted-foreground">
                {video.channelTitle} ·{" "}
                {new Date(video.publishedAt).toLocaleString(undefined, { timeZone })}
                {minutes ? ` · ${minutes} min` : ""}
                {video.source ? ` · ${SOURCE[video.source]}` : ""}
              </p>
            </div>
            <Badge variant={video.status === "summarized" ? "secondary" : "outline"}>
              {STATUS[video.status]}
            </Badge>
          </div>
          {video.status !== "summarized" && video.detail && (
            <p className="text-xs text-muted-foreground">
              {video.detail}
              {video.status === "waiting" && video.nextAttemptAt
                ? ` Next try ${new Date(video.nextAttemptAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.`
                : ""}
            </p>
          )}
          {video.status === "new" && (
            <p className="text-xs text-muted-foreground">Being summarised…</p>
          )}
          {video.summary && open && <ExternalSummaryView summary={video.summary} />}
          <div className="flex flex-wrap items-center gap-2">
            {video.summary && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? "Hide summary" : "Show summary"}
              </Button>
            )}
            {video.summary && (
              <span className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Journal day"
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void post({ action: "add-to-day", date: day }, (r) =>
                      r.added ? `Added to ${day}.` : (r.reason ?? "Not added."),
                    )
                  }
                >
                  Add to journal day
                </Button>
                <Link href={`/journal/${day}`} className="text-xs underline">
                  Open day
                </Link>
              </span>
            )}
            {video.status !== "new" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void post({ action: "summarize" })}
              >
                <Sparkles />
                {video.summary ? "Summarise again" : "Summarise now"}
              </Button>
            )}
            {video.status !== "new" && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPasting((v) => !v)}>
                Paste transcript
              </Button>
            )}
          </div>
          {pasting && (
            <div className="space-y-2">
              <textarea
                aria-label="Transcript"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                placeholder="Paste the video's transcript (YouTube: … → Show transcript)."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || transcript.trim().length < 200}
                onClick={() => {
                  setPasting(false);
                  void post({ action: "transcript", text: transcript });
                }}
              >
                Summarise this transcript
              </Button>
            </div>
          )}
          {note && (
            <p
              role={note.error ? "alert" : "status"}
              className={`text-xs ${note.error ? "text-destructive" : "text-muted-foreground"}`}
            >
              {note.text}
            </p>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
