import { and, eq, inArray } from "drizzle-orm";
import { attachments, chartTradeLinks, db, notes, tradeExcursions, tradeRuleChecks } from "@/db";

/**
 * Rows outside the trades table that point at a trade by its key: rule checks, chart plan
 * links, attached files, notebook anchors, saved market estimates and AI chats about the
 * trade. When a trade's key changes (an account transfer) they follow it; when a trade goes
 * away (deleted, or its account cleared) they go with it, so nothing is left pointing at a
 * trade that no longer exists. Call these inside the transaction that changes the trades.
 */

/** Stay below SQLite's bind-parameter limit. */
const CHUNK = 500;
const chunks = <T>(items: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
};

/** The AI chat's conversations live in its own table, created on first use. */
const hasTable = (name: string): boolean =>
  Boolean(
    db.$client.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );

/** Remove what belongs only to these trades; notebook notes stay, without the anchor. */
export function deleteTradeReferences(keys: readonly string[]): void {
  const unique = [...new Set(keys)];
  for (const part of chunks(unique)) {
    db.delete(tradeRuleChecks).where(inArray(tradeRuleChecks.tradeKey, part)).run();
    db.delete(chartTradeLinks).where(inArray(chartTradeLinks.tradeKey, part)).run();
    db.delete(tradeExcursions).where(inArray(tradeExcursions.tradeKey, part)).run();
    db.delete(attachments)
      .where(and(eq(attachments.ownerType, "trade"), inArray(attachments.ownerId, part)))
      .run();
    db.update(notes).set({ tradeKey: null }).where(inArray(notes.tradeKey, part)).run();
  }
}

/**
 * Move references from old keys to new ones. When the new key already has its own rule
 * check or plan link (two trades merged into one), the one already there is kept.
 * Market estimates are not moved: they are fingerprinted by account and currency, so a
 * moved trade is estimated again under its new account.
 */
export function rekeyTradeReferences(keys: ReadonlyMap<string, string>): void {
  const conversations = hasTable("ai_conversations");
  for (const [from, to] of keys) {
    if (from === to) continue;
    for (const check of db
      .select()
      .from(tradeRuleChecks)
      .where(eq(tradeRuleChecks.tradeKey, from))
      .all()) {
      db.insert(tradeRuleChecks)
        .values({
          ...check,
          // Rule checks are identified by trade, strategy and rule (see /api/trades/[key]/rules).
          id: JSON.stringify([to, check.playbookId, check.rule]),
          tradeKey: to,
        })
        .onConflictDoNothing()
        .run();
    }
    db.delete(tradeRuleChecks).where(eq(tradeRuleChecks.tradeKey, from)).run();
    const link = db.select().from(chartTradeLinks).where(eq(chartTradeLinks.tradeKey, from)).get();
    if (link) {
      db.insert(chartTradeLinks)
        .values({ ...link, tradeKey: to })
        .onConflictDoNothing()
        .run();
      db.delete(chartTradeLinks).where(eq(chartTradeLinks.tradeKey, from)).run();
    }
    db.delete(tradeExcursions).where(eq(tradeExcursions.tradeKey, from)).run();
    db.update(attachments)
      .set({ ownerId: to })
      .where(and(eq(attachments.ownerType, "trade"), eq(attachments.ownerId, from)))
      .run();
    db.update(notes).set({ tradeKey: to }).where(eq(notes.tradeKey, from)).run();
    if (conversations)
      db.$client
        .prepare("UPDATE ai_conversations SET anchor = ? WHERE kind = 'trade' AND anchor = ?")
        .run(to, from);
  }
}
