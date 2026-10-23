import { asc, eq, sql } from "drizzle-orm";
import { LIVE_POLL_MS } from "@/lib/live-market";
import { RESOLUTIONS } from "@/lib/market-data";
import {
  CONDITION_LABELS,
  MAX_INDICATOR_RULES,
  barsNeeded,
  evaluateRule,
  type IndicatorAlertRule,
} from "@/lib/indicator-alerts";
import { setActiveLocale, tr } from "@/lib/i18n";
import { connectionKey, providerFor } from "../market-data/connections";
import { RequestError } from "../api";
import { getLocale } from "../i18n";
import { newId, nowIso } from "../ids";
import { deliver, type AlertNotification, type DeliveryMeta } from "./delivery";
import { logFailure } from "./log";
import { alertsDb, indicatorAlertRules } from "./store";

/**
 * Indicator alerts in the background (`lib/indicator-alerts.ts`): every 15 seconds the
 * watcher reads the rules switched on, asks each symbol's source for its recent candles at
 * that timeframe's refresh pace (shared by the rules on the same symbol and timeframe),
 * evaluates each rule and notifies through the journal's alert delivery (kind `indicators`).
 * What it evaluated is stored, so a restart neither repeats an alert nor misses the next one;
 * crosses on candles that closed while the server was off are not alerted afterwards.
 */
const TICK_MS = 15_000;
const MIN_POLL_MS = 15_000;

export interface StoredIndicatorRule {
  id: string;
  rule: IndicatorAlertRule;
  enabled: boolean;
  createdAt: string;
  lastBarTime: number | null;
  lastValue: number | null;
  firedBarTime: number | null;
  firedAt: string | null;
  error: string | null;
  checkedAt: string | null;
}

const toStored = (row: typeof indicatorAlertRules.$inferSelect): StoredIndicatorRule | null => {
  try {
    return {
      id: row.id,
      rule: JSON.parse(row.ruleJson) as IndicatorAlertRule,
      enabled: row.enabled === 1,
      createdAt: row.createdAt,
      lastBarTime: row.lastBarTime,
      lastValue: row.lastValue,
      firedBarTime: row.firedBarTime,
      firedAt: row.firedAt,
      error: row.error,
      checkedAt: row.checkedAt,
    };
  } catch {
    return null;
  }
};

export const listIndicatorRules = (): StoredIndicatorRule[] =>
  alertsDb()
    .select()
    .from(indicatorAlertRules)
    .orderBy(asc(indicatorAlertRules.createdAt))
    .all()
    .map(toStored)
    .filter((r): r is StoredIndicatorRule => r !== null);

export function createIndicatorRule(rule: IndicatorAlertRule): string {
  const db = alertsDb();
  const count =
    db
      .select({ n: sql<number>`count(*)` })
      .from(indicatorAlertRules)
      .get()?.n ?? 0;
  if (count >= MAX_INDICATOR_RULES)
    throw new RequestError(`At most ${MAX_INDICATOR_RULES} indicator alerts. Delete one first.`);
  const id = newId();
  db.insert(indicatorAlertRules)
    .values({ id, ruleJson: JSON.stringify(rule), enabled: 1, createdAt: nowIso() })
    .run();
  runningIndicatorAlerts()?.wake();
  return id;
}

/** Switch a rule on or off, or replace it (its evaluation state starts again). */
export function updateIndicatorRule(
  id: string,
  change: { enabled?: boolean; rule?: IndicatorAlertRule },
): boolean {
  const set: Partial<typeof indicatorAlertRules.$inferInsert> = {};
  if (change.enabled !== undefined) set.enabled = change.enabled ? 1 : 0;
  if (change.rule)
    Object.assign(set, {
      ruleJson: JSON.stringify(change.rule),
      lastBarTime: null,
      lastValue: null,
      firedBarTime: null,
      error: null,
    });
  // Switched back on: the first check records where it is, as for a new rule.
  if (change.enabled) Object.assign(set, { lastBarTime: null, error: null });
  const changed =
    alertsDb().update(indicatorAlertRules).set(set).where(eq(indicatorAlertRules.id, id)).run()
      .changes > 0;
  runningIndicatorAlerts()?.wake();
  return changed;
}

export const deleteIndicatorRule = (id: string) =>
  alertsDb().delete(indicatorAlertRules).where(eq(indicatorAlertRules.id, id)).run().changes > 0;

type Bars = { time: number; close: number }[];

export interface IndicatorAlertDeps {
  /** Recent candles of a symbol, oldest first; the forming one included when `forming`. */
  history: (
    rule: IndicatorAlertRule,
    count: number,
    forming: boolean,
    signal: AbortSignal,
  ) => Promise<Bars>;
  deliver: (notification: AlertNotification, meta: DeliveryMeta) => Promise<number>;
  now: () => number;
}

