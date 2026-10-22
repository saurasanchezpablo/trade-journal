import { CLAIM_EVALUATOR_VERSION } from "@luxalgo/journal-core";
import { RESOLUTIONS } from "@/lib/market-data";
import type { AuditReport } from "@/lib/video-intelligence";
import { computeEvaluation } from "./market";
import { allClaimRecords, getIntelligenceSettings, storedCandles } from "./store";

/**
 * The reproducibility audit: every stored evaluation computed again from its stored claim and
 * the stored candles it read (only those closed by the moment it was made), and compared field
 * by field with what is stored. A mismatch means a stored result can no longer be reproduced
 * (a changed candle, an edited row, a bug): it is listed, never hidden.
 */
export function auditEvaluations(): AuditReport {
  const records = allClaimRecords();
  const report: AuditReport = {
    checked: 0,
    matched: 0,
    mismatched: [],
    withoutMarket: 0,
    olderVersion: 0,
    ranAt: new Date().toISOString(),
  };
  const current = getIntelligenceSettings();
  for (const r of records) {
    const e = r.evaluation;
    if (!e) continue;
    if (e.evaluatorVersion !== CLAIM_EVALUATOR_VERSION) {
      report.olderVersion++;
      continue;
    }
    if (!e.market) {
      report.withoutMarket++;
      continue;
    }
    const now = Date.parse(e.market.retrievedAt);
    const step = RESOLUTIONS[e.market.resolution];
    const bars = storedCandles(e.market.series, e.market.from, e.market.to).filter(
      (b) => b.time + step <= now,
    );
    const again = computeEvaluation(r.claim, bars, now, e.simulation?.costs ?? current);
    const fields: string[] = [];
    const same = (name: string, a: unknown, b: unknown) => {
      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) fields.push(name);
    };
    same("status", e.outcome.status, again.outcome.status);
    same("reference price", e.outcome.referencePrice, again.outcome.referencePrice);
    same("target time", e.outcome.targetHitAt, again.outcome.targetHitAt);
    same("invalidation time", e.outcome.invalidatedAt, again.outcome.invalidatedAt);
    same(
      "best and worst move",
      [e.outcome.mfe, e.outcome.mae],
      [again.outcome.mfe, again.outcome.mae],
    );
    same("direction at horizon", e.outcome.directional, again.outcome.directional);
    same("baseline", e.baseline?.status, again.baseline?.status);
    same("simulated trade", e.simulation?.trade ?? null, again.simulation?.trade ?? null);
    report.checked++;
    if (fields.length)
      report.mismatched.push({
        claimId: r.claim.id,
        videoId: r.claim.videoId,
        statement: r.claim.claim.statement,
        fields,
      });
    else report.matched++;
  }
  return report;
}
