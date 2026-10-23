import type { research } from "@luxalgo/journal-core";
import { db } from "@/db";
import { getSetting, setSetting } from "../settings";
import { newId, nowIso } from "../ids";

/**
 * Strategy research storage, in tables of its own (created on first use, like the other
 * add-ons), so the journal's schema and upgrades stay untouched:
 * - `sr_series`, `sr_bars`, `sr_funding`: the market data every result was computed from,
 *   with where it came from and when it was retrieved;
 * - `sr_reports`: each strategy's latest research report (in-sample, walk-forward, holdout),
 *   with the engine, catalog and evaluation versions;
 * - `sr_trials`: every configuration ever evaluated, so the number of trials behind a result
 *   is never forgotten when the catalog changes;
 * - `sr_signals`: the signals recorded by the monitor as they happened (one per strategy and
 *   day, never rewritten); the paper ledger is replayed from them.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS sr_series (
 series TEXT PRIMARY KEY, provider TEXT NOT NULL, endpoint TEXT NOT NULL, symbol TEXT NOT NULL,
 kind TEXT NOT NULL, first_time INTEGER, last_time INTEGER, rows INTEGER NOT NULL DEFAULT 0,
 retrieved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sr_bars (
 series TEXT NOT NULL, time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL,
 low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL,
 PRIMARY KEY (series, time)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sr_funding (
 series TEXT NOT NULL, time INTEGER NOT NULL, rate REAL NOT NULL,
 PRIMARY KEY (series, time)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS sr_reports (
 strategy_id TEXT PRIMARY KEY, report_json TEXT NOT NULL, verdict TEXT NOT NULL,
 data_through INTEGER, engine_version TEXT NOT NULL, catalog_version TEXT NOT NULL,
 evaluation_version TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sr_trials (
 id TEXT PRIMARY KEY, strategy_id TEXT NOT NULL, config_id TEXT NOT NULL,
 catalog_version TEXT NOT NULL, sharpe REAL, run_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sr_trials_strategy ON sr_trials(strategy_id, catalog_version);
CREATE TABLE IF NOT EXISTS sr_signals (
 id TEXT PRIMARY KEY, strategy_id TEXT NOT NULL, config_id TEXT NOT NULL,
 decision_time INTEGER NOT NULL, execute_at INTEGER NOT NULL, generated_at TEXT NOT NULL,
 weights_json TEXT NOT NULL, previous_json TEXT, changed INTEGER NOT NULL,
 reason TEXT NOT NULL DEFAULT '', inputs_json TEXT, alerted INTEGER NOT NULL DEFAULT 0,
 UNIQUE (strategy_id, decision_time)
);
CREATE INDEX IF NOT EXISTS sr_signals_time ON sr_signals(strategy_id, decision_time);
`;
const ready = new WeakSet<object>();
export const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

// ── Settings and state ──

export interface ResearchSettings {
  /** The monitor records signals and the paper ledger; off until you start it. */
  monitoring: boolean;
  /** Commission and slippage, basis points per traded notional. */
  spotFeeBps: number;
  perpFeeBps: number;
  slippageBps: number;
  /**
   * Annual yield on idle capital and the Sharpe ratios' hurdle, in percent. 3 is an
   * assumption (about the 2019-2025 average 3-month US Treasury bill yield), not data.
   */
  cashRatePct: number;
}

export const DEFAULT_RESEARCH: ResearchSettings = {
  monitoring: false,
  spotFeeBps: 10,
  perpFeeBps: 5,
  slippageBps: 5,
  cashRatePct: 3,
};
const SETTINGS_KEY = "strategyResearch";
const STATE_KEY = "strategyResearchState";

export function readResearchSettings(value: unknown): ResearchSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const bps = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 200 ? x : fallback;
  return {
    monitoring: v.monitoring === true,
    spotFeeBps: bps(v.spotFeeBps, DEFAULT_RESEARCH.spotFeeBps),
    perpFeeBps: bps(v.perpFeeBps, DEFAULT_RESEARCH.perpFeeBps),
    slippageBps: bps(v.slippageBps, DEFAULT_RESEARCH.slippageBps),
    cashRatePct:
      typeof v.cashRatePct === "number" &&
      Number.isFinite(v.cashRatePct) &&
      v.cashRatePct >= 0 &&
      v.cashRatePct <= 20
        ? v.cashRatePct
        : DEFAULT_RESEARCH.cashRatePct,
  };
}
export function getResearchSettings(): ResearchSettings {
  try {
    return readResearchSettings(JSON.parse(getSetting(SETTINGS_KEY) ?? "{}"));
  } catch {
    return DEFAULT_RESEARCH;
  }
}
export const saveResearchSettings = (s: ResearchSettings) =>
  setSetting(SETTINGS_KEY, JSON.stringify(s));

export const costsOf = (s: ResearchSettings): research.CostModel => ({
  feeBps: { spot: s.spotFeeBps, perp: s.perpFeeBps },
  slippageBps: { spot: s.slippageBps, perp: s.slippageBps },
  cashRate: s.cashRatePct / 100,
});

