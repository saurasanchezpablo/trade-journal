import { handler, ok } from "@/server/api";
import { ALERT_KINDS } from "@/lib/alert-preferences";
import { clearNotifications, recentNotifications } from "@/server/background-alerts/preferences";

/** Notifications the server sent or held back, newest first (`?kind=` for one kind). */
export const GET = handler((request: Request) => {
  const kind = new URL(request.url).searchParams.get("kind");
  const known = kind && ([...ALERT_KINDS, "test"] as string[]).includes(kind) ? kind : null;
  return ok({ notifications: recentNotifications(known) });
});

export const DELETE = handler(() => ok({ cleared: clearNotifications() }));
