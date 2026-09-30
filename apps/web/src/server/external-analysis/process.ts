import { aiConfigured } from "../ai";
import { getAiProvider } from "../settings";
import { deliver as deliverAlert, type AlertNotification } from "../background-alerts/delivery";
import { fetchFeed, fetchTranscript, type VideoTranscript } from "./youtube";
import {
  getChannel,
  getExternalSettings,
  getVideo,
  listChannels,
  markChannelChecked,
  recordVideo,
  storedTranscript,
  updateVideo,
  dueVideos,
  type ExternalChannel,
  type ExternalVideo,
} from "./store";
import { summarizeByWatching, summarizeTranscript } from "./summarize";

/**
 * The work behind External analysis: read each channel's feed, note new videos, and turn each
 * into a summary. A video without captions yet (automatic captions can take hours), or a
 * stream that has not aired yet, is tried again every two hours for two days; a failed AI
 * call is retried once an hour later. `attempts` counts failed summaries in a row, so time
 * spent waiting for captions never uses up that retry.
 */

const HOUR = 3_600_000;
export const WAIT_RETRY_MS = 2 * HOUR;
export const WAIT_FOR_CAPTIONS_MS = 48 * HOUR;
export const FAILED_RETRY_MS = HOUR;
const MAX_ATTEMPTS = 2;

/** Network and AI, replaced in tests. */
export interface ProcessDeps {
  now: () => number;
  deliver: (notification: AlertNotification) => Promise<number>;
  transcript: (videoId: string) => Promise<VideoTranscript>;
}
const defaults: ProcessDeps = {
  now: Date.now,
  deliver: deliverAlert,
  transcript: (videoId) => fetchTranscript(videoId, { languages: ["en", "es"] }),
};

export interface CheckReport {
  channels: number;
  newVideos: number;
  summarized: number;
  waiting: number;
  failed: number;
  errors: string[];
}

/**
 * Read one channel's feed and record the videos it has not seen. On the channel's first
 * successful read only its newest recent video is queued (the rest are listed, to summarise
 * by hand), so adding a busy channel does not summarise a week of videos at once.
 */