/** What the background work did last, shown on the page. */
export interface ResearchState {
  monitoringSince: string | null;
  lastRefreshAt: string | null;
  lastResearchAt: string | null;
  lastMonitorAt: string | null;
  /** The last error of each step (cleared when the step next succeeds). */
  errors: { refresh?: string; research?: string; monitor?: string };
  /** Series behind the expected day when the monitor last ran. */
  stale: string[];
  running: "refresh" | "research" | "monitor" | null;
}
const EMPTY_STATE: ResearchState = {
  monitoringSince: null,
  lastRefreshAt: null,
  lastResearchAt: null,
  lastMonitorAt: null,
  errors: {},
  stale: [],
  running: null,
};
export function getResearchState(): ResearchState {
  try {
    return {
      ...EMPTY_STATE,
      ...(JSON.parse(getSetting(STATE_KEY) ?? "{}") as Partial<ResearchState>),
    };
  } catch {
    return EMPTY_STATE;
  }
}
export function updateResearchState(change: Partial<ResearchState>) {
  const next = { ...getResearchState(), ...change };
  setSetting(STATE_KEY, JSON.stringify(next));
  return next;
}

// ── Market data ──

export interface SeriesInfo {
  series: string;
  provider: string;
  endpoint: string;
  symbol: string;
  kind: string;
  firstTime: number | null;
  lastTime: number | null;
  rows: number;
  retrievedAt: string;
}

export function listSeries(): SeriesInfo[] {
  return client()
    .prepare(
      "SELECT series, provider, endpoint, symbol, kind, first_time AS firstTime, last_time AS lastTime, rows, retrieved_at AS retrievedAt FROM sr_series ORDER BY series",
    )
    .all() as SeriesInfo[];
}

export const lastTime = (series: string): number | null =>
  (
    client().prepare("SELECT last_time AS t FROM sr_series WHERE series = ?").get(series) as
      { t: number | null } | undefined
  )?.t ?? null;

/** Store bars (a bar already stored for that day is replaced) and the series' provenance. */
export function saveBars(
  info: Pick<SeriesInfo, "series" | "provider" | "endpoint" | "symbol" | "kind">,
  bars: readonly research.DailyBar[],
) {
  const c = client();
  const insert = c.prepare(
    "INSERT OR REPLACE INTO sr_bars (series, time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  c.transaction(() => {
    for (const b of bars) insert.run(info.series, b.time, b.open, b.high, b.low, b.close, b.volume);
    touchSeries(info, "sr_bars");
  })();
}

export function saveFunding(
  info: Pick<SeriesInfo, "series" | "provider" | "endpoint" | "symbol" | "kind">,
  events: readonly research.FundingEvent[],
) {
  const c = client();
  const insert = c.prepare(
    "INSERT OR REPLACE INTO sr_funding (series, time, rate) VALUES (?, ?, ?)",
  );
  c.transaction(() => {
    for (const e of events) insert.run(info.series, e.time, e.rate);
    touchSeries(info, "sr_funding");
  })();
}

function touchSeries(
  info: Pick<SeriesInfo, "series" | "provider" | "endpoint" | "symbol" | "kind">,
  table: "sr_bars" | "sr_funding",
) {
  const c = client();
  const span = c
    .prepare(
      `SELECT MIN(time) AS first, MAX(time) AS last, COUNT(*) AS n FROM ${table} WHERE series = ?`,
    )
    .get(info.series) as { first: number | null; last: number | null; n: number };
  c.prepare(
    `INSERT INTO sr_series (series, provider, endpoint, symbol, kind, first_time, last_time, rows, retrieved_at)
     VALUES (@series, @provider, @endpoint, @symbol, @kind, @first, @last, @n, @at)
     ON CONFLICT(series) DO UPDATE SET provider = excluded.provider, endpoint = excluded.endpoint,
       first_time = excluded.first_time, last_time = excluded.last_time, rows = excluded.rows,
       retrieved_at = excluded.retrieved_at`,
  ).run({ ...info, first: span.first, last: span.last, n: span.n, at: nowIso() });
}

export const loadBars = (series: string): research.DailyBar[] =>
  client()
    .prepare(
      "SELECT time, open, high, low, close, volume FROM sr_bars WHERE series = ? ORDER BY time",
    )
    .all(series) as research.DailyBar[];

export const loadFunding = (series: string): research.FundingEvent[] =>
  client()
    .prepare("SELECT time, rate FROM sr_funding WHERE series = ? ORDER BY time")
    .all(series) as research.FundingEvent[];

// ── Reports and trials ──

