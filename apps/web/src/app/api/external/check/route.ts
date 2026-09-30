import { bad, handler, ok, requireValue } from "@/server/api";
import { logFailure } from "@/server/background-alerts/log";
import { checkRunning, runCheck } from "@/server/external-analysis/process";
import { getChannel, listChannels } from "@/server/external-analysis/store";

/**
 * Check now: every enabled channel (or one), then summarise what is new. Runs in the
 * background; the page follows it through `checking` in GET /api/external.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json().catch(() => ({}))) as { channelId?: unknown };
  requireValue(
    body.channelId === undefined || typeof body.channelId === "string",
    "Invalid channelId",
  );
  if (checkRunning()) return bad("A check is already running.", 409);
  const ids = body.channelId ? [body.channelId as string] : undefined;
  if (ids && !getChannel(ids[0]!)) return bad("Channel not found", 404);
  if (!listChannels().some((c) => c.enabled)) return bad("Follow a channel first.");
  void runCheck({ channelIds: ids }).catch((error: unknown) => logFailure("check now", error));
  return ok({ started: true });
});
