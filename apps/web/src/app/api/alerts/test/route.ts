import { serverT } from "@/server/i18n";
import { handler, ok } from "@/server/api";
import { deliver } from "@/server/background-alerts/delivery";

/** Send a test notification to every browser and the webhook. */
export const POST = handler(async () =>
  ok({
    delivered: await deliver(
      {
        title: serverT("Test alert"),
        body: serverT("Alerts from the journal reach this device."),
        tag: "alert-test",
        url: "/alerts",
      },
      { kind: "test" },
    ),
  }),
);
