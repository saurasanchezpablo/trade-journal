import { and, eq } from "drizzle-orm";
import {
  accounts,
  db,
  executions,
  importBatches,
  importSourceAliases,
  importSources,
  trades,
} from "@/db";
import { requireValue } from "./api";
import { rebuildAccount } from "./rebuild";
import { deleteTradeReferences, rekeyTradeReferences } from "./trade-references";

const tradeKeysOf = (accountId: string): string[] =>
  db
    .select({ key: trades.key })
    .from(trades)
    .where(eq(trades.accountId, accountId))
    .all()
    .map((row) => row.key);

/**
 * Remove an account's fills and trades, everything that points at those trades, and its
 * import history (sources, aliases and batches), so a cleared account imports like a new one.
 * The account itself stays unless `deleteAccount` is set.
 */
export function clearAccountData(accountId: string, options: { deleteAccount?: boolean } = {}) {
  db.transaction((tx) => {
    deleteTradeReferences(tradeKeysOf(accountId));
    tx.delete(trades).where(eq(trades.accountId, accountId)).run();
    tx.delete(executions).where(eq(executions.accountId, accountId)).run();
    tx.delete(importBatches).where(eq(importBatches.accountId, accountId)).run();
    tx.delete(importSourceAliases).where(eq(importSourceAliases.accountId, accountId)).run();
    tx.delete(importSources).where(eq(importSources.accountId, accountId)).run();
    if (options.deleteAccount) tx.delete(accounts).where(eq(accounts.id, accountId)).run();
  });
}

/** How many of an account's fills already exist in another account (same content hash). */
export function duplicateFillCount(fromId: string, toId: string): number {
  const row = db.$client
    .prepare(
      `SELECT COUNT(*) AS n FROM executions s
       JOIN executions d ON d.account_id = ? AND d.content_hash = s.content_hash
       WHERE s.account_id = ?`,
    )
    .get(toId, fromId) as { n: number };
  return row.n;
}

const ANNOTATIONS = [
  "notes",
  "tagsJson",
  "mistakesJson",
  "playbookId",
  "rating",
  "stopLoss",
  "profitTarget",
  "reviewedAt",
] as const;

/**
 * Move every fill of one account into another and rebuild the destination. Each moved trade
 * keeps its annotations and everything pointing at it (rule checks, plan links, files,
 * notebook anchors, AI chats) under its new key, all in one transaction. Fills the destination
 * already holds would collide with its dedup index, so the move is refused when there are any.
 */
export function transferAccountData(fromId: string, toId: string): { moved: number } {
  requireValue(fromId !== toId, "Choose a different account to transfer into.");
  const duplicates = duplicateFillCount(fromId, toId);
  requireValue(
    duplicates === 0,
    `${duplicates} fill${duplicates === 1 ? " is" : "s are"} already in the destination account, so nothing was moved. Remove the duplicates from one of the accounts first.`,
  );
  let moved = 0;
  db.transaction((tx) => {
    const sourceTrades = tx.select().from(trades).where(eq(trades.accountId, fromId)).all();
    moved = tx
      .update(executions)
      .set({ accountId: toId })
      .where(eq(executions.accountId, fromId))
      .run().changes;
    tx.delete(trades).where(eq(trades.accountId, fromId)).run();
    rebuildAccount(toId);

    // A moved trade is the destination trade that now holds its fills.
    const keyOfFill = new Map<string, string>();
    for (const row of tx
      .select({ key: trades.key, executionIdsJson: trades.executionIdsJson })
      .from(trades)
      .where(eq(trades.accountId, toId))
      .all())
      for (const id of JSON.parse(row.executionIdsJson) as string[]) keyOfFill.set(id, row.key);
    const newKeys = new Map<string, string>();
    for (const source of sourceTrades) {
      const ids = JSON.parse(source.executionIdsJson) as string[];
      const next = ids.map((id) => keyOfFill.get(id)).find((key) => key !== undefined);
      if (!next) continue;
      newKeys.set(source.key, next);
      const annotations: Partial<typeof trades.$inferInsert> = {};
      for (const field of ANNOTATIONS)
        if (source[field] !== null && source[field] !== "")
          Object.assign(annotations, { [field]: source[field] });
      if (Object.keys(annotations).length)
        tx.update(trades)
          .set(annotations)
          .where(and(eq(trades.key, next), eq(trades.accountId, toId)))
          .run();
    }
    rekeyTradeReferences(newKeys);
    deleteTradeReferences(sourceTrades.filter((t) => !newKeys.has(t.key)).map((t) => t.key));
  });
  return { moved };
}
