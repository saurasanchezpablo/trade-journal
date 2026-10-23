import { research } from "@luxalgo/journal-core";
import {
  figures,
  strategyMeta,
  type ResearchOverview,
  type StrategyOverview,
} from "@/lib/strategy-research";
import { handler, ok, requireValue } from "@/server/api";
import { loadInstruments } from "@/server/strategy-research/data";
import { paperLedger } from "@/server/strategy-research/research";
import {
  getResearchSettings,
  getResearchState,
  lastSignal,
  listSeries,
  loadReport,
  readResearchSettings,
  saveResearchSettings,
  trialCount,
} from "@/server/strategy-research/store";

export const GET = handler(() => {
  const instruments = loadInstruments();
  const strategies: StrategyOverview[] = research.STRATEGIES.map((s) => {
    const stored = loadReport(s.id);
    const report = stored?.report ?? null;
    const signal = lastSignal(s.id);
    return {
      ...strategyMeta(s),
      verdict: report?.verdict ?? null,
      selected: report?.selected ?? null,
      inSample: figures(report?.inSample),
      walkForward: figures(report?.walkForward),
      holdout: figures(report?.holdout),
      paper: figures(signal ? paperLedger(s.id, instruments) : null),
      deflatedSharpe: report?.deflated.dsr ?? null,
      pbo: report?.pbo?.pbo ?? null,
      trials: trialCount(s.id),
      latestSignal: signal
        ? {
            decisionTime: signal.decisionTime,
            weights: signal.weights,
            reason: signal.reason,
            changed: signal.changed,
          }
        : null,
      reportAt: stored?.createdAt ?? null,
    };
  });
  const body: ResearchOverview = {
    settings: getResearchSettings(),
    state: getResearchState(),
    series: listSeries(),
    strategies,
    holdoutFrom: research.HOLDOUT_FROM,
    standard: research.EVIDENCE_STANDARD,
    versions: {
      engine: research.RESEARCH_ENGINE_VERSION,
      catalog: research.CATALOG_VERSION,
      evaluation: research.EVALUATION_VERSION,
    },
  };
  return ok(body);
});

/** Cost assumptions (basis points); monitoring is switched by the actions. */
export const PUT = handler(async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown> | null;
  requireValue(body && typeof body === "object", "Invalid settings.");
  for (const key of ["spotFeeBps", "perpFeeBps", "slippageBps"]) {
    const v = body[key];
    requireValue(
      v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 200),
      `${key} must be between 0 and 200 basis points.`,
    );
  }
  const rate = body.cashRatePct;
  requireValue(
    rate === undefined ||
      (typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 20),
    "cashRatePct must be between 0 and 20.",
  );
  const current = getResearchSettings();
  const next = readResearchSettings({ ...current, ...body, monitoring: current.monitoring });
  saveResearchSettings(next);
  return ok(next);
});
