import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
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

/**
 * Indicator alert rules watched in the background (RSI for now), with what the watcher last
 * evaluated, so a restart neither repeats an alert nor reads a candle twice.
 */
export const indicatorAlertRules = sqliteTable("indicator_alert_rules", {
  id: text("id").primaryKey(),
  /** The rule as saved (`IndicatorAlertRule` without its id), JSON. */
  ruleJson: text("rule_json").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: text("created_at").notNull(),
  /** The candle (open time) last evaluated, and its value. */
  lastBarTime: integer("last_bar_time"),
  lastValue: real("last_value"),
  /** The candle that last fired (at most one alert per candle), and when. */
  firedBarTime: integer("fired_bar_time"),
  firedAt: text("fired_at"),
  /** The last check's problem (source off, symbol unknown), cleared when one succeeds. */
  error: text("error"),
  checkedAt: text("checked_at"),
});

/**
 * Urgent alerts not yet acknowledged: each is sent again every few minutes until you
 * acknowledge it (from the notification, an open journal page or the Alerts page).
 */
export const urgentAlerts = sqliteTable(
  "urgent_alerts",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    source: text("source"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Where the notification opens, without the acknowledgement parameter. */
    url: text("url").notNull(),
    tag: text("tag").notNull(),
    createdAt: text("created_at").notNull(),
    lastSentAt: text("last_sent_at").notNull(),
    /** Times sent, the first included. */
    sends: integer("sends").notNull().default(1),
    acknowledgedAt: text("acknowledged_at"),
  },
  (table) => [index("urgent_alerts_open").on(table.acknowledgedAt, table.lastSentAt)],
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
CREATE TABLE IF NOT EXISTS indicator_alert_rules (
 id TEXT PRIMARY KEY, rule_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, last_bar_time INTEGER, last_value REAL, fired_bar_time INTEGER,
 fired_at TEXT, error TEXT, checked_at TEXT
);
CREATE TABLE IF NOT EXISTS urgent_alerts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT, title TEXT NOT NULL, body TEXT NOT NULL,
 url TEXT NOT NULL, tag TEXT NOT NULL, created_at TEXT NOT NULL, last_sent_at TEXT NOT NULL,
 sends INTEGER NOT NULL DEFAULT 1, acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS urgent_alerts_open ON urgent_alerts(acknowledged_at, last_sent_at);
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
