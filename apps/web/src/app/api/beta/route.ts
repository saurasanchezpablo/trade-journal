import { BETA_FEATURES } from "@/lib/beta-features";
import { handler, ok, requireValue } from "@/server/api";
import { getBetaFlags, saveBetaFlags } from "@/server/beta-features";

export const GET = handler(() => ok(getBetaFlags()));

/** Switch beta features on or off: `{ videoIntelligence?: boolean, strategyResearch?: boolean }`. */
export const PUT = handler(async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown> | null;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Invalid beta features.");
  for (const [key, value] of Object.entries(body)) {
    requireValue(
      BETA_FEATURES.some((f) => f.id === key),
      `Unknown beta feature: ${key}.`,
    );
    requireValue(typeof value === "boolean", "Each beta feature needs true or false.");
  }
  const next = { ...getBetaFlags(), ...(body as Record<string, boolean>) };
  saveBetaFlags(next);
  return ok(next);
});
