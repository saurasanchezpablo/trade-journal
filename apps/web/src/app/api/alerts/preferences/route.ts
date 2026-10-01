import { handler, ok } from "@/server/api";
import {
  getAlertPreferences,
  updateAlertPreferences,
} from "@/server/background-alerts/preferences";

/** Which alerts reach you and where: per kind, quiet hours, a pause, muted sources. */
export const GET = handler(() => ok({ preferences: getAlertPreferences() }));

/** Change some of them: `{ kinds?, quiet?, pausedUntil?, muted? }`. */
export const PUT = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as unknown;
  return ok({ preferences: updateAlertPreferences(body) });
});