const defaultHistory: IndicatorAlertDeps["history"] = async (rule, count, forming, signal) => {
  const step = RESOLUTIONS[rule.resolution];
  const now = Date.now();
  const result = await providerFor(rule.provider).history(
    {
      symbol: rule.symbol,
      dataset: rule.dataset ?? undefined,
      resolution: rule.resolution,
      from: now - count * step,
      to: now + 1,
      signal,
      forming,
    },
    connectionKey(rule.provider),
  );
  return result.bars.map((b) => ({ time: b.time, close: b.close }));
};

const sourceKey = (r: IndicatorAlertRule) =>
  `${r.provider}|${r.dataset ?? ""}|${r.symbol}|${r.resolution}`;

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not read prices.";

export class IndicatorAlertWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  /** When each symbol and timeframe was last read. */
  private readonly readAt = new Map<string, number>();
  private readonly deps: IndicatorAlertDeps;

  constructor(deps: Partial<IndicatorAlertDeps> = {}) {
    this.deps = { history: defaultHistory, deliver, now: Date.now, ...deps };
  }

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** A rule changed: read its symbol on the next tick, whatever the pace. */
  wake() {
    this.readAt.clear();
    void this.tick();
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const rules = listIndicatorRules().filter((r) => r.enabled);
      const groups = new Map<string, StoredIndicatorRule[]>();
      for (const r of rules)
        groups.set(sourceKey(r.rule), [...(groups.get(sourceKey(r.rule)) ?? []), r]);
      for (const [key, group] of groups) {
        const first = group[0]!.rule;
        const now = this.deps.now();
        const every = Math.max(MIN_POLL_MS, LIVE_POLL_MS[first.resolution]);
        if (now - (this.readAt.get(key) ?? 0) < every) continue;
        this.readAt.set(key, now);
        await this.check(group, now);
      }
    } catch (error) {
      logFailure("checking indicator alerts", error);
    } finally {
      this.busy = false;
    }
  }

  private async check(group: StoredIndicatorRule[], now: number) {
    const first = group[0]!.rule;
    const count = Math.max(...group.map((r) => barsNeeded(r.rule)));
    const forming = group.some((r) => r.rule.trigger === "live");
    let bars: Bars;
    try {
      bars = await this.deps.history(first, count, forming, AbortSignal.timeout(60_000));
    } catch (error) {
      for (const r of group)
        alertsDb()
          .update(indicatorAlertRules)
          .set({ error: message(error), checkedAt: nowIso() })
          .where(eq(indicatorAlertRules.id, r.id))
          .run();
      return;
    }
    for (const r of group) {
      const result = evaluateRule(r.rule, bars, r, now);
      alertsDb()
        .update(indicatorAlertRules)
        .set({
          lastBarTime: result.barTime ?? r.lastBarTime,
          lastValue: result.value,
          error: result.barTime === null ? "Not enough candles yet for this RSI." : null,
          checkedAt: nowIso(),
          ...(result.fired ? { firedBarTime: result.barTime, firedAt: nowIso() } : {}),
        })
        .where(eq(indicatorAlertRules.id, r.id))
        .run();
      if (result.fired && result.value !== null && result.previous !== null)
        await this.fire(r, result.fired, result.value, result.previous, result.close);
    }
  }

  private async fire(
    stored: StoredIndicatorRule,
    direction: "above" | "below",
    value: number,
    previous: number,
    close: number | null,
  ) {
    const { rule } = stored;
    setActiveLocale(getLocale());
    const title = tr("{symbol} {timeframe}: RSI({length}) crossed {direction} {level}", {
      symbol: rule.symbol,
      timeframe: rule.resolution,
      length: rule.length,
      direction: tr(direction === "above" ? "above" : "below"),
      level: rule.level,
    });
    const body = [
      tr("RSI {value} (was {previous}) {when}.", {
        value: value.toFixed(1),
        previous: previous.toFixed(1),
        when: rule.trigger === "close" ? tr("at the candle's close") : tr("on the forming candle"),
      }),
      close !== null ? tr("Price {price}.", { price: close }) : "",
      rule.note,
    ]
      .filter(Boolean)
      .join(" ");
    try {
      await this.deps.deliver(
        { title, body, tag: `indicator-${stored.id}`, url: "/alerts#indicator-alerts" },
        { kind: "indicators", source: `indicator:${stored.id}`, urgent: rule.urgent },
      );
    } catch (error) {
      logFailure(`sending indicator alert ${stored.id}`, error);
    }
  }
}

export const describeIndicatorRule = (rule: IndicatorAlertRule) =>
  `${rule.symbol} ${rule.resolution} RSI(${rule.length}) ${CONDITION_LABELS[rule.condition]} ${rule.level}`;

const shared = globalThis as unknown as { __journalIndicatorAlerts?: IndicatorAlertWatcher };

export function startIndicatorAlerts(): IndicatorAlertWatcher {
  if (!shared.__journalIndicatorAlerts) {
    const watcher = new IndicatorAlertWatcher();
    watcher.start();
    shared.__journalIndicatorAlerts = watcher;
  }
  return shared.__journalIndicatorAlerts;
}

export const runningIndicatorAlerts = () => shared.__journalIndicatorAlerts ?? null;
