import { serverT } from "@/server/i18n";
import { handler, ok } from "@/server/api";
import { deliver } from "@/server/background-alerts/delivery";

/**
 * Send a test notification to every browser and the webhook; `{ urgent: true }` sends it as
 * an urgent alert (top priority, repeated until acknowledged), to check how one arrives.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { urgent?: unknown } | null;
  const urgent = body?.urgent === true;
  return ok({
    delivered: await deliver(
      {
        title: serverT(urgent ? "Urgent test alert" : "Test alert"),
        body: serverT(
          urgent
            ? "Urgent alerts look like this. Open it or acknowledge it to stop the reminders."
            : "Alerts from the journal reach this device.",
        ),
        tag: urgent ? "alert-test-urgent" : "alert-test",
        url: "/alerts",
      },
      { kind: "test", urgent },
    ),
  });
});
