import {
  channelIdFromPage,
  parseChannelInput,
  parseFeed,
  parseTranscript,
  pickCaptionTrack,
  transcriptText,
  videoUrl,
  type CaptionTrack,
  type ChannelFeed,
} from "@/lib/youtube";

/**
 * YouTube over its public endpoints, no API key: a channel page (to find the channel's id),
 * the channel's feed, and a video's captions through the player endpoint the YouTube apps
 * use (the web page's caption links now need a browser-only token). YouTube changes these
 * from time to time; every failure is reported as a plain reason, never as a guess.
 */

export class YouTubeError extends Error {}

const TIMEOUT_MS = 20_000;
const BROWSER =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
/** YouTube shows visitors from the EU a consent page first; this is the answer to it. */
const CONSENT = "SOCS=CAI; CONSENT=YES+1";

/** Network access, replaced in tests. */
export const youtubeTransport = {
  fetch: (url: string, init: RequestInit) => fetch(url, init),
};

async function get(url: string, signal?: AbortSignal, headers: Record<string, string> = {}) {
  const response = await youtubeTransport.fetch(url, {
    headers: {
      "User-Agent": BROWSER,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: CONSENT,
      ...headers,
    },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) throw new YouTubeError(`YouTube answered ${response.status}.`);
  return response.text();
}

export async function fetchFeed(channelId: string, signal?: AbortSignal): Promise<ChannelFeed> {
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, signal);
  if (!xml.includes("<feed")) throw new YouTubeError("The channel's feed could not be read.");
  const feed = parseFeed(xml);
  return { ...feed, channelId: feed.channelId ?? channelId };
}

/** The player's answer for a video: its details and caption tracks. */
interface PlayerAnswer {
  status: string;
  reason: string | null;
  channelId: string | null;
  title: string;
  lengthSeconds: number | null;
  isUpcoming: boolean;
  isLive: boolean;
  description: string;
  tracks: CaptionTrack[];
}

/** The app clients whose caption links still work without a browser token, tried in order. */
const CLIENTS = [
  {
    context: {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 30,
      hl: "en",
      gl: "US",
    },
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
  },
  {
    context: {
      clientName: "IOS",
      clientVersion: "20.10.4",
      deviceModel: "iPhone16,2",
      hl: "en",
      gl: "US",
    },
    userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
  },
];

async function player(videoId: string, client: (typeof CLIENTS)[number], signal?: AbortSignal) {
  const response = await youtubeTransport.fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": client.userAgent,
        Cookie: CONSENT,
      },
      body: JSON.stringify({ context: { client: client.context }, videoId }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new YouTubeError(`YouTube's player answered ${response.status}.`);
  const data = (await response.json()) as {
    playabilityStatus?: { status?: string; reason?: string; liveStreamability?: unknown };
    videoDetails?: {
      channelId?: string;
      title?: string;
      lengthSeconds?: string;
      isUpcoming?: boolean;
      isLiveContent?: boolean;
      isLive?: boolean;
      shortDescription?: string;
    };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  };
  const details = data.videoDetails ?? {};
  const length = Number(details.lengthSeconds);
  return {
    status: data.playabilityStatus?.status ?? "UNKNOWN",
    reason: data.playabilityStatus?.reason ?? null,
    channelId: details.channelId ?? null,
    title: details.title ?? "",
    lengthSeconds: Number.isFinite(length) && length > 0 ? length : null,
    isUpcoming: details.isUpcoming === true,
    isLive: details.isLive === true,
    description: details.shortDescription ?? "",
    tracks: (data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).filter(
      (t) => typeof t?.baseUrl === "string" && typeof t.languageCode === "string",
    ),
  } satisfies PlayerAnswer;
}

export interface VideoTranscript {
  /** Plain text with time marks, or null when the video has no captions (yet). */
  text: string | null;
  language: string | null;
  automatic: boolean;
  lengthSeconds: number | null;
  /** The video is scheduled or streaming: try again once it has aired. */
  notAiredYet: boolean;
  description: string;
  reason: string | null;
}

/** A video's captions as text, from the first app client that has them. */
export async function fetchTranscript(
  videoId: string,
  options: { languages?: string[]; signal?: AbortSignal } = {},
): Promise<VideoTranscript> {
  let last: PlayerAnswer | null = null;
  let failure: string | null = null;
  for (const client of CLIENTS) {
    try {
      const answer = await player(videoId, client, options.signal);
      last = answer;
      if (answer.isUpcoming || answer.isLive || answer.status === "LIVE_STREAM_OFFLINE")
        return {
          text: null,
          language: null,
          automatic: false,
          lengthSeconds: answer.lengthSeconds,
          notAiredYet: true,
          description: answer.description,
          reason: "The video has not aired yet.",
        };
      const track = pickCaptionTrack(answer.tracks, options.languages);
      if (!track) continue;
      const xml = await get(track.baseUrl, options.signal);
      const text = transcriptText(parseTranscript(xml));
      if (!text) continue;
      return {
        text,
        language: track.languageCode,
        automatic: track.kind === "asr",
        lengthSeconds: answer.lengthSeconds,
        notAiredYet: false,
        description: answer.description,
        reason: null,
      };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      failure = error instanceof Error ? error.message : "YouTube could not be reached.";
    }
  }
  return {
    text: null,
    language: null,
    automatic: false,
    lengthSeconds: last?.lengthSeconds ?? null,
    notAiredYet: false,
    description: last?.description ?? "",
    reason:
      last && last.status !== "OK"
        ? `YouTube says: ${last.reason ?? last.status}`
        : last
          ? "The video has no captions yet (automatic captions can take a few hours)."
          : (failure ?? "YouTube could not be reached."),
  };
}

export interface ResolvedChannel {
  channelId: string;
  title: string;
  url: string;
}

/** A pasted channel (handle, URL, id or one of its videos) as its id and name. */
export async function resolveChannel(raw: string, signal?: AbortSignal): Promise<ResolvedChannel> {
  const input = parseChannelInput(raw);
  if (!input)
    throw new YouTubeError(
      "Paste a YouTube channel: its @handle, channel link, or a link to one of its videos.",
    );
  let channelId: string | null = null;
  if (input.kind === "id") channelId = input.channelId;
  else if (input.kind === "video") {
    for (const client of CLIENTS) {
      try {
        channelId = (await player(input.videoId, client, signal)).channelId;
        if (channelId) break;
      } catch {
        // The next client may answer.
      }
    }
    if (!channelId) throw new YouTubeError("That video's channel could not be found.");
  } else {
    const html = await get(input.url, signal);
    channelId = channelIdFromPage(html);
    if (!channelId) throw new YouTubeError("No YouTube channel was found at that address.");
  }
  const feed = await fetchFeed(channelId, signal);
  return {
    channelId,
    title: feed.title || channelId,
    url: `https://www.youtube.com/channel/${channelId}`,
  };
}

export { videoUrl };
