import type { AnalysisFilters } from "@luxalgo/journal-core";
import { db } from "@/db";
import { newId, nowIso } from "../ids";

/**
 * Saved AI conversations, in tables of their own (created on first use, like the other
 * add-ons) so the journal's schema and upgrades stay untouched. A conversation keeps the
 * filter snapshot it was opened with: follow-ups always answer within that scope, whatever
 * the page's filters are later.
 */

const DDL = `
CREATE TABLE IF NOT EXISTS ai_conversations (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, anchor TEXT,
 filters_json TEXT NOT NULL, scope_label TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_conversations_updated ON ai_conversations(updated_at);
CREATE INDEX IF NOT EXISTS ai_conversations_anchor ON ai_conversations(kind, anchor);
CREATE TABLE IF NOT EXISTS ai_messages (
 id TEXT PRIMARY KEY,
 conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
 role TEXT NOT NULL, content TEXT NOT NULL, tools_json TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'done', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation ON ai_messages(conversation_id, created_at);
`;

const ready = new WeakSet<object>();
const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

/** Oldest conversations beyond this are removed when a new one starts. */
export const MAX_CONVERSATIONS = 200;
/** A conversation this long asks for a new one instead of growing without bound. */
export const MAX_MESSAGES = 60;

/** What a conversation is about: the journal (filtered), one day, or one trade. */
export type ConversationKind = "journal" | "day" | "trade";

export interface ToolActivity {
  name: string;
  label: string;
  /** False when the tool answered with an error the model had to work around. */
  ok: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolActivity[];
  /** `stopped`: the trader stopped it; `error`: the provider failed part way. */
  status: "done" | "stopped" | "error";
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  kind: ConversationKind;
  /** The day (YYYY-MM-DD) or trade key it is about. */
  anchor: string | null;
  filters: AnalysisFilters;
  scopeLabel: string;
  createdAt: string;
  updatedAt: string;
}

interface ConversationRow {
  id: string;
  title: string;
  kind: string;
  anchor: string | null;
  filters_json: string;
  scope_label: string;
  created_at: string;
  updated_at: string;
}

const parseObject = (json: string): Record<string, string> => {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

const toConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  title: row.title,
  kind: (["journal", "day", "trade"].includes(row.kind) ? row.kind : "journal") as ConversationKind,
  anchor: row.anchor,
  filters: parseObject(row.filters_json),
  scopeLabel: row.scope_label,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const parseTools = (json: string): ToolActivity[] => {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value)
      ? value.filter(
          (t): t is ToolActivity =>
            !!t && typeof t === "object" && typeof (t as ToolActivity).label === "string",
        )
      : [];
  } catch {
    return [];
  }
};

/** A title from the first question: its first line, shortened at a word. */
export function titleFrom(question: string): string {
  const line = question.trim().split("\n")[0]!.replace(/\s+/g, " ");
  if (line.length <= 80) return line;
  const cut = line.slice(0, 80);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 80)}…`;
}

export function createConversation(input: {
  title: string;
  kind: ConversationKind;
  anchor: string | null;
  filters: AnalysisFilters;
  scopeLabel: string;
}): Conversation {
  const sql = client();
  const now = nowIso();
  const row: ConversationRow = {
    id: newId(),
    title: input.title,
    kind: input.kind,
    anchor: input.anchor,
    filters_json: JSON.stringify(input.filters),
    scope_label: input.scopeLabel,
    created_at: now,
    updated_at: now,
  };
  sql
    .prepare(
      "DELETE FROM ai_conversations WHERE id IN (SELECT id FROM ai_conversations ORDER BY updated_at DESC LIMIT -1 OFFSET ?)",
    )
    .run(MAX_CONVERSATIONS - 1);
  sql
    .prepare(
      "INSERT INTO ai_conversations (id, title, kind, anchor, filters_json, scope_label, created_at, updated_at) VALUES (@id, @title, @kind, @anchor, @filters_json, @scope_label, @created_at, @updated_at)",
    )
    .run(row);
  return toConversation(row);
}

export function getConversation(id: string): Conversation | null {
  const row = client().prepare("SELECT * FROM ai_conversations WHERE id = ?").get(id) as
    ConversationRow | undefined;
  return row ? toConversation(row) : null;
}

export function listConversations(
  options: { kind?: ConversationKind; anchor?: string; limit?: number } = {},
): (Conversation & { messages: number })[] {
  const rows = client()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) AS messages
       FROM ai_conversations c
       WHERE (@kind IS NULL OR c.kind = @kind) AND (@anchor IS NULL OR c.anchor = @anchor)
       ORDER BY c.updated_at DESC LIMIT @limit`,
    )
    .all({
      kind: options.kind ?? null,
      anchor: options.anchor ?? null,
      limit: Math.min(Math.max(1, options.limit ?? 50), MAX_CONVERSATIONS),
    }) as (ConversationRow & { messages: number })[];
  return rows.map((row) => ({ ...toConversation(row), messages: row.messages }));
}

export function listMessages(conversationId: string): ChatMessage[] {
  const rows = client()
    .prepare(
      "SELECT id, role, content, tools_json, status, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at, rowid",
    )
    .all(conversationId) as {
    id: string;
    role: string;
    content: string;
    tools_json: string;
    status: string;
    created_at: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    tools: parseTools(row.tools_json),
    status: row.status === "stopped" || row.status === "error" ? row.status : "done",
    createdAt: row.created_at,
  }));
}

export function addMessage(
  conversationId: string,
  message: Pick<ChatMessage, "role" | "content"> & Partial<Pick<ChatMessage, "tools" | "status">>,
): ChatMessage {
  const sql = client();
  const saved: ChatMessage = {
    id: newId(),
    role: message.role,
    content: message.content,
    tools: message.tools ?? [],
    status: message.status ?? "done",
    createdAt: nowIso(),
  };
  sql
    .prepare(
      "INSERT INTO ai_messages (id, conversation_id, role, content, tools_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      saved.id,
      conversationId,
      saved.role,
      saved.content,
      JSON.stringify(saved.tools),
      saved.status,
      saved.createdAt,
    );
  sql
    .prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?")
    .run(saved.createdAt, conversationId);
  return saved;
}

export const messageCount = (conversationId: string): number =>
  (
    client()
      .prepare("SELECT COUNT(*) AS n FROM ai_messages WHERE conversation_id = ?")
      .get(conversationId) as { n: number }
  ).n;

export const renameConversation = (id: string, title: string): boolean =>
  client()
    .prepare("UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?")
    .run(title, nowIso(), id).changes > 0;

export function deleteConversation(id: string): boolean {
  const sql = client();
  sql.prepare("DELETE FROM ai_messages WHERE conversation_id = ?").run(id);
  return sql.prepare("DELETE FROM ai_conversations WHERE id = ?").run(id).changes > 0;
}
