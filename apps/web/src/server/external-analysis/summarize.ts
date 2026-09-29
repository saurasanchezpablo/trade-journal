import { SUMMARY_SCHEMA, readSummary, type ExternalSummary } from "@/lib/external-summary";
import { runAi } from "../ai";
import { runAiObject } from "../ai-structured";

/**
 * A video summarised as a trader's notes (see `lib/external-summary.ts`). A long transcript
 * is first cut into parts, each reduced to notes that keep every price and condition, so a
 * two-hour stream fits; a normal video goes in whole.
 */

/** Transcripts up to this length are sent whole (about 40 minutes of speech is 45k). */
export const WHOLE_CHARS = 120_000;
const PART_CHARS = 60_000;
const MAX_PARTS = 6;

export interface VideoToSummarize {
  title: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
  url: string;
}

const instructions = (
  video: VideoToSummarize,
  language: string,
) => `You are summarising a trading analysis video for a trader's journal, as notes they can act on.
Video: "${video.title}" by ${video.channelTitle || "a YouTube channel"}, published ${video.publishedAt} (UTC).
Write every text field in ${language}. Report only what the author says: prices, levels and
conditions exactly as given (numbers as plain numbers, no currency signs); null or an empty
list when the video does not say. Never add your own opinion or invent a level.
- overview: the author's view in two to four sentences; bias: their overall direction.
- mainScenario: what they think is most likely (title, direction, instrument, description,
  trigger, targets, invalidation, likelihood as they put it); mainReasons: why they favour it.
- secondaryScenario: the alternative they describe; secondaryReasons: what would make it
  right. Null and empty when they give none.
- openTrades: positions the author says they hold now, with entry, stop and take profits.
- tradeIdeas: moments they call good to go long or short, with the condition ("when"), the
  entry zone, stop loss and take profits.
- keyLevels: supports, resistances and other levels they name.
- caveats: their warnings, and anything the video leaves unclear.
Where the transcript has time marks like [12:30], you may mention them in notes.`;

/** Long transcripts: notes per part, keeping every price, condition and scenario. */
async function condense(text: string, video: VideoToSummarize): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < text.length && parts.length < MAX_PARTS; i += PART_CHARS)
    parts.push(text.slice(i, i + PART_CHARS));
  const notes: string[] = [];
  for (const [index, part] of parts.entries())
    notes.push(
      await runAi(
        `Part ${index + 1} of ${parts.length} of the transcript of "${video.title}". Write dense notes in
English of everything a trader needs: each scenario and its reasons, open trades, entries,
stop losses, take profits, key levels and conditions, with the exact prices and the time
marks. No commentary of your own.

${part}`,
        2000,
      ),
    );
  const cut = text.length > parts.length * PART_CHARS;
  return `Notes from the transcript, part by part${cut ? " (the end of a very long stream was left out)" : ""}:\n\n${notes
    .map((n, i) => `Part ${i + 1}:\n${n}`)
    .join("\n\n")}`;
}

/** Summarise from a transcript (captions or pasted). */
export async function summarizeTranscript(
  video: VideoToSummarize,
  transcript: string,
  language: string,
): Promise<ExternalSummary> {
  const body =
    transcript.length > WHOLE_CHARS
      ? await condense(transcript, video)
      : `Transcript:\n${transcript}`;
  return runAiObject({
    prompt: `${instructions(video, language)}

Video description (may list the author's levels or links; ignore sponsor text):
${video.description.slice(0, 3000) || "none"}

${body}`,
    schema: SUMMARY_SCHEMA as never,
    name: "video_summary",
    read: readSummary,
    maxOutputTokens: 3000,
  });
}

/** Summarise by letting the provider watch the video (Gemini reads public YouTube links). */
export async function summarizeByWatching(
  video: VideoToSummarize,
  language: string,
): Promise<ExternalSummary> {
  return runAiObject({
    prompt: `${instructions(video, language)}\n\nThe video is attached; watch it and listen to what the author says.`,
    schema: SUMMARY_SCHEMA as never,
    name: "video_summary",
    read: readSummary,
    maxOutputTokens: 3000,
    videoUrl: video.url,
  });
}
