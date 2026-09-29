import { db } from "@/db";
import { getSetting, setSetting } from "../settings";
import { newId, nowIso } from "../ids";
import type { ExternalSummary } from "@/lib/external-summary";

/**
 * External analysis: the YouTube channels you follow and their videos with the AI's
 * summaries, in tables of their own (created on first use, like the other add-ons), so the
 * journal's schema and upgrades stay untouched.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS external_channels (
 id TEXT PRIMARY KEY, channel_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, url TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1, added_at TEXT NOT NULL,
 checked_at TEXT, check_error TEXT
);
CREATE TABLE IF NOT EXISTS external_videos (
 video_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
 published_at TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', source TEXT,
 transcript TEXT, language TEXT, length_seconds INTEGER,
 summary_json TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS external_videos_channel ON external_videos(channel_id, published_at);
CREATE INDEX IF NOT EXISTS external_videos_published ON external_videos(published_at);
`;
const ready = new WeakSet<object>();
export const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

// ── Settings ──

export interface ExternalSettings {
  /** The daily check, local time in the journal's timezone. */
  checkTime: string;
  /** Videos older than this when first seen are listed but not summarized by themselves. */
  maxAgeDays: number;
  /** Shorter videos (Shorts) are skipped. */
  minMinutes: number;
  /** The language summaries are written in. */
  language: string;
  /** Send a notification (push, webhook) when a summary is ready. */
  notify: boolean;
}

export const DEFAULT_EXTERNAL: ExternalSettings = {
  checkTime: "08:00",
  maxAgeDays: 3,
  minMinutes: 3,
  language: "English",
  notify: false,
};

const SETTINGS_KEY = "externalAnalysis";
export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readExternalSettings(value: unknown): ExternalSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const int = (x: unknown, min: number, max: number, fallback: number) =>
    typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : fallback;
  return {
    checkTime:
      typeof v.checkTime === "string" && TIME.test(v.checkTime)
        ? v.checkTime
        : DEFAULT_EXTERNAL.checkTime,
    maxAgeDays: int(v.maxAgeDays, 1, 30, DEFAULT_EXTERNAL.maxAgeDays),
    minMinutes: int(v.minMinutes, 0, 60, DEFAULT_EXTERNAL.minMinutes),
    language: LANGUAGES.includes(v.language as (typeof LANGUAGES)[number])
      ? (v.language as string)
      : DEFAULT_EXTERNAL.language,
    notify: v.notify === true,
  };
}

export function getExternalSettings(): ExternalSettings {
  try {
    return readExternalSettings(JSON.parse(getSetting(SETTINGS_KEY) ?? "{}"));
  } catch {
    return readExternalSettings({});
  }
}
export const saveExternalSettings = (s: ExternalSettings) =>
  setSetting(SETTINGS_KEY, JSON.stringify(s));

const LAST_RUN_KEY = "externalAnalysisLastRun";
/** The local day the daily check last ran on. */
export const lastDailyRun = () => getSetting(LAST_RUN_KEY);
export const markDailyRun = (day: string) => setSetting(LAST_RUN_KEY, day);

// ── Channels ──

export interface ExternalChannel {
  id: string;
  channelId: string;
  title: string;
  url: string;
  enabled: boolean;
  addedAt: string;
  checkedAt: string | null;
  checkError: string | null;
}

interface ChannelRow {
  id: string;
  channel_id: string;
  title: string;
  url: string;
  enabled: number;
  added_at: string;
  checked_at: string | null;
  check_error: string | null;
}
const toChannel = (r: ChannelRow): ExternalChannel => ({
  id: r.id,
  channelId: r.channel_id,
  title: r.title,
  url: r.url,
  enabled: r.enabled === 1,
  addedAt: r.added_at,
  checkedAt: r.checked_at,
  checkError: r.check_error,
});

export const MAX_CHANNELS = 30;

export const listChannels = (): ExternalChannel[] =>
  (client().prepare("SELECT * FROM external_channels ORDER BY added_at").all() as ChannelRow[]).map(
    toChannel,
  );

