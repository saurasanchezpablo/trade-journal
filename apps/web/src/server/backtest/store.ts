import { backtestReport } from "@luxalgo/journal-core";
import { db } from "@/db";
import {
  readSettings,
  readState,
  type BacktestSession,
  type BacktestSessionSummary,
  type SessionSettings,
} from "@/lib/backtest-session";
import { isResolution, type Resolution } from "@/lib/market-data";
import { newId, nowIso } from "../ids";

/**
 * Replay backtest sessions, in a table of their own (created on first use, like the other
 * add-ons). A session's engine state (position, pending orders, closed trades) is one JSON
 * document: the browser replays and steps the engine, and saves the result.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS backtest_sessions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL, dataset TEXT,
 symbol TEXT NOT NULL, resolution TEXT NOT NULL, start_at INTEGER NOT NULL,
 cursor_at INTEGER NOT NULL, settings_json TEXT NOT NULL, state_json TEXT NOT NULL,
 drawings_json TEXT, notes TEXT NOT NULL DEFAULT '', playbook_id TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
`;
const ready = new WeakSet<object>();
const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

export const MAX_SESSIONS = 200;

interface Row {
  id: string;
  name: string;
  provider: string;
  dataset: string | null;
  symbol: string;
  resolution: string;
  start_at: number;
  cursor_at: number;
  settings_json: string;
  state_json: string;
  drawings_json: string | null;
  notes: string;
  playbook_id: string | null;
  created_at: string;
  updated_at: string;
}

const parse = (text: string | null): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function toSession(row: Row): BacktestSession {
  const settings = readSettings(parse(row.settings_json));
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    dataset: row.dataset,
    symbol: row.symbol,
    resolution: (isResolution(row.resolution) ? row.resolution : "1h") as Resolution,
    startAt: row.start_at,
    cursorAt: row.cursor_at,
    settings,
    state: readState(parse(row.state_json), settings.initialBalance),
    drawings: parse(row.drawings_json),
    notes: row.notes,
    playbookId: row.playbook_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summary(session: BacktestSession): BacktestSessionSummary {
  const report = backtestReport(session.state.trades, session.settings.initialBalance);
  return {
    id: session.id,
    name: session.name,
    provider: session.provider,
    dataset: session.dataset,
    symbol: session.symbol,
    resolution: session.resolution,
    startAt: session.startAt,
    cursorAt: session.cursorAt,
    updatedAt: session.updatedAt,
    initialBalance: session.settings.initialBalance,
    currency: session.settings.currency,
    trades: report.trades,
    netProfit: report.netProfit,
    winRate: report.winRate,
    open: session.state.position !== null,
  };
}

export const listSessions = (): BacktestSessionSummary[] =>
  (client().prepare("SELECT * FROM backtest_sessions ORDER BY updated_at DESC").all() as Row[])
    .map(toSession)
    .map(summary);

export const getSession = (id: string): BacktestSession | null => {
  const row = client().prepare("SELECT * FROM backtest_sessions WHERE id = ?").get(id) as
    Row | undefined;
  return row ? toSession(row) : null;
};

export const countSessions = () =>
  (client().prepare("SELECT COUNT(*) AS n FROM backtest_sessions").get() as { n: number }).n;

export function createSession(input: {
  name: string;
  provider: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
  startAt: number;
  settings: SessionSettings;
  playbookId: string | null;
}): BacktestSession {
  const id = newId();
  const now = nowIso();
  client()
    .prepare(
      `INSERT INTO backtest_sessions (id, name, provider, dataset, symbol, resolution, start_at,
       cursor_at, settings_json, state_json, drawings_json, notes, playbook_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.provider,
      input.dataset,
      input.symbol,
      input.resolution,
      input.startAt,
      input.startAt,
      JSON.stringify(input.settings),
      JSON.stringify(readState(null, input.settings.initialBalance)),
      input.playbookId,
      now,
      now,
    );
  return getSession(id)!;
}

export function updateSession(
  id: string,
  patch: Partial<{
    name: string;
    notes: string;
    cursorAt: number;
    settings: SessionSettings;
    state: unknown;
    drawings: unknown;
    playbookId: string | null;
  }>,
): BacktestSession | null {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.name !== undefined) set("name", patch.name);
  if (patch.notes !== undefined) set("notes", patch.notes);
  if (patch.cursorAt !== undefined) set("cursor_at", patch.cursorAt);
  if (patch.settings !== undefined) set("settings_json", JSON.stringify(patch.settings));
  if (patch.state !== undefined) set("state_json", JSON.stringify(patch.state));
  if (patch.drawings !== undefined)
    set("drawings_json", patch.drawings === null ? null : JSON.stringify(patch.drawings));
  if (patch.playbookId !== undefined) set("playbook_id", patch.playbookId);
  set("updated_at", nowIso());
  const result = client()
    .prepare(`UPDATE backtest_sessions SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, id);
  return result.changes ? getSession(id) : null;
}

export const deleteSession = (id: string) =>
  client().prepare("DELETE FROM backtest_sessions WHERE id = ?").run(id).changes > 0;
