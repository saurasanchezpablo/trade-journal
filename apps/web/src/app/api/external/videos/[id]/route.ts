import { bad, handler, ok, requireValue } from "@/server/api";
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
 */
export const POST = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const video = isVideoId(id) ? getVideo(id) : null;
  if (!video) return bad("Video not found", 404);
  const body = (await request.json()) as { action?: unknown; text?: unknown };
  requireValue(body?.action === "summarize" || body?.action === "transcript", "Unknown action");
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
