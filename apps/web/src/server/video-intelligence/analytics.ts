import {
  brierScore,
  tallyOutcomes,
  tradeStats,
  type ClaimOutcome,
  type SimulatedTrade,
} from "@luxalgo/journal-core";
import type {
  ClaimRow,
  GroupReport,
  IntelligenceFilters,
  IntelligenceReport,
  ProcessingSummary,
} from "@/lib/video-intelligence";
import { client, listJobs, type ClaimRecord } from "./store";

/**
 * Groups of claims with their outcomes. Every number is computed here from the stored
 * evaluations (no AI), and every group keeps its sample size and intervals: a group under
 * the minimum sample is flagged, never ranked as better.
 */

export function filterRecords(records: ClaimRecord[], f: IntelligenceFilters): ClaimRecord[] {
  return records.filter((r) => {
    const c = r.claim.claim;
    if (f.channelId && r.channelId !== f.channelId) return false;
    if (f.instrument && (c.ticker ?? c.instrument).toUpperCase() !== f.instrument.toUpperCase())
      return false;
    if (f.direction && c.direction !== f.direction) return false;
    if (f.kind && c.kind !== f.kind) return false;
    if (f.status && (r.evaluation?.status ?? "not_evaluated") !== f.status) return false;
    if (f.explicitOnly && c.origin !== "explicit") return false;
    const day = r.claim.claimTime.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}

const RESOLVED = new Set(["target_hit", "invalidated", "expired", "target_hit_late"]);

export function groupReport(key: string, label: string, records: ClaimRecord[]): GroupReport {
  const outcomes = records
    .map((r) => r.evaluation?.outcome)
    .filter((o): o is ClaimOutcome => Boolean(o));
  const simulations = records.map((r) => r.evaluation?.simulation).filter(Boolean);
  const trades = simulations
    .map((s) => s!.trade)
    .filter((t): t is SimulatedTrade => t !== null && t !== undefined);
  const closed = simulations.filter((s) => s!.trade && s!.trade.netReturn !== null);
  const sum = (values: (number | null | undefined)[]) =>
    values.some((v) => v === null || v === undefined)
      ? null
      : values.reduce<number>((a, b) => a + (b as number), 0);
  const calibration = records
    .filter(
      (r) =>
        r.claim.claim.probability !== null &&
        r.claim.claim.origin === "explicit" &&
        r.evaluation &&
        RESOLVED.has(r.evaluation.status),
    )
    .map((r) => ({
      probability: r.claim.claim.probability!,
      happened: r.evaluation!.status === "target_hit",
    }));
  return {
    key,
    label,
    tally: tallyOutcomes(outcomes),
    trades: tradeStats(trades),
    costFree: closed.length ? sum(closed.map((s) => s!.sensitivity?.free)) : null,
    costDouble: closed.length ? sum(closed.map((s) => s!.sensitivity?.double)) : null,
    brier: brierScore(calibration),
    brierCount: calibration.length,
    rightButMissed: outcomes.filter(
      (o) => o.directional === "correct" && (o.status === "invalidated" || o.status === "expired"),
    ).length,
  };
}

function groupsBy(
  records: ClaimRecord[],
  keyOf: (r: ClaimRecord) => { key: string; label: string },
): GroupReport[] {
  const groups = new Map<string, { label: string; records: ClaimRecord[] }>();
  for (const r of records) {
    const { key, label } = keyOf(r);
    const group = groups.get(key) ?? { label, records: [] };
    group.records.push(r);
    groups.set(key, group);
  }
  // Largest evidence first: a ranking by rate would favour tiny samples.
  return [...groups.entries()]
    .map(([key, g]) => groupReport(key, g.label, g.records))
    .sort((a, b) => b.tally.resolved - a.tally.resolved || b.tally.claims - a.tally.claims);
}

export function processingSummary(): ProcessingSummary {
  const sql = client();
  const counts = sql
    .prepare(
      `SELECT COUNT(*) AS videos,
        SUM(CASE WHEN transcript IS NOT NULL OR summary_json IS NOT NULL THEN 1 ELSE 0 END) AS readable
       FROM external_videos`,
    )
    .get() as { videos: number; readable: number | null };
  const jobs = listJobs();
  const by = (state: string) => jobs.filter((j) => j.state === state).length;
  return {
    videos: counts.videos,
    readable: counts.readable ?? 0,
    queued: by("queued"),
    running: by("running"),
    done: by("done"),
    failed: by("failed"),
    unavailable: by("unavailable"),
    notQueued: Math.max(0, (counts.readable ?? 0) - jobs.length),
    inputTokens: jobs.reduce((s, j) => s + j.inputTokens, 0),
    outputTokens: jobs.reduce((s, j) => s + j.outputTokens, 0),
  };
}

export function buildReport(all: ClaimRecord[], filters: IntelligenceFilters): IntelligenceReport {
  const records = filterRecords(all, filters);
  const regimeLabel = (r: ClaimRecord) => {
    const regime = r.evaluation?.regime;
    if (!regime || regime.trend === "unknown") return { key: "unknown", label: "Unknown" };
    const trend = regime.trend === "up" ? "Uptrend" : "Downtrend";
    const vol =
      regime.volatility === "high"
        ? "high volatility"
        : regime.volatility === "normal"
          ? "normal volatility"
          : "volatility unknown";
    return { key: `${regime.trend}|${regime.volatility}`, label: `${trend}, ${vol}` };
  };
  const channels = new Map<string, string>();
  for (const r of all) channels.set(r.channelId, r.channelTitle || r.channelId);
  return {
    overview: groupReport("all", "All", records),
    processing: processingSummary(),
    analysts: groupsBy(records, (r) => ({
      key: r.channelId,
      label: r.channelTitle || r.channelId,
    })),
    instruments: groupsBy(records, (r) => {
      const name = (r.claim.claim.ticker ?? r.claim.claim.instrument).toUpperCase();
      return { key: name, label: name };
    }),
    directions: groupsBy(records, (r) => ({
      key: r.claim.claim.direction,
      label: r.claim.claim.direction,
    })),
    kinds: groupsBy(records, (r) => ({ key: r.claim.claim.kind, label: r.claim.claim.kind })),
    regimes: groupsBy(records, regimeLabel),
    origins: groupsBy(records, (r) => ({ key: r.claim.claim.origin, label: r.claim.claim.origin })),
    levels: {
      A: records.filter((r) => r.claim.level === "A").length,
      B: records.filter((r) => r.claim.level === "B").length,
      C: records.filter((r) => r.claim.level === "C").length,
    },
    evidence: {
      verified: records.filter((r) => r.claim.evidence === "verified").length,
      approximate: records.filter((r) => r.claim.evidence === "approximate").length,
      notFound: records.filter((r) => r.claim.evidence === "not_found").length,
      none: records.filter((r) => r.claim.evidence === "none").length,
    },
    channels: [...channels.entries()].map(([id, title]) => ({ id, title })),
  };
}

export function claimRows(records: ClaimRecord[], limit = 500): ClaimRow[] {
  return records.slice(0, limit).map((r) => {
    const c = r.claim.claim;
    const trade = r.evaluation?.simulation?.trade ?? null;
    return {
      id: r.claim.id,
      videoId: r.claim.videoId,
      videoTitle: r.videoTitle,
      channelTitle: r.channelTitle,
      publishedAt: r.publishedAt,
      statement: c.statement,
      instrument: (c.ticker ?? c.instrument).toUpperCase(),
      direction: c.direction,
      kind: c.kind,
      origin: c.origin,
      level: r.claim.level,
      evidence: r.claim.evidence,
      status: r.evaluation?.status ?? "not_evaluated",
      reason: r.evaluation?.outcome.reason ?? null,
      horizonEnd: r.claim.horizonEnd,
      horizonSource: r.claim.horizonSource,
      netReturn: trade?.netReturn ?? null,
      r: trade?.r ?? null,
    };
  });
}
