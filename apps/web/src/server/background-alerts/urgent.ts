import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { setActiveLocale, tr } from "@/lib/i18n";
import type { AlertKind } from "@/lib/alert-preferences";
import { getLocale } from "../i18n";
import { newId, nowIso } from "../ids";
import { alertsDb, urgentAlerts } from "./store";
import { getAlertPreferences } from "./preferences";
import { logFailure } from "./log";
import type { AlertNotification, DeliveryMeta } from "./delivery";

/**
 * Urgent alerts: recorded when sent, then sent again every few minutes (Alerts page) until
 * acknowledged, at most a set number of times. Open journal pages show them with a sound
 * until acknowledged; opening the notification acknowledges it (its link carries `ack=<id>`).
 */
const CHECK_MS = 30_000;
/** Open journal pages show urgent alerts this recent that nobody acknowledged. */
const SHOW_FOR_MS = 24 * 3_600_000;

/** The notification's link with the acknowledgement parameter. */
export const ackUrl = (url: string, id: string) =>
  `${url}${url.includes("?") ? "&" : "?"}ack=${encodeURIComponent(id)}`;

export function recordUrgent(
  notification: AlertNotification,
  meta: { kind: AlertKind | "test"; source?: string },
): string {
  const id = newId();
  const at = nowIso();
  alertsDb()
    .insert(urgentAlerts)
    .values({
      id,
      kind: meta.kind,
      source: meta.source ?? null,
      title: notification.title,
      body: notification.body,
      url: notification.url,
      tag: notification.tag,
      createdAt: at,
      lastSentAt: at,
    })
    .run();
  return id;
}

export interface PendingUrgent {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  sends: number;
}

/** Urgent alerts of the last day not acknowledged yet, newest first. */
export function pendingUrgent(now = Date.now()): PendingUrgent[] {
  return alertsDb()
    .select({
      id: urgentAlerts.id,
      kind: urgentAlerts.kind,
      title: urgentAlerts.title,
      body: urgentAlerts.body,
      url: urgentAlerts.url,
      createdAt: urgentAlerts.createdAt,
      sends: urgentAlerts.sends,
    })
    .from(urgentAlerts)
    .where(
      and(
        isNull(urgentAlerts.acknowledgedAt),
        gt(urgentAlerts.createdAt, new Date(now - SHOW_FOR_MS).toISOString()),
      ),
    )
    .orderBy(desc(urgentAlerts.createdAt))
    .all();
}

/** Acknowledge one urgent alert (true) or report that it was not pending (false). */
export const acknowledgeUrgent = (id: string) =>
  alertsDb()
    .update(urgentAlerts)
    .set({ acknowledgedAt: nowIso() })
    .where(and(eq(urgentAlerts.id, id), isNull(urgentAlerts.acknowledgedAt)))
    .run().changes > 0;

export const acknowledgeAllUrgent = () =>
  alertsDb()
    .update(urgentAlerts)
    .set({ acknowledgedAt: nowIso() })
    .where(isNull(urgentAlerts.acknowledgedAt))
    .run().changes;

type Deliver = (notification: AlertNotification, meta: DeliveryMeta) => Promise<number>;

/**
 * Send again the urgent alerts that are due: not acknowledged, last sent at least the
 * repeat interval ago, and sent fewer than 1 + the maximum repeats. Each reminder goes through
 * the same preferences (quiet hours and a pause hold it, and the log says so). Returns how many
 * were sent again.
 */
export async function remindUrgent(deliver: Deliver, now = Date.now()): Promise<number> {
  const { repeatMinutes, maxRepeats } = getAlertPreferences().urgent;
  const due = alertsDb()
    .select()
    .from(urgentAlerts)
    .where(
      and(
        isNull(urgentAlerts.acknowledgedAt),
        gt(urgentAlerts.createdAt, new Date(now - SHOW_FOR_MS).toISOString()),
      ),
    )
    .all()
    .filter(
      (row) =>
        row.sends <= maxRepeats && Date.parse(row.lastSentAt) + repeatMinutes * 60_000 <= now,
    );
  if (!due.length) return 0;
  setActiveLocale(getLocale());
  let sent = 0;
  for (const row of due) {
    // Counted before sending: a slow delivery never sends the same reminder twice.
    alertsDb()
      .update(urgentAlerts)
      .set({ lastSentAt: new Date(now).toISOString(), sends: row.sends + 1 })
      .where(eq(urgentAlerts.id, row.id))
      .run();
    try {
      await deliver(
        {
          title: tr("Reminder {n}: {title}", { n: row.sends, title: row.title }),
          body: row.body,
          tag: row.tag,
          url: row.url,
        },
        {
          kind: row.kind as AlertKind | "test",
          source: row.source ?? undefined,
          urgent: true,
          reminderOf: row.id,
        },
      );
      sent++;
    } catch (error) {
      logFailure(`repeating urgent alert ${row.id}`, error);
    }
  }
  return sent;
}

const shared = globalThis as unknown as { __journalUrgentTimer?: ReturnType<typeof setInterval> };

/** Check for due reminders every 30 seconds, once per server process. */
export function startUrgentReminders(deliver: Deliver) {
  if (shared.__journalUrgentTimer) return;
  let busy = false;
  shared.__journalUrgentTimer = setInterval(() => {
    if (busy) return;
    busy = true;
    void remindUrgent(deliver)
      .catch((error: unknown) => logFailure("repeating urgent alerts", error))
      .finally(() => {
        busy = false;
      });
  }, CHECK_MS);
}
