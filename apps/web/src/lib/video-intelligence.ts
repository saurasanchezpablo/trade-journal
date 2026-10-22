import type { ClaimStatus, OutcomeTally, TradeStats } from "@luxalgo/journal-core";

/**
 * What the Video intelligence page reads: an overview, groups (analyst, instrument,
 * direction, kind, regime, origin) with their outcome tallies, simulated-trade statistics and
 * calibration, and the claims behind each number. Predictions and simulated trades are kept
 * apart everywhere: a right direction is not a profitable trade.
 */

export interface IntelligenceFilters {
  channelId?: string;
  instrument?: string;
  direction?: "long" | "short" | "neutral";
  kind?: string;
  status?: ClaimStatus;
  /** Only claims the analyst said (no inferred or summary-derived ones). */
  explicitOnly?: boolean;
  /** Claim time range, YYYY-MM-DD (inclusive). */
  from?: string;
  to?: string;
}

export interface GroupReport {
  key: string;
  label: string;
  tally: OutcomeTally;
  trades: TradeStats;
  /** Net return of the simulated trades at no cost and at twice the costs (sums). */
  costFree: number | null;
  costDouble: number | null;
  /** Brier score of stated probabilities, with how many there were. */
  brier: number | null;
  brierCount: number;
  /** Direction right at the horizon but the target missed or invalidated first. */
  rightButMissed: number;
}

export interface ProcessingSummary {
  videos: number;
  readable: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  unavailable: number;
  notQueued: number;
  inputTokens: number;
  outputTokens: number;
}

export interface IntelligenceReport {
  overview: GroupReport;
  processing: ProcessingSummary;
  analysts: GroupReport[];
  instruments: GroupReport[];
  directions: GroupReport[];
  kinds: GroupReport[];
  regimes: GroupReport[];
  origins: GroupReport[];
  levels: { A: number; B: number; C: number };
  evidence: { verified: number; approximate: number; notFound: number; none: number };
  channels: { id: string; title: string }[];
}

export interface ClaimRow {
  id: string;
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  publishedAt: string;
  statement: string;
  instrument: string;
  direction: "long" | "short" | "neutral";
  kind: string;
  origin: string;
  level: "A" | "B" | "C";
  evidence: string;
  status: ClaimStatus | "not_evaluated";
  reason: string | null;
  horizonEnd: string;
  horizonSource: "stated" | "convention";
  netReturn: number | null;
  r: number | null;
}

/** Statuses as shown, with whether they count for or against a claim. */
export const STATUS_LABELS: Record<ClaimRow["status"], string> = {
  pending: "Pending",
  not_triggered: "Not triggered",
  target_hit: "Target hit",
  target_hit_late: "Target hit late",
  invalidated: "Invalidated",
  expired: "Expired",
  ambiguous: "Ambiguous",
  unevaluable: "Unevaluable",
  not_evaluated: "Not evaluated",
};

export const CLAIM_STATUSES_LIST = Object.keys(STATUS_LABELS) as ClaimRow["status"][];
export const isClaimStatus = (value: unknown): value is ClaimRow["status"] =>
  typeof value === "string" && Object.hasOwn(STATUS_LABELS, value);
