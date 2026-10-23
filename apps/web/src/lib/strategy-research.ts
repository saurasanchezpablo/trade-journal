import type { research } from "@luxalgo/journal-core";

/** What the Research pages read (GET /api/research and /api/research/[id]). */

export interface StrategyMeta {
  id: string;
  name: string;
  role: research.StrategyRole;
  family: research.StrategyFamily;
  hypothesis: string;
  risk: string;
  instruments: string[];
  grid: { id: string; label: string }[];
  /** What it must beat: BTC held, or cash (a market-neutral book). */
  benchmark: "btc" | "cash";
}

export const strategyMeta = (s: research.StrategyDefinition): StrategyMeta => ({
  id: s.id,
  name: s.name,
  role: s.role,
  family: s.family,
  hypothesis: s.hypothesis,
  risk: s.risk,
  instruments: s.instruments,
  grid: s.grid.map((g) => ({ id: g.id, label: g.label })),
  benchmark: s.benchmark,
});

export interface CategoryFigures {
  from: number | null;
  to: number | null;
  days: number;
  totalReturn: number;
  cagr: number | null;
  sharpe: number | null;
  maxDrawdown: number;
  benchmarkSharpe: number | null;
}

export interface StrategyOverview extends StrategyMeta {
  verdict: research.Verdict | null;
  selected: { id: string; label: string } | null;
  inSample: CategoryFigures | null;
  walkForward: CategoryFigures | null;
  holdout: CategoryFigures | null;
  paper: CategoryFigures | null;
  deflatedSharpe: number | null;
  pbo: number | null;
  trials: { distinct: number; runs: number };
  latestSignal: {
    decisionTime: number;
    weights: Record<string, number>;
    reason: string;
    changed: boolean;
  } | null;
  reportAt: string | null;
}

export interface ResearchOverview {
  settings: {
    monitoring: boolean;
    spotFeeBps: number;
    perpFeeBps: number;
    slippageBps: number;
    cashRatePct: number;
  };
  state: {
    monitoringSince: string | null;
    lastRefreshAt: string | null;
    lastResearchAt: string | null;
    lastMonitorAt: string | null;
    errors: Record<string, string | undefined>;
    stale: string[];
    running: string | null;
  };
  series: {
    series: string;
    provider: string;
    endpoint: string;
    symbol: string;
    kind: string;
    firstTime: number | null;
    lastTime: number | null;
    rows: number;
    retrievedAt: string;
  }[];
  strategies: StrategyOverview[];
  holdoutFrom: number;
  standard: typeof research.EVIDENCE_STANDARD;
  versions: { engine: string; catalog: string; evaluation: string };
}

export interface SignalView {
  decisionTime: number;
  executeAt: number;
  generatedAt: string;
  configId: string;
  weights: Record<string, number>;
  previous: Record<string, number> | null;
  changed: boolean;
  reason: string;
  inputs: Record<string, number | string | null> | null;
  alerted: boolean;
}

export interface StrategyDetail {
  strategy: StrategyMeta;
  report: research.StrategyReport | null;
  reportAt: string | null;
  paper: research.SeriesSummary | null;
  signals: SignalView[];
  trials: { distinct: number; runs: number };
  monitoring: boolean;
}

export const VERDICT_LABELS: Record<research.Verdict, { label: string; detail: string }> = {
  benchmark: { label: "Benchmark", detail: "The passive comparison; not judged." },
  "meets-standard": {
    label: "Meets the standard",
    detail: "Passed every pre-declared criterion. Still research, not a promise of returns.",
  },
  experimental: {
    label: "Experimental",
    detail: "Positive out of sample but failed at least one criterion: not established.",
  },
  rejected: {
    label: "Rejected",
    detail: "Did no better than cash after costs in the walk-forward test.",
  },
  "insufficient-data": {
    label: "Insufficient data",
    detail: "Not enough history to apply the standard.",
  },
};

export const CATEGORY_LABELS: Record<research.ResultCategory, { label: string; detail: string }> = {
  "in-sample": {
    label: "In-sample",
    detail:
      "The best configuration, chosen and measured on the same days. Optimistic by construction.",
  },
  "walk-forward": {
    label: "Walk-forward (out of sample)",
    detail: "Each window traded by the configuration chosen on the years before it.",
  },
  holdout: {
    label: "Holdout",
    detail: "The frozen in-sample choice on days no choice ever saw.",
  },
  paper: {
    label: "Paper (live)",
    detail: "Signals recorded as they happened, replayed at the next open. No real orders.",
  },
};

export const figures = (s: research.SeriesSummary | null | undefined): CategoryFigures | null =>
  s
    ? {
        from: s.from,
        to: s.to,
        days: s.metrics.days,
        totalReturn: s.metrics.totalReturn,
        cagr: s.metrics.cagr,
        sharpe: s.metrics.sharpe,
        maxDrawdown: s.metrics.maxDrawdown,
        benchmarkSharpe: s.benchmark?.sharpe ?? null,
      }
    : null;
