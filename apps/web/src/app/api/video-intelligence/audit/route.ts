import { handler, ok } from "@/server/api";
import { auditEvaluations } from "@/server/video-intelligence/audit";
import { betaGate } from "@/server/beta-features";

/**
 * The reproducibility audit: every stored evaluation computed again from the stored claim
 * and candles, compared field by field. Reads only what is stored (nothing is fetched).
 */
export const GET = handler(() => betaGate("videoIntelligence") ?? ok(auditEvaluations()));
