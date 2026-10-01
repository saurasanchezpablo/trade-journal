import { desc, eq, lt } from "drizzle-orm";
import {
  alertPreferencesProblem,
  readAlertPreferences,
  type AlertKind,
  type AlertPreferences,
  type MuteReason,
} from "@/lib/alert-preferences";
import { RequestError } from "../api";
import { getExternalSettings } from "../external-analysis/store";
import { newId, nowIso } from "../ids";
import { getSetting, setSetting } from "../settings";
import { alertsDb, notificationLog } from "./store";

/** Which alerts reach you and where (see `lib/alert-preferences.ts`), in the settings table. */
const KEY = "alerts:preferences";
/** The notification log keeps this many, newest first. */
export const KEEP_LOG = 300;

export function getAlertPreferences(): AlertPreferences {
  let stored: unknown = null;
  try {
    stored = JSON.parse(getSetting(KEY) ?? "null");
  } catch {
    // Unreadable: the defaults.
  }
  // YouTube notifications had their own switch before; it decides until this is saved.
  return readAlertPreferences(stored, { external: getExternalSettings().notify });
}

/** Change some of the preferences (`kinds` merge by kind); returns them all. */
export function updateAlertPreferences(patch: unknown): AlertPreferences {
  const problem = alertPreferencesProblem(patch);
  if (problem) throw new RequestError(problem);
  const current = getAlertPreferences();
  const p = patch as Partial<AlertPreferences>;
  const next = readAlertPreferences({
    ...current,
    ...p,
    kinds: { ...current.kinds, ...(p.kinds ?? {}) },
  });
  setSetting(KEY, JSON.stringify(next));
  return next;
}

export interface LoggedNotification {
  kind: AlertKind | "test";
  source: string | null;
  title: string;
  body: string;
  url: string;
  delivered: number;
  muted: MuteReason | null;
}

export function logNotification(entry: LoggedNotification) {
  const db = alertsDb();
  db.insert(notificationLog)
    .values({ id: newId(), at: nowIso(), ...entry })
    .run();
  const cutoff = db
    .select({ at: notificationLog.at })
    .from(notificationLog)
    .orderBy(desc(notificationLog.at))
    .limit(1)
    .offset(KEEP_LOG)
    .get();
  if (cutoff) db.delete(notificationLog).where(lt(notificationLog.at, cutoff.at)).run();
}

export const recentNotifications = (kind: string | null, limit = 100) =>
  alertsDb()
    .select()
    .from(notificationLog)
    .where(kind ? eq(notificationLog.kind, kind) : undefined)
    .orderBy(desc(notificationLog.at))
    .limit(limit)
    .all();

export const clearNotifications = () => alertsDb().delete(notificationLog).run().changes;