export const getChannel = (id: string): ExternalChannel | null => {
  const row = client()
    .prepare("SELECT * FROM external_channels WHERE id = ? OR channel_id = ?")
    .get(id, id) as ChannelRow | undefined;
  return row ? toChannel(row) : null;
};

export function addChannel(input: {
  channelId: string;
  title: string;
  url: string;
}): ExternalChannel {
  const existing = getChannel(input.channelId);
  if (existing) return existing;
  const row: ChannelRow = {
    id: newId(),
    channel_id: input.channelId,
    title: input.title.slice(0, 200),
    url: input.url,
    enabled: 1,
    added_at: nowIso(),
    checked_at: null,
    check_error: null,
  };
  client()
    .prepare(
      "INSERT INTO external_channels (id, channel_id, title, url, enabled, added_at) VALUES (@id, @channel_id, @title, @url, @enabled, @added_at)",
    )
    .run(row);
  return toChannel(row);
}

export const setChannelEnabled = (id: string, enabled: boolean) =>
  client()
    .prepare("UPDATE external_channels SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, id).changes > 0;

export function markChannelChecked(id: string, error: string | null, title?: string) {
  client()
    .prepare(
      "UPDATE external_channels SET checked_at = ?, check_error = ?, title = COALESCE(?, title) WHERE id = ?",
    )
    .run(nowIso(), error, title ?? null, id);
}

/** Removing a channel removes its videos and summaries too. */
export function removeChannel(id: string): boolean {
  const channel = getChannel(id);
  if (!channel) return false;
  const sql = client();
  sql.transaction(() => {
    sql.prepare("DELETE FROM external_videos WHERE channel_id = ?").run(channel.channelId);
    sql.prepare("DELETE FROM external_channels WHERE id = ?").run(channel.id);
  })();
  return true;
}

// ── Videos ──

/**
 * `new`: seen, waiting to be summarized. `waiting`: no captions yet (retried for two days).
 * `summarized`. `no_transcript`: gave up waiting (paste one, or use Gemini). `failed`: the AI
 * or YouTube failed (retried once, then by hand). `skipped`: too old when first seen, a Short,
 * or not aired yet; summarize it by hand if you want it.
 */
export type VideoStatus = "new" | "waiting" | "summarized" | "no_transcript" | "failed" | "skipped";
/** Where the summary's text came from. */
export type SummarySource = "captions" | "pasted" | "video";

export interface ExternalVideo {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  url: string;
  publishedAt: string;
  description: string;
  status: VideoStatus;
  detail: string;
  source: SummarySource | null;
  language: string | null;
  lengthSeconds: number | null;
  summary: ExternalSummary | null;
  attempts: number;
  nextAttemptAt: string | null;
  updatedAt: string;
}

interface VideoRow {
  video_id: string;
  channel_id: string;
  channel_title?: string | null;
  title: string;
  url: string;
  published_at: string;
  description: string;
  status: string;
  detail: string;
  source: string | null;
  language: string | null;
  length_seconds: number | null;
  summary_json: string | null;
  attempts: number;
  next_attempt_at: string | null;
  updated_at: string;
}

const STATUSES: VideoStatus[] = [
  "new",
  "waiting",
  "summarized",
  "no_transcript",
  "failed",
  "skipped",
];
const toVideo = (r: VideoRow): ExternalVideo => {
  let summary: ExternalSummary | null = null;
  try {
    summary = r.summary_json ? (JSON.parse(r.summary_json) as ExternalSummary) : null;
  } catch {
    summary = null;
  }
  return {
    videoId: r.video_id,
    channelId: r.channel_id,
    channelTitle: r.channel_title ?? "",
    title: r.title,
    url: r.url,
    publishedAt: r.published_at,
    description: r.description,
    status: STATUSES.includes(r.status as VideoStatus) ? (r.status as VideoStatus) : "failed",
    detail: r.detail,
    source:
      r.source === "captions" || r.source === "pasted" || r.source === "video" ? r.source : null,
    language: r.language,
    lengthSeconds: r.length_seconds,
    summary,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    updatedAt: r.updated_at,
  };
};

const SELECT = `SELECT v.*, c.title AS channel_title FROM external_videos v
  LEFT JOIN external_channels c ON c.channel_id = v.channel_id`;

export const getVideo = (videoId: string): ExternalVideo | null => {
  const row = client().prepare(`${SELECT} WHERE v.video_id = ?`).get(videoId) as
    VideoRow | undefined;
  return row ? toVideo(row) : null;
};

export function listVideos(
  options: {
    channelId?: string;
    from?: string;
    to?: string;
    statuses?: VideoStatus[];
    limit?: number;
  } = {},
): ExternalVideo[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (options.channelId) {
    where.push("v.channel_id = ?");
    args.push(options.channelId);
  }
  if (options.from) {
    where.push("v.published_at >= ?");
    args.push(options.from);
  }
  if (options.to) {
    where.push("v.published_at < ?");
    args.push(options.to);
  }
  if (options.statuses?.length) {
    where.push(`v.status IN (${options.statuses.map(() => "?").join(",")})`);
    args.push(...options.statuses);
  }
  const rows = client()
    .prepare(
      `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY v.published_at DESC LIMIT ?`,
    )
    .all(...args, Math.min(Math.max(1, options.limit ?? 50), 500)) as VideoRow[];
  return rows.map(toVideo);
}

/** Record a video seen in a feed; returns true when it is new to the journal. */
export function recordVideo(video: {
  videoId: string;
  channelId: string;
  title: string;
  url: string;
  publishedAt: string;
  description: string;
  status: VideoStatus;
  detail?: string;
}): boolean {
  const now = nowIso();
  return (
    client()
      .prepare(
        `INSERT OR IGNORE INTO external_videos (video_id, channel_id, title, url, published_at, description, status, detail, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        video.videoId,
        video.channelId,
        video.title.slice(0, 300),
        video.url,
        video.publishedAt,
        video.description.slice(0, 5000),
        video.status,
        video.detail ?? "",
        now,
        now,
      ).changes > 0
  );
}

export function updateVideo(
  videoId: string,
  patch: Partial<{
    status: VideoStatus;
    detail: string;
    source: SummarySource | null;
    transcript: string | null;
    language: string | null;
    lengthSeconds: number | null;
    summary: ExternalSummary | null;
    attempts: number;
    nextAttemptAt: string | null;
  }>,
) {
  const columns: Record<string, string> = {
    status: "status",
    detail: "detail",
    source: "source",
    transcript: "transcript",
    language: "language",
    lengthSeconds: "length_seconds",
    summary: "summary_json",
    attempts: "attempts",
    nextAttemptAt: "next_attempt_at",
  };
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = columns[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    args.push(key === "summary" ? (value === null ? null : JSON.stringify(value)) : value);
  }
  if (!sets.length) return;
  client()
    .prepare(`UPDATE external_videos SET ${sets.join(", ")}, updated_at = ? WHERE video_id = ?`)
    .run(...args, nowIso(), videoId);
}

export const storedTranscript = (videoId: string): string | null =>
  (
    client().prepare("SELECT transcript FROM external_videos WHERE video_id = ?").get(videoId) as
      { transcript: string | null } | undefined
  )?.transcript ?? null;

/** Videos due now: new ones, and waiting or failed ones whose retry time came (none set: given up). */
export const dueVideos = (now = nowIso()): ExternalVideo[] =>
  (
    client()
      .prepare(
        `${SELECT} WHERE v.status = 'new' OR (v.status IN ('waiting', 'failed') AND v.next_attempt_at IS NOT NULL AND v.next_attempt_at <= ?)
         ORDER BY v.published_at DESC LIMIT 20`,
      )
      .all(now) as VideoRow[]
  ).map(toVideo);
