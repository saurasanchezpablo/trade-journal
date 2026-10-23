import { research } from "@luxalgo/journal-core";
import { loadInstruments } from "./data";
import {
  costsOf,
  getResearchSettings,
  listSignals,
  loadReport,
  saveReport,
  type SignalRow,
} from "./store";

/**
 * Runs the catalog's research (every strategy's in-sample grid, walk-forward and holdout) on
 * the stored data, and replays the paper ledger from the recorded signals.
 */

const BENCHMARK = "btc-buy-hold";
const REGIME_INSTRUMENT = "BTC-SPOT";

/** The benchmark's daily returns, after the same costs, by day. */
export function benchmarkReturns(
  instruments: readonly research.Instrument[],
  costs: research.CostModel,
): Map<number, number> {
  const btc = instruments.find((i) => i.id === REGIME_INSTRUMENT);
  if (!btc) return new Map();
  const run = research.runBacktest([btc], research.strategyById(BENCHMARK)!.build({}), { costs });
  return new Map(run.days.map((d) => [d.time, d.ret]));
}

const yieldToServer = () => new Promise((resolve) => setImmediate(resolve));

/** Evaluate every strategy and store the reports; returns them. */
export async function runResearch(
  instruments = loadInstruments(),
  costs = costsOf(getResearchSettings()),
  options: research.EvaluationOptions = {},
): Promise<research.StrategyReport[]> {
  const btc = instruments.find((i) => i.id === REGIME_INSTRUMENT);
  if (!btc?.bars.length) throw new Error("No BTC data yet: download the market data first.");
  const benchmark = benchmarkReturns(instruments, costs);
  const reports: research.StrategyReport[] = [];
  for (const definition of research.STRATEGIES) {
    // Long evaluations are cut between strategies so requests are served meanwhile.
    await yieldToServer();
    const report = research.evaluateStrategy(
      definition,
      instruments,
      definition.role === "benchmark" ? null : benchmark,
      btc.bars,
      { costs, ...options },
    );
    saveReport(report);
    reports.push(report);
  }
  return reports;
}

/** Whether stored reports are missing, from another version, or computed with other costs. */
export function researchOutdated(costs = costsOf(getResearchSettings())): boolean {
  return research.STRATEGIES.some((s) => {
    const stored = loadReport(s.id)?.report;
    return (
      !stored ||
      stored.engineVersion !== research.RESEARCH_ENGINE_VERSION ||
      stored.catalogVersion !== research.CATALOG_VERSION ||
      stored.evaluationVersion !== research.EVALUATION_VERSION ||
      JSON.stringify(stored.costs) !== JSON.stringify(costs)
    );
  });
}

/**
 * The paper ledger of a strategy: its recorded signals replayed through the same accounting
 * as the backtest, from the first signal's execution. Null before the first signal.
 */
export function paperLedger(
  strategyId: string,
  instruments = loadInstruments(),
  signals: readonly SignalRow[] = listSignals(strategyId),
  costs = costsOf(getResearchSettings()),
): research.SeriesSummary | null {
  const definition = research.strategyById(strategyId);
  if (!definition || !signals.length) return null;
  const used = instruments.filter((i) => definition.instruments.includes(i.id as never));
  const first = Math.min(...signals.map((s) => s.executeAt));
  const run = research.runBacktest(used, research.replaySignals(signals), {
    costs,
    maxGross: definition.maxGross,
    from: first - 86_400_000,
  });
  const days = run.days.filter((d) => d.time >= first);
  const btc = instruments.find((i) => i.id === REGIME_INSTRUMENT);
  return research.summarizeDays(
    "paper",
    "Signals recorded by the monitor as they happened, executed at the next open",
    days,
    definition.role === "benchmark" ? null : benchmarkReturns(instruments, costs),
    research.regimes(btc?.bars ?? []),
    costs,
    1,
  );
}
