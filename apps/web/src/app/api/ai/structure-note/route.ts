import { handler, ok, requireValue } from "@/server/api";
import { runAi } from "@/server/ai";
import { streamedAnswer, wantsStream } from "@/server/ai-stream";

const MAX_MEMO = 20_000;

/**
 * A dictated (or quickly typed) memo turned into a tidy journal note: the trader's own facts
 * and words, sorted into sections, with Keep and Fix lists only where the memo supports them.
 * The note is shown to the trader first and added only when they choose.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { text?: unknown; kind?: unknown; stream?: unknown };
  requireValue(
    body &&
      typeof body.text === "string" &&
      body.text.trim().length > 0 &&
      body.text.length <= MAX_MEMO,
    `text is required (up to ${MAX_MEMO} characters)`,
  );
  requireValue(body.kind === "day" || body.kind === "trade", 'kind must be "day" or "trade"');
  requireValue(
    Object.keys(body).every((k) => ["text", "kind", "stream"].includes(k)),
    "Unknown field",
  );
  const streamed = wantsStream(body.stream);
  const prompt = `Turn this dictated memo into a tidy ${body.kind === "day" ? "journal day" : "trade review"} note, in markdown and first person ("I").
Keep every fact the trader gave and their own words where you can; add nothing they did not
say, and never invent numbers. Fix obvious dictation slips in trading words (for example
"stop lost" for "stop loss"). Use short sections: ${body.kind === "day" ? '"**What happened**", "**Trades**", "**How I felt**"' : '"**Setup**", "**Execution**", "**How I felt**"'}, leaving out
a section the memo does not cover. End with a "**Keep**" list and a "**Fix**" list, one item
a line starting with "- ", only with lessons the memo supports (either list may be left out).
Answer with the note only.

Memo:
"""
${body.text.trim()}
"""`;
  const ai = { prompt, maxOutputTokens: 1200 };
  const result = (note: string) => ({ note: note.trim() });
  if (streamed) return streamedAnswer(request, ai, result);
  return ok(result(await runAi(ai.prompt, ai.maxOutputTokens)));
});
