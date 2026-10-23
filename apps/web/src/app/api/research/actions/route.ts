import { handler, ok, requireValue } from "@/server/api";
import {
  clearSignals,
  getResearchSettings,
  saveResearchSettings,
  updateResearchState,
} from "@/server/strategy-research/store";
import { kickResearchWorker, runNow } from "@/server/strategy-research/worker";
import { nowIso } from "@/server/ids";
import { betaGate } from "@/server/beta-features";

const ACTIONS = ["refresh", "research", "start", "stop", "reset-paper"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * The Research page's buttons. Downloads and research run in the background (the page polls
 * the state); nothing here ever places an order:
 * - `refresh`: download the candles and funding that closed since the last download;
 * - `research`: download, then evaluate every strategy again;
 * - `start` / `stop`: the monitor records the day's signals (and the paper ledger) or not;
 * - `reset-paper`: forget the recorded signals; the paper ledger starts again.
 */
export const POST = handler(async (request: Request) => {
  const off = betaGate("strategyResearch");
  if (off) return off;
  const body = (await request.json()) as { action?: unknown } | null;
  requireValue(body && ACTIONS.includes(body.action as Action), "Unknown action.");
  const settings = getResearchSettings();
  switch (body.action as Action) {
    case "refresh":
    case "research":
      void runNow(body.action as "refresh" | "research");
      return ok({ started: true });
    case "start":
      saveResearchSettings({ ...settings, monitoring: true });
      updateResearchState({ monitoringSince: nowIso() });
      kickResearchWorker();
      return ok({ monitoring: true });
    case "stop":
      saveResearchSettings({ ...settings, monitoring: false });
      return ok({ monitoring: false });
    case "reset-paper":
      clearSignals();
      updateResearchState({ monitoringSince: settings.monitoring ? nowIso() : null });
      return ok({ reset: true });
  }
});
