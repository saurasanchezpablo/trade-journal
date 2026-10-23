import { handler, ok, requireValue } from "@/server/api";
import { logFailure } from "@/server/background-alerts/log";
import { buildReport, claimRows, filterRecords } from "@/server/video-intelligence/analytics";
import {
  allClaimRecords,
  getIntelligenceSettings,
  jobRows,
  readIntelligenceSettings,
  saveIntelligenceSettings,
} from "@/server/video-intelligence/store";
import {
  CLAIM_STATUSES_LIST,
  isClaimStatus,
  type IntelligenceFilters,
} from "@/lib/video-intelligence";
import { reevaluateLevelC, workerBusy } from "@/server/video-intelligence/worker";
import { betaGate } from "@/server/beta-features";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filters from the query string, checked by hand (anything else is a 400). */
function readFilters(params: URLSearchParams): IntelligenceFilters {
  const f: IntelligenceFilters = {};
  const text = (name: string, max: number) => {
    const value = params.get(name);
    if (value === null || value === "") return undefined;
    requireValue(value.length <= max, `Invalid ${name}.`);
    return value;
  };
  f.channelId = text("channel", 100);
  f.instrument = text("instrument", 40);
  const direction = text("direction", 10);
  if (direction) {
    requireValue(["long", "short", "neutral"].includes(direction), "Invalid direction.");
    f.direction = direction as IntelligenceFilters["direction"];
  }
  f.kind = text("kind", 20);
  const status = text("status", 20);
  if (status) {
    requireValue(isClaimStatus(status), `Status must be one of ${CLAIM_STATUSES_LIST.join(", ")}.`);
    f.status = status as IntelligenceFilters["status"];
  }
  f.explicitOnly = params.get("explicit") === "1";
  for (const key of ["from", "to"] as const) {
    const value = text(key, 10);
    if (value) {
      requireValue(DAY.test(value), "Dates must be YYYY-MM-DD.");
      f[key] = value;
    }
  }
  return f;
}

/** The report, the filtered claims, the settings and whether work is running. */
export const GET = handler((request: Request) => {
  const off = betaGate("videoIntelligence");
  if (off) return off;
  const filters = readFilters(new URL(request.url).searchParams);
  const records = allClaimRecords();
  return ok({
    settings: getIntelligenceSettings(),
    busy: workerBusy(),
    report: buildReport(records, filters),
    claims: claimRows(filterRecords(records, filters)),
    jobs: jobRows(),
  });
});

/** Execution costs for simulated setups; a change re-simulates them in the background. */
export const PUT = handler(async (request: Request) => {
  const off = betaGate("videoIntelligence");
  if (off) return off;
  const body = (await request.json()) as Record<string, unknown> | null;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Enter valid settings.");
  for (const key of ["commissionBps", "slippageBps", "targetBufferBps"])
    requireValue(
      typeof body[key] === "number" &&
        Number.isFinite(body[key]) &&
        (body[key] as number) >= 0 &&
        (body[key] as number) <= 500,
      "Costs must be between 0 and 500 basis points.",
    );
  const before = getIntelligenceSettings();
  const next = readIntelligenceSettings({
    ...before,
    ...body,
    enabled: before.enabled,
    paused: before.paused,
  });
  saveIntelligenceSettings(next);
  const changed =
    next.commissionBps !== before.commissionBps ||
    next.slippageBps !== before.slippageBps ||
    next.targetBufferBps !== before.targetBufferBps;
  if (changed)
    void reevaluateLevelC().catch((error: unknown) =>
      logFailure("video intelligence costs", error),
    );
  return ok({ settings: next, resimulating: changed });
});
