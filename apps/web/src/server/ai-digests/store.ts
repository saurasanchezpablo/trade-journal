import { db } from "@/db";
import { getSetting, setSetting } from "../settings";
import { newId, nowIso } from "../ids";
import { readDigestSettings, type DigestKind, type DigestSettings } from "./schedule";

/**
 * Scheduled digests, in a table of their own (created on first use, like the other add-ons).
 * One row per kind and period: claiming it first is what keeps a digest from being sent
 * twice, across restarts and dev reloads alike. The text itself is a saved AI chat.
 */

const DDL = `
CREATE TABLE IF NOT EXISTS ai_digests (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, period TEXT NOT NULL,
 status TEXT NOT NULL, conversation_id TEXT, title TEXT NOT NULL DEFAULT '',
 detail TEXT NOT NULL DEFAULT '', delivered INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE (kind, period)
);
CREATE INDEX IF NOT EXISTS ai_digests_updated ON ai_digests(updated_at);
`;

const ready = new WeakSet<object>();
const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

/**
 * Digests this process is writing. A `running` row missing from it was cut short by a restart
 * (the journal runs as one process): it is never left blocking "Send now" or the list. On
 * globalThis because the scheduler and the API routes are separate module graphs in Next.js.
 */
const globalForDigests = globalThis as unknown as { __journalDigestsWriting?: Set<string> };
const writing = (globalForDigests.__journalDigestsWriting ??= new Set<string>());

const SETTINGS_KEY = "aiDigests";
const KEEP = 120;

export function getDigestSettings(): DigestSettings {
  const raw = getSetting(SETTINGS_KEY);
  try {
    return readDigestSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return readDigestSettings({});
  }
}

export const saveDigestSettings = (settings: DigestSettings) =>
  setSetting(SETTINGS_KEY, JSON.stringify(settings));

/**
 * `running` while it is written; `sent` once delivered (to however many devices);
 * `skipped` when there was nothing to review; `failed` with the reason.
 */
export type DigestStatus = "running" | "sent" | "skipped" | "failed";

export interface Digest {
  id: string;
  kind: DigestKind;
  period: string;
  status: DigestStatus;
  conversationId: string | null;
  title: string;
  detail: string;
  delivered: number;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  kind: string;
  period: string;
  status: string;
  conversation_id: string | null;
  title: string;
  detail: string;
  delivered: number;
  created_at: string;
  updated_at: string;
}

const INTERRUPTED = "Interrupted: the server stopped while writing it.";

const toDigest = (row: Row): Digest => {
  const interrupted = row.status === "running" && !writing.has(row.id);
  return {
    id: row.id,
    kind: row.kind === "week" ? "week" : "day",
    period: row.period,
    status: (!interrupted && ["running", "sent", "skipped", "failed"].includes(row.status)
      ? row.status
      : "failed") as DigestStatus,
    conversationId: row.conversation_id,
    title: row.title,
    detail: interrupted ? INTERRUPTED : row.detail,
    delivered: row.delivered,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const getDigest = (kind: DigestKind, period: string): Digest | null => {
  const row = client()
    .prepare("SELECT * FROM ai_digests WHERE kind = ? AND period = ?")
    .get(kind, period) as Row | undefined;
  return row ? toDigest(row) : null;
};

/**
 * Claim a digest for writing; null when it is already claimed. `again` (a manual "send now")
 * takes over a finished or interrupted one, never one this process is still writing.
 */
export function claimDigest(kind: DigestKind, period: string, again = false): Digest | null {
  const sql = client();
  const now = nowIso();
  const claimed = sql.transaction(() => {
    const existing = getDigest(kind, period);
    if (existing) {
      if (!again || existing.status === "running") return null;
      sql
        .prepare(
          "UPDATE ai_digests SET status = 'running', conversation_id = NULL, detail = '', delivered = 0, updated_at = ? WHERE id = ?",
        )
        .run(now, existing.id);
      return existing.id;
    }
    const id = newId();
    sql
      .prepare(
        "INSERT INTO ai_digests (id, kind, period, status, created_at, updated_at) VALUES (?, ?, ?, 'running', ?, ?)",
      )
      .run(id, kind, period, now, now);
    sql
      .prepare(
        "DELETE FROM ai_digests WHERE id IN (SELECT id FROM ai_digests ORDER BY updated_at DESC LIMIT -1 OFFSET ?)",
      )
      .run(KEEP);
    return id;
  })();
  if (!claimed) return null;
  writing.add(claimed);
  return getDigest(kind, period);
}

export function finishDigest(
  id: string,
  result: {
    status: Exclude<DigestStatus, "running">;
    conversationId?: string | null;
    title?: string;
    detail?: string;
    delivered?: number;
  },
) {
  try {
    client()
      .prepare(
        "UPDATE ai_digests SET status = ?, conversation_id = ?, title = ?, detail = ?, delivered = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        result.status,
        result.conversationId ?? null,
        result.title ?? "",
        result.detail ?? "",
        result.delivered ?? 0,
        nowIso(),
        id,
      );
  } finally {
    writing.delete(id);
  }
}

/** Mark as failed every digest left `running` by a server that stopped while writing it. */
export function releaseInterrupted() {
  const sql = client();
  const running = sql.prepare("SELECT id FROM ai_digests WHERE status = 'running'").all() as {
    id: string;
  }[];
  const update = sql.prepare(
    "UPDATE ai_digests SET status = 'failed', detail = ?, updated_at = ? WHERE id = ? AND status = 'running'",
  );
  for (const { id } of running) if (!writing.has(id)) update.run(INTERRUPTED, nowIso(), id);
}

export const listDigests = (limit = 20): Digest[] =>
  (
    client()
      .prepare("SELECT * FROM ai_digests ORDER BY updated_at DESC LIMIT ?")
      .all(Math.min(Math.max(1, limit), KEEP)) as Row[]
  ).map(toDigest);
