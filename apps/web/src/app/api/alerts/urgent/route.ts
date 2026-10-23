import { handler, ok, requireValue } from "@/server/api";
import {
  acknowledgeAllUrgent,
  acknowledgeUrgent,
  pendingUrgent,
} from "@/server/background-alerts/urgent";

/** Urgent alerts nobody acknowledged yet (open pages poll this to sound the alarm). */
export const GET = handler(() => ok({ pending: pendingUrgent() }));

/** `{ action: "ack", id }` or `{ action: "ack-all" }`: stop the reminders and the alarm. */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { action?: unknown; id?: unknown } | null;
  requireValue(body && (body.action === "ack" || body.action === "ack-all"), "Unknown action.");
  if (body.action === "ack-all") return ok({ acknowledged: acknowledgeAllUrgent() });
  requireValue(
    typeof body.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(body.id),
    "Invalid alert.",
  );
  return ok({ acknowledged: acknowledgeUrgent(body.id) ? 1 : 0 });
});
