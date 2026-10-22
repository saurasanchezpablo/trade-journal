import { CLAIM_EVALUATOR_VERSION } from "@luxalgo/journal-core";
import { CLAIM_EXTRACTOR_VERSION } from "@/lib/video-claims";
import { aiConfigured } from "../ai";
import { getVideo, storedTranscript } from "../external-analysis/store";
import { defaultExtractDeps, extractClaims, type ExtractDeps } from "./extract";
import { defaultMarketDeps, evaluateStoredClaim, type MarketDeps } from "./market";
import {
  MAX_ATTEMPTS,
  claimNextJob,
  claimsAtLevel,
  claimsOfVideo,
  claimsToReevaluate,
  enqueueVideos,
  getIntelligenceSettings,
  getJob,
  pruneOrphans,
  replaceClaims,
  requeueInterrupted,
  requeueOutdated,
  updateJob,
} from "./store";

/**
 * The background work: one video at a time, its claims extracted (once per extractor version)
 * and evaluated, its job state persisted at every step so a restart resumes where it was.
 * A failed video is retried later (at most `MAX_ATTEMPTS` times) and never stops the others.
 * Claims whose outcome can still change (pending, or not yet evaluable) are evaluated again
 * every few hours as candles arrive; an evaluator version change re-evaluates them all.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TICK_MS = MINUTE;
/** Pending claims are evaluated again this often. */
export const REEVALUATE_MS = 6 * HOUR;
/** Videos processed per tick, so a tick never runs for long. */
const VIDEOS_PER_TICK = 3;

export interface WorkerDeps {
  now: () => number;
  extract: ExtractDeps;
  market: MarketDeps;
}
const defaults = (): WorkerDeps => ({
  now: () => Date.now(),
  extract: defaultExtractDeps,
  market: defaultMarketDeps,
});

const message = (error: unknown) =>
  error instanceof Error && error.message ? error.message.slice(0, 500) : "The step failed.";

/** Evaluate a video's claims, each on its own (one claim's failure is stored as its outcome). */
async function evaluateVideo(videoId: string, deps: WorkerDeps) {
  for (const claim of claimsOfVideo(videoId)) {
    try {
      await evaluateStoredClaim(claim, deps.market);
    } catch {
      // Stored as unevaluable by the next pass; the video goes on.
    }
  }
}

/** Process one job: extract (unless current), then evaluate. Returns the state it ended in. */
export async function runJob(videoId: string, partial: Partial<WorkerDeps> = {}) {
  const deps = { ...defaults(), ...partial };
  const job = getJob(videoId);
  const video = getVideo(videoId);
  if (!job || !video) return null;
  const transcript = storedTranscript(videoId);
  if (!transcript && !video.summary) {
    updateJob(videoId, { state: "unavailable", detail: "No transcript or summary yet." });
    return "unavailable";
  }
  const current =
    job.extractorVersion === CLAIM_EXTRACTOR_VERSION &&
    claimsOfVideo(videoId).length === job.claims &&
    job.source === (transcript ? "transcript" : "summary");
  if (!current) {
    if (transcript && !aiConfigured()) {
      updateJob(videoId, {
        state: "failed",
        detail: "AI is not configured: add a provider in Settings, then retry.",
        nextAttemptAt: null,
      });
      return "failed";
    }
    try {
      const extraction = await extractClaims(
        {
          videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          publishedAt: video.publishedAt,
          transcript,
          summary: video.summary,
        },
        deps.extract,
      );
      replaceClaims(videoId, extraction.claims);
      updateJob(videoId, {
        extractorVersion: CLAIM_EXTRACTOR_VERSION,
        source: extraction.source,
        claims: extraction.claims.length,
        inputTokens: job.inputTokens + extraction.inputTokens,
        outputTokens: job.outputTokens + extraction.outputTokens,
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      updateJob(videoId, {
        state: "failed",
        attempts,
        detail: `Extraction failed: ${message(error)}`,
        // Retried an hour, then two, later; then it waits for you.
        nextAttemptAt:
          attempts < MAX_ATTEMPTS ? new Date(deps.now() + attempts * HOUR).toISOString() : null,
      });
      return "failed";
    }
  }
  await evaluateVideo(videoId, deps);
  updateJob(videoId, {
    state: "done",
    detail: "",
    attempts: 0,
    nextAttemptAt: null,
    evaluatorVersion: CLAIM_EVALUATOR_VERSION,
  });
  return "done";
}

/** Evaluate again the claims whose outcome can still change, oldest first. */
export async function reevaluatePending(partial: Partial<WorkerDeps> = {}, limit = 200) {
  const deps = { ...defaults(), ...partial };
  let count = 0;
  for (const claim of claimsToReevaluate(CLAIM_EVALUATOR_VERSION, limit)) {
    try {
      await evaluateStoredClaim(claim, deps.market);
      count++;
    } catch {
      // Tried again next time.
    }
  }
  return count;
}

/** Simulated setups again (the execution costs changed). */
export async function reevaluateLevelC(partial: Partial<WorkerDeps> = {}) {
  const deps = { ...defaults(), ...partial };
  for (const claim of claimsAtLevel("C")) {
    try {
      await evaluateStoredClaim(claim, deps.market);
    } catch {
      // Tried again by the periodic pass.
    }
  }
}

const shared = globalThis as unknown as { __viBusy?: boolean; __viLastReevaluation?: number };
export const workerBusy = () => shared.__viBusy === true;

export class IntelligenceWorker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: Partial<WorkerDeps> = {}) {}

  start() {
    // Jobs the last process left running are resumed.
    requeueInterrupted();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Run what is due. A tick while one runs does nothing; paused or not started, nothing. */
  async tick() {
    if (shared.__viBusy) return;
    const settings = getIntelligenceSettings();
    if (!settings.enabled || settings.paused) return;
    shared.__viBusy = true;
    try {
      pruneOrphans();
      // New summaries since the last tick (incremental processing).
      enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
      requeueOutdated(CLAIM_EXTRACTOR_VERSION);
      for (let i = 0; i < VIDEOS_PER_TICK; i++) {
        if (getIntelligenceSettings().paused) break;
        const job = claimNextJob(new Date((this.deps.now ?? Date.now)()).toISOString());
        if (!job) break;
        try {
          await runJob(job.videoId, this.deps);
        } catch (error) {
          updateJob(job.videoId, { state: "failed", detail: message(error), nextAttemptAt: null });
        }
      }
      const now = (this.deps.now ?? Date.now)();
      if (now - (shared.__viLastReevaluation ?? 0) >= REEVALUATE_MS) {
        shared.__viLastReevaluation = now;
        await reevaluatePending(this.deps);
      }
    } finally {
      shared.__viBusy = false;
    }
  }
}

const globalForWorker = globalThis as unknown as { __journalIntelligence?: IntelligenceWorker };

export function startIntelligenceWorker(): IntelligenceWorker {
  if (!globalForWorker.__journalIntelligence) {
    const worker = new IntelligenceWorker();
    worker.start();
    globalForWorker.__journalIntelligence = worker;
  }
  return globalForWorker.__journalIntelligence;
}

/** Run a tick now (after starting, resuming or retrying), in the background. */
export const kickWorker = () => void globalForWorker.__journalIntelligence?.tick();
