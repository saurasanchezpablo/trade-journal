"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { dayKeyOf } from "@luxalgo/journal-core";
import type { ExternalSummary } from "@/lib/external-summary";
import { postJson, useApi } from "@/lib/use-api";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
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

type Translate = (text: string, vars?: Record<string, string | number>) => string;

/** A translated sentence with a link where its `{link}` is. */
function Linked({ text, link }: { text: string; link: ReactNode }) {
  const [before = "", after = ""] = text.split("{link}");
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}

/**
 * A video's detail as the server stored it (English), in the journal's language: the
 * messages with a number or a reason in them are matched, the rest looked up as they are.
 */
function detailText(detail: string, t: Translate): string {
  let match = /^Older than (\d+) days when first seen\.$/.exec(detail);
  if (match) return t("Older than {days} days when first seen.", { days: match[1]! });
  match = /^Shorter than (\d+) minutes \(a Short\)\.$/.exec(detail);
  if (match) return t("Shorter than {minutes} minutes (a Short).", { minutes: match[1]! });
  match =
    /^No captions after two days \((.*)\)\. Paste the transcript, or use Google Gemini as the AI provider to have it watch the video\.$/.exec(
      detail,
    );
  if (match)
    return t(
      "No captions after two days ({reason}). Paste the transcript, or use Google Gemini as the AI provider to have it watch the video.",
      { reason: detailText(match[1]!, t) },
    );
  match = /^YouTube says: (.*)$/.exec(detail);
  if (match) return t("YouTube says: {reason}", { reason: match[1]! });
  return t(detail);
}

export default function ExternalPage() {
  return (
    <Suspense>
      <ExternalAnalysis />
    </Suspense>
  );
}