export function saveReport(report: research.StrategyReport) {
  const c = client();
  c.transaction(() => {
    c.prepare(
      `INSERT OR REPLACE INTO sr_reports (strategy_id, report_json, verdict, data_through, engine_version, catalog_version, evaluation_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      report.strategyId,
      JSON.stringify(report),
      report.verdict,
      report.dataThrough,
      report.engineVersion,
      report.catalogVersion,
      report.evaluationVersion,
      nowIso(),
    );
    const insert = c.prepare(
      "INSERT INTO sr_trials (id, strategy_id, config_id, catalog_version, sharpe, run_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const at = nowIso();
    for (const config of report.configs)
      insert.run(newId(), report.strategyId, config.id, report.catalogVersion, config.sharpe, at);
  })();
}

export interface StoredReport {
  report: research.StrategyReport;
  createdAt: string;
}

export function loadReport(strategyId: string): StoredReport | null {
  const row = client()
    .prepare(
      "SELECT report_json AS json, created_at AS createdAt FROM sr_reports WHERE strategy_id = ?",
    )
    .get(strategyId) as { json: string; createdAt: string } | undefined;
  if (!row) return null;
  try {
    return { report: JSON.parse(row.json) as research.StrategyReport, createdAt: row.createdAt };
  } catch {
    return null;
  }
}

/** Distinct configurations ever evaluated for a strategy, over every catalog version. */
export function trialCount(strategyId: string): { distinct: number; runs: number } {
  const row = client()
    .prepare(
      "SELECT COUNT(DISTINCT catalog_version || ':' || config_id) AS configs, COUNT(*) AS runs FROM sr_trials WHERE strategy_id = ?",
    )
    .get(strategyId) as { configs: number; runs: number };
  return { distinct: row.configs, runs: row.runs };
}

// ── Signals ──

export interface SignalRow {
  id: string;
  strategyId: string;
  configId: string;
  decisionTime: number;
  executeAt: number;
  generatedAt: string;
  weights: Record<string, number>;
  previous: Record<string, number> | null;
  changed: boolean;
  reason: string;
  inputs: Record<string, number | string | null> | null;
  alerted: boolean;
}

const parse = <T>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

type RawSignal = Omit<SignalRow, "weights" | "previous" | "inputs" | "changed" | "alerted"> & {
  weights: string;
  previous: string | null;
  inputs: string | null;
  changed: number;
  alerted: number;
};
const toSignal = (r: RawSignal): SignalRow => ({
  ...r,
  weights: parse(r.weights, {}),
  previous: parse(r.previous, null),
  inputs: parse(r.inputs, null),
  changed: r.changed === 1,
  alerted: r.alerted === 1,
});
const SIGNAL_COLUMNS =
  "id, strategy_id AS strategyId, config_id AS configId, decision_time AS decisionTime, execute_at AS executeAt, generated_at AS generatedAt, weights_json AS weights, previous_json AS previous, changed, reason, inputs_json AS inputs, alerted";

export function listSignals(strategyId: string, limit = 5000): SignalRow[] {
  return (
    client()
      .prepare(
        `SELECT ${SIGNAL_COLUMNS} FROM sr_signals WHERE strategy_id = ? ORDER BY decision_time DESC LIMIT ?`,
      )
      .all(strategyId, limit) as RawSignal[]
  )
    .map(toSignal)
    .reverse();
}

export function lastSignal(strategyId: string): SignalRow | null {
  const row = client()
    .prepare(
      `SELECT ${SIGNAL_COLUMNS} FROM sr_signals WHERE strategy_id = ? ORDER BY decision_time DESC LIMIT 1`,
    )
    .get(strategyId) as RawSignal | undefined;
  return row ? toSignal(row) : null;
}

/** Record a signal; a second one for the same strategy and day is ignored (returns false). */
export function insertSignal(signal: Omit<SignalRow, "id" | "alerted">): boolean {
  const result = client()
    .prepare(
      `INSERT OR IGNORE INTO sr_signals (id, strategy_id, config_id, decision_time, execute_at, generated_at, weights_json, previous_json, changed, reason, inputs_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      signal.strategyId,
      signal.configId,
      signal.decisionTime,
      signal.executeAt,
      signal.generatedAt,
      JSON.stringify(signal.weights),
      signal.previous ? JSON.stringify(signal.previous) : null,
      signal.changed ? 1 : 0,
      signal.reason,
      signal.inputs ? JSON.stringify(signal.inputs) : null,
    );
  return result.changes > 0;
}

export const markAlerted = (strategyId: string, decisionTime: number) =>
  client()
    .prepare("UPDATE sr_signals SET alerted = 1 WHERE strategy_id = ? AND decision_time = ?")
    .run(strategyId, decisionTime);

/** Signals changed but not yet alerted (an alert that failed is retried on the next run). */
export function pendingAlerts(): SignalRow[] {
  return (
    client()
      .prepare(
        `SELECT ${SIGNAL_COLUMNS} FROM sr_signals WHERE changed = 1 AND alerted = 0 ORDER BY decision_time`,
      )
      .all() as RawSignal[]
  ).map(toSignal);
}

/** Forget the recorded signals (the paper ledger starts again from the next run). */
export const clearSignals = () => client().prepare("DELETE FROM sr_signals").run();
