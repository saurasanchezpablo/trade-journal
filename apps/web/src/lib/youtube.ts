/**
 * Reading YouTube without an API key: what a channel input is, a channel's public feed (its
 * latest 15 videos), a watch page's channel id, and a caption track as plain text. Pure; the
 * server fetches.
 */

export type ChannelInput =
  | { kind: "id"; channelId: string }
  | { kind: "page"; url: string }
  | { kind: "video"; videoId: string };

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A channel as pasted: its id (UC…), @handle, channel, /c/ or /user/ URL, or one of its video
 * links. Null for anything else.
 */
export function parseChannelInput(raw: string): ChannelInput | null {
  const input = raw.trim();
  if (!input || input.length > 300) return null;
  if (CHANNEL_ID.test(input)) return { kind: "id", channelId: input };
  if (/^@[A-Za-z0-9._-]{2,100}$/.test(input))
    return { kind: "page", url: `https://www.youtube.com/${input}` };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    return VIDEO_ID.test(id) ? { kind: "video", videoId: id } : null;
  }
  if (host !== "youtube.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "watch") {
    const id = url.searchParams.get("v") ?? "";
    return VIDEO_ID.test(id) ? { kind: "video", videoId: id } : null;
  }
  if ((parts[0] === "shorts" || parts[0] === "live") && VIDEO_ID.test(parts[1] ?? ""))
    return { kind: "video", videoId: parts[1]! };
  if (parts[0] === "channel" && CHANNEL_ID.test(parts[1] ?? ""))
    return { kind: "id", channelId: parts[1]! };
  if (parts[0]?.startsWith("@"))
    return { kind: "page", url: `https://www.youtube.com/${parts[0]}` };
  if ((parts[0] === "c" || parts[0] === "user") && parts[1])
    return { kind: "page", url: `https://www.youtube.com/${parts[0]}/${parts[1]}` };
  return null;
}

/** The channel id on a channel page (its RSS link, or the page's own id). */
export function channelIdFromPage(html: string): string | null {
  const rss = /feeds\/videos\.xml\?channel_id=(UC[A-Za-z0-9_-]{22})/.exec(html);
  if (rss) return rss[1]!;
  const external = /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html);
  if (external) return external[1]!;
  const canonical =
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(
      html,
    );
  return canonical ? canonical[1]! : null;
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export interface FeedVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  description: string;
  url: string;
}

export interface ChannelFeed {
  channelId: string | null;
  title: string;
  videos: FeedVideo[];
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? decodeEntities(m[1]!.trim()) : "";
};

/** A channel's Atom feed (youtube.com/feeds/videos.xml), newest first. */
export function parseFeed(xml: string): ChannelFeed {
  const head = xml.split("<entry>")[0] ?? "";
  const videos: FeedVideo[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = tag(entry, "yt:videoId");
    const publishedAt = tag(entry, "published");
    if (!VIDEO_ID.test(videoId) || !Number.isFinite(Date.parse(publishedAt))) continue;
    videos.push({
      videoId,
      title: tag(entry, "title") || tag(entry, "media:title"),
      publishedAt: new Date(publishedAt).toISOString(),
      description: tag(entry, "media:description"),
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const id = tag(head, "yt:channelId");
  return {
    channelId: CHANNEL_ID.test(id) ? id : CHANNEL_ID.test(`UC${id}`) ? `UC${id}` : null,
    title: tag(head, "title"),
    videos,
  };
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: string;
}

/**
 * The caption track to read: one written by the author in a preferred language, else the
 * automatic one in the video's own language (the first automatic track), else any.
 */
export function pickCaptionTrack(
  tracks: readonly CaptionTrack[],
  preferred: readonly string[] = ["en", "es"],
): CaptionTrack | null {
  const lang = (t: CaptionTrack) => t.languageCode.toLowerCase().split("-")[0]!;
  for (const code of preferred) {
    const manual = tracks.find((t) => t.kind !== "asr" && lang(t) === code);
    if (manual) return manual;
  }
  const auto = tracks.find((t) => t.kind === "asr");
  if (auto) return auto;
  return tracks.find((t) => t.kind !== "asr") ?? tracks[0] ?? null;
}

export interface TranscriptLine {
  /** Seconds from the start. */
  start: number;
  text: string;
}

/** A caption document (timedtext format 3, or the older <transcript> form) as lines. */
export function parseTranscript(xml: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  const clean = (inner: string) =>
    decodeEntities(inner.replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .trim();
  for (const m of xml.matchAll(/<p\s[^>]*?t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = clean(m[2]!);
    if (text) lines.push({ start: Number(m[1]) / 1000, text });
  }
  if (!lines.length)
    for (const m of xml.matchAll(/<text\s[^>]*?start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
      const text = clean(m[2]!);
      if (text) lines.push({ start: Number(m[1]), text });
    }
  return lines;
}

const clock = (seconds: number) => {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** Lines joined as paragraphs with a time mark every half minute or so, for the AI to cite. */
export function transcriptText(lines: readonly TranscriptLine[], every = 30): string {
  const out: string[] = [];
  let mark = -Infinity;
  let paragraph = "";
  for (const line of lines) {
    if (line.start - mark >= every) {
      if (paragraph) out.push(paragraph);
      paragraph = `[${clock(line.start)}] ${line.text}`;
      mark = line.start;
    } else paragraph += ` ${line.text}`;
  }
  if (paragraph) out.push(paragraph);
  return out.join("\n");
}

export const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
export const isVideoId = (value: unknown): value is string =>
  typeof value === "string" && VIDEO_ID.test(value);
export const isChannelId = (value: unknown): value is string =>
  typeof value === "string" && CHANNEL_ID.test(value);
