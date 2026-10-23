import { startAlertEngine } from "./server/background-alerts/engine";
import { startDigestScheduler } from "./server/ai-digests/scheduler";
import { startExternalScheduler } from "./server/external-analysis/scheduler";
import { startIntelligenceWorker } from "./server/video-intelligence/worker";
import { startResearchWorker } from "./server/strategy-research/worker";

/** Node-only startup work (imported by instrumentation.ts on the Node runtime). */
export function startBackgroundWork() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOURNAL_BACKGROUND_ALERTS !== "off") startAlertEngine();
  // Scheduled AI digests are off until switched on in the journal; this stops even the check.
  if (process.env.JOURNAL_AI_DIGESTS !== "off") startDigestScheduler();
  // External analysis: idle until you follow a channel; "off" stops even the check.
  if (process.env.JOURNAL_EXTERNAL_ANALYSIS !== "off") startExternalScheduler();
  // Video intelligence: idle until you start it on its page; "off" stops even the check.
  if (process.env.JOURNAL_VIDEO_INTELLIGENCE !== "off") startIntelligenceWorker();
  // Strategy research: idle until monitoring is started on its page; "off" stops even the check.
  if (process.env.JOURNAL_STRATEGY_RESEARCH !== "off") startResearchWorker();
}
