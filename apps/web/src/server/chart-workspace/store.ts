import { db } from "@/db";
import { nowIso } from "../ids";

/**
 * The chart workspace's saved state (Vela's state document: layout, charts, drawings,
 * indicators, links), in a table of its own created on first use. One workspace, saved on
 * the server so it opens the same in every browser.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS chart_workspaces (
 id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at TEXT NOT NULL
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

const MAIN = "main";

export function readWorkspace(): { state: string; updatedAt: string } | null {
  const row = client()
    .prepare("SELECT state_json, updated_at FROM chart_workspaces WHERE id = ?")
    .get(MAIN) as { state_json: string; updated_at: string } | undefined;
  return row ? { state: row.state_json, updatedAt: row.updated_at } : null;
}

/** Save the workspace; the caller has checked the document (`workspaceStateProblem`). */
export function writeWorkspace(state: string): string {
  const at = nowIso();
  client()
    .prepare(
      `INSERT INTO chart_workspaces (id, state_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
    )
    .run(MAIN, state, at);
  return at;
}

export function clearWorkspace(): boolean {
  return client().prepare("DELETE FROM chart_workspaces WHERE id = ?").run(MAIN).changes > 0;
}
