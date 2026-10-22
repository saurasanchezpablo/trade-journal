import { CLAIM_EXTRACTOR_VERSION } from "@/lib/video-claims";
import { isVideoId } from "@/lib/youtube";
import { bad, handler, ok, requireValue } from "@/server/api";
import { logFailure } from "@/server/background-alerts/log";
import { getVideo } from "@/server/external-analysis/store";
import {
  cancelQueued,
  client,
  enqueueVideos,
  getIntelligenceSettings,
  saveIntelligenceSettings,
} from "@/server/video-intelligence/store";
import { kickWorker, reevaluatePending, workerBusy } from "@/server/video-intelligence/worker";

const ACTIONS = ["start", "pause", "resume", "cancel", "retry", "reprocess", "reevaluate"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * The processing center's buttons. Work runs in the background worker; these only change
 * what it does next:
 * - `start`: queue every readable video (once each) and keep queueing new ones;
 * - `pause` / `resume`: the worker waits / goes on (a video under way finishes its step);
 * - `cancel`: queued and retrying videos stop (queue them again with `start` or `retry`);
 * - `retry`: failed videos (or one) are queued again with fresh attempts;
 * - `reprocess`: one video read again from scratch (its claims replaced);
 * - `reevaluate`: claims whose outcome can still change are evaluated again now.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { action?: unknown; videoId?: unknown } | null;
  requireValue(body && ACTIONS.includes(body.action as Action), "Unknown action.");
  requireValue(body.videoId === undefined || isVideoId(body.videoId), "Invalid video id.");
  const videoId = body.videoId as string | undefined;
  if (videoId && !getVideo(videoId)) return bad("Video not found", 404);
  const settings = getIntelligenceSettings();
  switch (body.action as Action) {
    case "start": {
      saveIntelligenceSettings({ ...settings, enabled: true, paused: false });
      const queued = enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
      kickWorker();
      return ok({ queued });
    }
    case "pause":
      saveIntelligenceSettings({ ...settings, paused: true });
      return ok({ paused: true });
    case "resume":
      saveIntelligenceSettings({ ...settings, enabled: true, paused: false });
      kickWorker();
      return ok({ paused: false });
    case "cancel":
      return ok({ cancelled: cancelQueued() });
    case "retry": {
      const sql = client();
      const changed = sql
        .prepare(
          `UPDATE vi_jobs SET state = 'queued', attempts = 0, next_attempt_at = NULL, detail = '', updated_at = ?
           WHERE state IN ('failed', 'unavailable') ${videoId ? "AND video_id = ?" : ""}`,
        )
        .run(new Date().toISOString(), ...(videoId ? [videoId] : [])).changes;
      kickWorker();
      return ok({ queued: changed });
    }
    case "reprocess": {
      requireValue(videoId, "Choose a video to read again.");
      enqueueVideos({ videoIds: [videoId], extractorVersion: CLAIM_EXTRACTOR_VERSION });
      // A changed version forces a new extraction (the claims are replaced).
      client()
        .prepare(
          "UPDATE vi_jobs SET state = 'queued', attempts = 0, extractor_version = NULL, next_attempt_at = NULL, detail = '', updated_at = ? WHERE video_id = ? AND state != 'running'",
        )
        .run(new Date().toISOString(), videoId);
      kickWorker();
      return ok({ queued: 1 });
    }
    case "reevaluate":
      if (workerBusy()) return bad("Processing is running; try again when it is done.", 409);
      void reevaluatePending().catch((error: unknown) =>
        logFailure("video intelligence reevaluate", error),
      );
      return ok({ started: true });
  }
});
