import { startAlertEngine } from "./server/background-alerts/engine";
import { startDigestScheduler } from "./server/ai-digests/scheduler";

/** Node-only startup work (imported by instrumentation.ts on the Node runtime). */
export function startBackgroundWork() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.JOURNAL_BACKGROUND_ALERTS !== "off") startAlertEngine();
  // Scheduled AI digests are off until switched on in the journal; this stops even the check.
  if (process.env.JOURNAL_AI_DIGESTS !== "off") startDigestScheduler();
}
