import { dayKeyOf } from "@luxalgo/journal-core";
import { bad, handler, ok, requireValue } from "@/server/api";
import { isDay } from "@/server/ai-scope";
import { getTimeZone } from "@/server/settings";
import { runDigest } from "@/server/ai-digests/run";

/**
 * Write and send a digest now, as the schedule would: `kind` "day" (a session recap) or
 * "week" (the seven days ending on `period`). `period` defaults to today in the journal's
 * timezone. Sending one again replaces the earlier record for that period.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as unknown;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Invalid request");
  const { kind, period } = body as { kind?: unknown; period?: unknown };
  requireValue(
    Object.keys(body).every((k) => ["kind", "period"].includes(k)),
    "Unknown digest field",
  );
  requireValue(kind === "day" || kind === "week", 'kind must be "day" or "week"');
  requireValue(period === undefined || isDay(period), "period must be YYYY-MM-DD");
  const day = (period as string | undefined) ?? dayKeyOf(new Date().toISOString(), getTimeZone());
  const digest = await runDigest(kind, day, { again: true });
  if (!digest) return bad("This digest is being written right now.", 409);
  return ok({ digest });
});
