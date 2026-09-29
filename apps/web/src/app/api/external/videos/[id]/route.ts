import { eq } from "drizzle-orm";
import { db, journalDays } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { isDay } from "@/server/ai-scope";
import { nowIso } from "@/server/ids";
import { summaryMarkdown } from "@/lib/external-summary";
import { isVideoId } from "@/lib/youtube";
import { processVideo } from "@/server/external-analysis/process";
import { getVideo, storedTranscript, updateVideo } from "@/server/external-analysis/store";

type Params = { params: Promise<{ id: string }> };
const MAX_TRANSCRIPT = 400_000;

export const GET = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const video = isVideoId(id) ? getVideo(id) : null;
  if (!video) return bad("Video not found", 404);
  const transcript = storedTranscript(id);
  return ok({ video, transcriptChars: transcript?.length ?? 0 });
});

/**
 * `summarize`: summarise it now (again, if it was done). `transcript`: summarise from a
 * transcript you paste (a video without captions). Both run in the background; poll GET.
 * `add-to-day`: append the summary to a journal day's note as an "External opinion"
 * section (once: a note that already links the video is left as it is).
 */
export const POST = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const video = isVideoId(id) ? getVideo(id) : null;
  if (!video) return bad("Video not found", 404);
  const body = (await request.json()) as { action?: unknown; text?: unknown; date?: unknown };
  requireValue(
    body?.action === "summarize" || body?.action === "transcript" || body?.action === "add-to-day",
    "Unknown action",
  );
  if (body.action === "add-to-day") {
    requireValue(isDay(body.date), "date (YYYY-MM-DD) is required");
    if (!video.summary) return bad("This video has no summary yet.");
    const date = body.date as string;
    const note = db.select().from(journalDays).where(eq(journalDays.date, date)).get()?.note ?? "";
    if (note.includes(video.url))
      return ok({ added: false, reason: "Already in that day's note." });
    const section = summaryMarkdown(video.summary, video);
    const next = note.trim() ? `${note.trimEnd()}\n\n---\n\n${section}` : section;
    db.insert(journalDays)
      .values({ date, note: next, updatedAt: nowIso() })
      .onConflictDoUpdate({ target: journalDays.date, set: { note: next, updatedAt: nowIso() } })
      .run();
    return ok({ added: true, date });
  }
  if (body.action === "transcript") {
    requireValue(
      typeof body.text === "string" &&
        body.text.trim().length >= 200 &&
        body.text.length <= MAX_TRANSCRIPT,
      "Paste the transcript (at least a few sentences).",
    );
    updateVideo(id, {
      source: "pasted",
      transcript: (body.text as string).trim(),
      status: "new",
      detail: "",
    });
  } else updateVideo(id, { status: "new", detail: "" });
  void processVideo(id, { force: true });
  return ok({ video: getVideo(id) });
});
