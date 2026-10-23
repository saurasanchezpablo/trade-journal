import { research } from "@luxalgo/journal-core";
import { strategyMeta, type StrategyDetail } from "@/lib/strategy-research";
import { bad, handler, ok } from "@/server/api";
import { loadInstruments } from "@/server/strategy-research/data";
import { paperLedger } from "@/server/strategy-research/research";
import {
  getResearchSettings,
  listSignals,
  loadReport,
  trialCount,
} from "@/server/strategy-research/store";
import { betaGate } from "@/server/beta-features";

export const GET = handler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const off = betaGate("strategyResearch");
    if (off) return off;
    const { id } = await context.params;
    const definition = research.strategyById(id);
    if (!definition) return bad("Strategy not found", 404);
    const stored = loadReport(id);
    const signals = listSignals(id);
    const body: StrategyDetail = {
      strategy: strategyMeta(definition),
      report: stored?.report ?? null,
      reportAt: stored?.createdAt ?? null,
      paper: signals.length ? paperLedger(id, loadInstruments(), signals) : null,
      signals: signals.map(({ id: _, strategyId: __, ...s }) => s),
      trials: trialCount(id),
      monitoring: getResearchSettings().monitoring,
    };
    return ok(body);
  },
);
