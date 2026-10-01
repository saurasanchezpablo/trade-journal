import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { db } from "@/db";

/**
 * Background alert tables. They belong to this add-on, not to `db/schema.ts`, and are
 * created on first use, so the journal's own schema and upgrades stay untouched. All
 * additive: dropping the add-on leaves the journal's data as it was.
 */
export const alertWatches = sqliteTable("background_alert_watches", {
  /** An analysis whose alerts the server watches while no page is open. */
  analysisId: text("analysis_id").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  /** Which browser, as it described itself. */
  label: text("label").notNull().default(""),
  createdAt: text("created_at").notNull(),
  lastSuccessAt: text("last_success_at"),
  failures: integer("failures").notNull().default(0),
});

export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id"),
    symbol: text("symbol").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    at: text("at").notNull(),
    /** Browsers and webhooks that accepted it. */
    delivered: integer("delivered").notNull().default(0),
  },
  (table) => [index("alert_events_analysis").on(table.analysisId, table.at)],
);

/** Every notification the server sent or held back, whatever raised it (newest kept). */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: text("id").primaryKey(),
    /** `lines`, `zones`, `external`, `digest` or `test`. */
    kind: text("kind").notNull(),
    /** What raised it (`external:<channel id>`), when it has one. */
    source: text("source"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    at: text("at").notNull(),
    /** Browsers and webhooks that accepted it. */
    delivered: integer("delivered").notNull().default(0),
    /** Why it was not sent (`paused`, `quiet`, `kind`, `source`), or null. */
    muted: text("muted"),
  },
  (table) => [index("notification_log_at").on(table.at)],
);

const DDL = `
CREATE TABLE IF NOT EXISTS background_alert_watches (
 analysis_id TEXT PRIMARY KEY REFERENCES chart_analyses(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, last_success_at TEXT, failures INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS alert_events (
 id TEXT PRIMARY KEY, analysis_id TEXT REFERENCES chart_analyses(id) ON DELETE CASCADE,
 symbol TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, at TEXT NOT NULL,
 delivered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alert_events_analysis ON alert_events(analysis_id, at);
CREATE TABLE IF NOT EXISTS notification_log (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT, title TEXT NOT NULL, body TEXT NOT NULL,
 url TEXT NOT NULL, at TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, muted TEXT
);
CREATE INDEX IF NOT EXISTS notification_log_at ON notification_log(at);
-- The watcher polls each watched analysis's save stamp; this answers it without reading rows.
CREATE INDEX IF NOT EXISTS background_alert_stamps ON chart_analyses(id, updated_at);
`;

const ready = new WeakSet<object>();

/** The database, with this add-on's tables in place. */
export function alertsDb() {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db;
}