export async function checkChannel(
  channel: ExternalChannel,
  deps: Partial<ProcessDeps> = {},
): Promise<{ added: number; error: string | null }> {
  const now = (deps.now ?? defaults.now)();
  const settings = getExternalSettings();
  try {
    const feed = await fetchFeed(channel.channelId);
    const first = channel.checkedAt === null;
    let queued = 0;
    let added = 0;
    for (const video of feed.videos) {
      const age = now - Date.parse(video.publishedAt);
      const recent = age <= settings.maxAgeDays * 24 * HOUR;
      const queue = recent && (!first || queued === 0);
      const isNew = recordVideo({
        ...video,
        channelId: channel.channelId,
        status: queue ? "new" : "skipped",
        detail: queue
          ? ""
          : !recent
            ? `Older than ${settings.maxAgeDays} days when first seen.`
            : "Listed when the channel was added; summarise it if you want it.",
      });
      if (isNew) {
        added += 1;
        if (queue) queued += 1;
      }
    }
    markChannelChecked(channel.id, null, feed.title || undefined);
    return { added, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The feed could not be read.";
    markChannelChecked(channel.id, message);
    return { added: 0, error: message };
  }
}

const later = (now: number, ms: number) => new Date(now + ms).toISOString();

// Shared by the scheduler and the API routes (separate module graphs in Next.js): a video is
// summarised by one caller at a time, and one check runs at a time.
const shared = globalThis as unknown as {
  __externalInFlight?: Set<string>;
  __externalChecking?: boolean;
};
const inFlight = (shared.__externalInFlight ??= new Set<string>());
export const checkRunning = () => shared.__externalChecking === true;
/** Whether a video is being summarised right now. */
export const videoInFlight = (videoId: string) => inFlight.has(videoId);

/**
 * Summarise one video. `force` summarises a skipped or finished one again. Returns the video
 * as stored afterwards.
 */
export async function processVideo(
  videoId: string,
  options: { force?: boolean; deps?: Partial<ProcessDeps> } = {},
): Promise<ExternalVideo | null> {
  const deps = { ...defaults, ...options.deps };
  const video = getVideo(videoId);
  if (!video) return null;
  if (inFlight.has(videoId)) return video;
  if (!options.force && !["new", "waiting", "failed"].includes(video.status)) return video;
  inFlight.add(videoId);
  try {
    return await summarize(video, options.force === true, deps);
  } finally {
    inFlight.delete(videoId);
  }
}

async function summarize(video: ExternalVideo, force: boolean, deps: ProcessDeps) {
  const videoId = video.videoId;
  const now = deps.now();
  const settings = getExternalSettings();
  if (!aiConfigured()) {
    updateVideo(videoId, {
      status: "failed",
      detail: "AI is not configured: add a provider key in Settings.",
      nextAttemptAt: null,
    });
    return getVideo(videoId);
  }
  const channel = getChannel(video.channelId);
  const input = {
    title: video.title,
    channelTitle: channel?.title ?? "",
    publishedAt: video.publishedAt,
    description: video.description,
    url: video.url,
  };

  // The transcript: one pasted by hand wins; else the captions.
  const pasted = video.source === "pasted" ? storedTranscript(videoId) : null;
  let text = pasted;
  let fetched: VideoTranscript | null = null;
  if (!text) {
    try {
      fetched = await deps.transcript(videoId);
    } catch (error) {
      fetched = {
        text: null,
        language: null,
        automatic: false,
        lengthSeconds: null,
        notAiredYet: false,
        description: "",
        reason: error instanceof Error ? error.message : "YouTube could not be reached.",
      };
    }
    text = fetched.text;
    if (fetched.lengthSeconds) updateVideo(videoId, { lengthSeconds: fetched.lengthSeconds });
  }
  const waited = now - Date.parse(video.publishedAt);
  if (fetched?.notAiredYet) {
    const giveUp = waited >= WAIT_FOR_CAPTIONS_MS;
    updateVideo(videoId, {
      status: giveUp ? "skipped" : "waiting",
      detail: giveUp
        ? "Not aired after two days. Summarise it now once it has aired."
        : "Not aired yet.",
      nextAttemptAt: giveUp ? null : later(now, WAIT_RETRY_MS),
    });
    return getVideo(videoId);
  }
  const length = fetched?.lengthSeconds ?? video.lengthSeconds;
  if (!force && length !== null && length < settings.minMinutes * 60) {
    updateVideo(videoId, {
      status: "skipped",
      detail: `Shorter than ${settings.minMinutes} minutes (a Short).`,
      nextAttemptAt: null,
    });
    return getVideo(videoId);
  }
  const watch = !text && getAiProvider() === "google";
  if (!text && !watch) {
    const giveUp = waited >= WAIT_FOR_CAPTIONS_MS;
    updateVideo(videoId, {
      status: giveUp ? "no_transcript" : "waiting",
      detail: giveUp
        ? `No captions after two days (${fetched?.reason ?? "none"}). Paste the transcript, or use Google Gemini as the AI provider to have it watch the video.`
        : (fetched?.reason ?? "No captions yet."),
      nextAttemptAt: giveUp ? null : later(now, WAIT_RETRY_MS),
    });
    return getVideo(videoId);
  }
  try {
    const summary = text
      ? await summarizeTranscript(input, text, settings.language)
      : await summarizeByWatching(input, settings.language);
    updateVideo(videoId, {
      status: "summarized",
      detail: "",
      source: pasted ? "pasted" : text ? "captions" : "video",
      transcript: text,
      language: fetched?.language ?? video.language,
      summary,
      attempts: 0,
      nextAttemptAt: null,
    });
    if (settings.notify)
      await deps
        .deliver({
          title: `New analysis: ${input.channelTitle || "YouTube"}`,
          body: `${video.title}. Bias ${summary.bias}${summary.mainScenario ? `; main scenario: ${summary.mainScenario.title}` : ""}.`,
          tag: `external-${videoId}`,
          url: `/external?video=${videoId}`,
        })
        .catch(() => 0);
  } catch (error) {
    // Failed summaries in a row: one after a success, a wait or a paste starts again at one.
    const attempts = (video.status === "failed" ? video.attempts : 0) + 1;
    updateVideo(videoId, {
      status: "failed",
      detail: error instanceof Error ? error.message : "The summary failed.",
      attempts,
      nextAttemptAt: attempts < MAX_ATTEMPTS ? later(now, FAILED_RETRY_MS) : null,
    });
  }
  return getVideo(videoId);
}

/**
 * The check: every enabled channel's feed (unless `feeds` is false: retries only), then every
 * video that is due, one at a time.
 */
export async function runCheck(
  options: { feeds?: boolean; channelIds?: string[]; deps?: Partial<ProcessDeps> } = {},
): Promise<CheckReport> {
  const report: CheckReport = {
    channels: 0,
    newVideos: 0,
    summarized: 0,
    waiting: 0,
    failed: 0,
    errors: [],
  };
  if (checkRunning()) return report;
  shared.__externalChecking = true;
  try {
    return await check(options, report);
  } finally {
    shared.__externalChecking = false;
  }
}

async function check(
  options: { feeds?: boolean; channelIds?: string[]; deps?: Partial<ProcessDeps> },
  report: CheckReport,
): Promise<CheckReport> {
  if (options.feeds !== false)
    for (const channel of listChannels()) {
      if (!channel.enabled || (options.channelIds && !options.channelIds.includes(channel.id)))
        continue;
      report.channels += 1;
      const { added, error } = await checkChannel(channel, options.deps);
      report.newVideos += added;
      if (error) report.errors.push(`${channel.title}: ${error}`);
    }
  const enabled = new Set(
    listChannels()
      .filter((c) => c.enabled)
      .map((c) => c.channelId),
  );
  const now = new Date((options.deps?.now ?? Date.now)()).toISOString();
  for (const video of dueVideos(now)) {
    if (!enabled.has(video.channelId)) continue;
    const after = await processVideo(video.videoId, { deps: options.deps });
    if (after?.status === "summarized") report.summarized += 1;
    else if (after?.status === "waiting") report.waiting += 1;
    else if (after?.status === "failed" || after?.status === "no_transcript") report.failed += 1;
  }
  return report;
}
