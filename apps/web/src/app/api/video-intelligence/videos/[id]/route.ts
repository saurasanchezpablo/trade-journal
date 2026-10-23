import { traceOutcome, type ClaimBar } from "@luxalgo/journal-core";
import { toEvaluate } from "@/server/video-intelligence/market";
import { isVideoId } from "@/lib/youtube";
import { bad, handler, ok } from "@/server/api";
import { getVideo, storedTranscript } from "@/server/external-analysis/store";
import {
  claimsOfVideo,
  evaluationOf,
  getJob,
  storedCandles,
} from "@/server/video-intelligence/store";
import { betaGate } from "@/server/beta-features";

type Params = { params: Promise<{ id: string }> };

/** Candles sent per series for the chart (the stored ones, never fetched here). */
const MAX_CHART_BARS = 3000;

/**
 * A video's claims with their evidence, evaluations and provenance, its job, the transcript
 * (for reading the quotes in context) and the stored candles each evaluation used.
 */
export const GET = handler(async (_request: Request, { params }: Params) => {
  const off = betaGate("videoIntelligence");
  if (off) return off;
  const { id } = await params;
  const video = isVideoId(id) ? getVideo(id) : null;
  if (!video) return bad("Video not found", 404);
  const claims = claimsOfVideo(id).map((claim) => {
    const evaluation = evaluationOf(claim.id);
    const market = evaluation?.market;
    // The candles that decided the outcome, from the same stored candles it read.
    const trace =
      evaluation && market
        ? traceOutcome(
            toEvaluate(claim),
            evaluation.outcome,
            storedCandles(market.series, market.from, market.to),
          )
        : [];
    return { ...claim, evaluation, trace };
  });
  const candles: Record<string, ClaimBar[]> = {};
  for (const { evaluation } of claims) {
    const market = evaluation?.market;
    if (!market || candles[market.series]) continue;
    const bars = storedCandles(market.series, market.from, market.to);
    candles[market.series] = bars.slice(-MAX_CHART_BARS);
  }
  return ok({
    video: {
      videoId: video.videoId,
      title: video.title,
      url: video.url,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      lengthSeconds: video.lengthSeconds,
      source: video.source,
    },
    job: getJob(id),
    transcript: storedTranscript(id),
    claims,
    candles,
  });
});