function ExternalAnalysis() {
  const { t, tn, tx, intl } = useI18n();
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

  /** Run a change, report it, and reload; true when it worked. */
  const act = async (label: string, run: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    setMessage(null);
    try {
      await run();
      if (done) setMessage({ text: done, error: false });
      return true;
    } catch (cause) {
      setMessage({
        text: cause instanceof Error ? cause.message : t("It did not work."),
        error: true,
      });
      return false;
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
          ? t("You already follow {channel}.", { channel: result.channel.title })
          : t("Following {channel}. Its newest video is being summarised.", {
              channel: result.channel.title,
            }),
        error: false,
      });
    });

  const saveSettings = (patch: Partial<Settings>) =>
    act("settings", () => postJson("/api/external", patch, "PUT"));

  return (
    <div>
      <FilterBar
        title={t("External analysis")}
        actions={
          <Button
            size="sm"
            variant="outline"
            disabled={!data?.channels.length || data.checking || busy !== null}
            onClick={() =>
              void act(
                "check",
                () => postJson("/api/external/check", {}),
                t("Checking every channel now."),
              )
            }
          >
            <RefreshCw className={data?.checking ? "animate-spin" : undefined} />
            {data?.checking ? t("Checking…") : t("Check now")}
          </Button>
        }
      />
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "Follow YouTube channels whose analysis you watch. Every day the journal looks for new videos and the AI summarises each into its main and secondary scenario, the reasons for each, the author's trades, and when they would go long or short with the stop loss and take profits.",
          )}{" "}
          <Linked
            text={t("Add a summary to a {link} as an external opinion.")}
            link={
              <Link href="/journal" className="underline">
                {t("journal day")}
              </Link>
            }
          />
        </p>
        {data && !data.ai.configured && (
          <p role="status" className="text-sm">
            <Linked
              text={t("Add an AI provider key in {link} to summarise videos.")}
              link={
                <Link href="/settings" className="underline">
                  {t("Settings")}
                </Link>
              }
            />
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
            title={t("Channels")}
            summary={data ? t("{count} followed", { count: data.channels.length }) : undefined}
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
                aria-label={t("YouTube channel")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("@channel, channel link or a video link")}
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              />
              <Button type="submit" size="sm" disabled={!input.trim() || busy !== null}>
                <Plus />
                {busy === "follow" ? t("Adding…") : t("Follow")}
              </Button>
            </form>
            {data?.channels.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("No channels yet.")}</p>
            )}
            <ul className="divide-y rounded-md border" aria-label={t("Followed channels")}>
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
                        aria-label={t("Check {channel} daily", { channel: c.title })}
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
                      {t("Daily")}
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t("Stop following {channel}", { channel: c.title })}
                      onClick={() => {
                        if (
                          confirm(
                            t("Stop following {channel}? Its summaries are removed too.", {
                              channel: c.title,
                            }),
                          )
                        )
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
                      ? t("Last check failed: {error}", { error: detailText(c.checkError, t) })
                      : c.checkedAt
                        ? t("Checked {time}", {
                            time: new Date(c.checkedAt).toLocaleString(intl, { timeZone }),
                          })
                        : t("Not checked yet")}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            id="external-settings"
            title={t("Daily check")}
            contentClassName="space-y-2 text-sm"
          >
            {data ? (
              <>
                <label className="flex flex-wrap items-center gap-2">
                  {t("Check every day at")}
                  <SettingInput
                    type="time"
                    label={t("Daily check time")}
                    value={data.settings.checkTime}
                    read={readTime}
                    onCommit={(checkTime) => saveSettings({ checkTime })}
                    className="h-8 rounded-md border bg-background px-2"
                  />
                  <span className="text-xs text-muted-foreground">({timeZone})</span>
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  {t("Summaries in")}
                  <select
                    aria-label={t("Summary language")}
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
                  {t("Summarise videos up to")}
                  <SettingInput
                    type="number"
                    min={1}
                    max={30}
                    label={t("Maximum age in days")}
                    value={data.settings.maxAgeDays}
                    read={wholeNumber(1, 30)}
                    onCommit={(maxAgeDays) => saveSettings({ maxAgeDays })}
                    className="h-8 w-16 rounded-md border bg-background px-2"
                  />
                  {t("days old, skipping those under")}
                  <SettingInput
                    type="number"
                    min={0}
                    max={60}
                    label={t("Minimum length in minutes")}
                    value={data.settings.minMinutes}
                    read={wholeNumber(0, 60)}
                    onCommit={(minMinutes) => saveSettings({ minMinutes })}
                    className="h-8 w-16 rounded-md border bg-background px-2"
                  />
                  {t("minutes")}
                </label>
                <p className="text-xs">
                  <Linked
                    text={t(
                      "Notifications when a summary is ready, and which channels send them: YouTube analyses on the {link} page.",
                    )}
                    link={
                      <Link href="/alerts" className="underline">
                        {t("Alerts")}
                      </Link>
                    }
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Videos are read from their captions (sent to your AI provider to summarise). Automatic captions can take a few hours to appear, so a new video is tried again every two hours for two days. With Google Gemini as the provider, a video without captions is watched instead.",
                  )}
                </p>
              </>
            ) : (
              <Skeleton className="h-32" />
            )}
          </SectionCard>

          <SectionCard
            id="external-filter"
            title={tx("filter", "Show")}
            contentClassName="space-y-2 text-sm"
          >
            <select
              aria-label={t("Channel to show")}
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="h-8 w-full rounded-md border bg-background px-2"
            >
              <option value="">{t("Every channel")}</option>
              {data?.channels.map((c) => (
                <option key={c.channelId} value={c.channelId}>
                  {c.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {data
                ? tn(
                    data.videos.filter((v) => v.status === "summarized").length,
                    "{count} summary, newest first.",
                    "{count} summaries, newest first.",
                  )
                : ""}
            </p>
          </SectionCard>
        </div>

        {!data ? (
          <Skeleton className="h-64" />
        ) : data.videos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.channels.length
              ? t("No videos yet.")
              : t("Follow a channel to see its analysis here.")}
          </p>
        ) : (
          <ul className="space-y-3" aria-label={t("Videos")}>
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

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
/** A typed value, or what to type instead (English, with its values, translated on screen). */
type Read<T> = (
  text: string,
) => { value: T } | { problem: string; vars?: Record<string, string | number> };
const readTime: Read<string> = (text) =>
  TIME.test(text.trim()) ? { value: text.trim() } : { problem: "Enter a time, like 08:00." };
const wholeNumber =
  (min: number, max: number): Read<number> =>
  (text) => {
    const value = Number(text.trim());
    return text.trim() !== "" && Number.isInteger(value) && value >= min && value <= max
      ? { value }
      : { problem: "Enter a whole number from {min} to {max}.", vars: { min, max } };
  };

/**
 * A daily check setting typed as a draft and saved when you leave the field or press Enter,
 * so each keystroke is not a save (a slow save would put the old value back under your
 * cursor). Text that is not a valid value stays in the field with what to type; Escape
 * puts the saved value back.
 */
function SettingInput<T extends string | number>({
  label,
  value,
  read,
  onCommit,
  ...input
}: {
  label: string;
  value: T;
  read: Read<T>;
  onCommit: (value: T) => Promise<boolean>;
  type: "time" | "number";
  min?: number;
  max?: number;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const t = useI18n().t;
  const [problem, setProblem] = useState<{
    text: string;
    vars?: Record<string, string | number>;
  } | null>(null);
  // A saved draft stays on screen until the page reloads the setting, so the old value never
  // flashes back: `from` is the value it replaces.
  const [saving, setSaving] = useState<{ from: T } | null>(null);
  if (saving && saving.from !== value) {
    setSaving(null);
    setDraft(null);
  }
  const id = useId();
  const commit = async () => {
    if (draft === null || saving) return;
    const result = read(draft);
    if ("problem" in result) return setProblem({ text: result.problem, vars: result.vars });
    setProblem(null);
    if (result.value === value) return setDraft(null);
    setSaving({ from: value });
    if (!(await onCommit(result.value))) {
      // The page says why; the field shows what is saved.
      setSaving(null);
      setDraft(null);
    }
  };
  return (
    <>
      <input
        {...input}
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? id : undefined}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          setProblem(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape" && draft !== null) {
            setDraft(null);
            setProblem(null);
          }
        }}
      />
      {problem && (
        <span id={id} role="alert" className="basis-full text-xs text-destructive">
          {label}: {t(problem.text, problem.vars)}
        </span>
      )}
    </>
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
  const { t, tx, intl } = useI18n();
  // Follows the page (the newest summary opens once it is ready) until you open or close it.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? initiallyOpen;
  // The publishing day in the journal's time zone (which loads after the page) until you pick one.
  const [pickedDay, setDay] = useState<string | null>(null);
  const day = pickedDay ?? dayKeyOf(video.publishedAt, timeZone);
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
      setNote({
        text: cause instanceof Error ? cause.message : t("It did not work."),
        error: true,
      });
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
                {new Date(video.publishedAt).toLocaleString(intl, { timeZone })}
                {minutes ? ` · ${t("{minutes} min", { minutes })}` : ""}
                {video.source ? ` · ${t(SOURCE[video.source])}` : ""}
              </p>
            </div>
            <Badge variant={video.status === "summarized" ? "secondary" : "outline"}>
              {tx("video status", STATUS[video.status])}
            </Badge>
          </div>
          {video.status !== "summarized" && video.detail && (
            <p className="text-xs text-muted-foreground">
              {detailText(video.detail, t)}
              {video.status === "waiting" && video.nextAttemptAt
                ? ` ${t("Next try {time}.", {
                    time: new Date(video.nextAttemptAt).toLocaleTimeString(intl, {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone,
                    }),
                  })}`
                : ""}
            </p>
          )}
          {video.status === "new" && (
            <p className="text-xs text-muted-foreground">{t("Being summarised…")}</p>
          )}
          {video.summary && open && <ExternalSummaryView summary={video.summary} />}
          <div className="flex flex-wrap items-center gap-2">
            {video.summary && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setChosen(!open)}>
                {open ? t("Hide summary") : t("Show summary")}
              </Button>
            )}
            {video.summary && (
              <span className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  aria-label={t("Journal day")}
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
                      r.added ? t("Added to {day}.", { day }) : t(r.reason ?? "Not added."),
                    )
                  }
                >
                  {t("Add to journal day")}
                </Button>
                <Link href={`/journal/${day}`} className="text-xs underline">
                  {t("Open day")}
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
                {video.summary ? t("Summarise again") : t("Summarise now")}
              </Button>
            )}
            {video.status !== "new" && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPasting((v) => !v)}>
                {t("Paste transcript")}
              </Button>
            )}
          </div>
          {pasting && (
            <div className="space-y-2">
              <textarea
                aria-label={t("Transcript")}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                placeholder={t("Paste the video's transcript (YouTube: … → Show transcript).")}
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
                {t("Summarise this transcript")}
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
