import { and, eq, inArray } from "drizzle-orm";
import type { ImportMetadata } from "@luxalgo/journal-core";
import { db, executions, trades } from "@/db";
import { requireValue } from "./api";
import { executionProblem } from "./executions";
import { executionHash, newId, nowIso } from "./ids";
import { rebuildAccount } from "./rebuild";
import { deleteTradeReferences, rekeyTradeReferences } from "./trade-references";
import { getTradeByKey } from "./trades-query";

/**
 * Correcting a trade's fills: a wrong price, quantity, side, fee, time or symbol, a fill
 * that should not be there, or one that is missing. The fills are the source of every trade,
 * so they are what changes; the account is rebuilt in the same transaction and the trade
 * keeps its notes, tags, rating, playbook, stops, rule checks, plan links, files and AI chats
 * even when the correction gives it a new key (its first fill's time, symbol or side).
 *
 * A fill from an import or a broker sync keeps the fingerprint it arrived with, so importing
 * the same statement again does not bring the wrong values back as a second fill; one you
 * remove is remembered (`removed_fills`) for the same reason. Every correction is logged per
 * trade (`fill_corrections`). Both tables belong to this add-on and are made on first use.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS fill_corrections (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL, trade_key TEXT NOT NULL, execution_id TEXT NOT NULL,
 action TEXT NOT NULL, before_json TEXT, after_json TEXT, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS fill_corrections_trade ON fill_corrections(trade_key, at);
CREATE TABLE IF NOT EXISTS removed_fills (
 account_id TEXT NOT NULL, content_hash TEXT NOT NULL, removed_at TEXT NOT NULL,
 PRIMARY KEY (account_id, content_hash)
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

/** What a fill is, as the trade page shows and edits it. */
export interface FillValues {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

/** One row of the corrected list: an existing fill (with its `id`) or a new one. */
export type FillInput = FillValues & { id?: string };

export interface FillCorrection {
  id: string;
  executionId: string;
  action: "edit" | "add" | "remove";
  before: FillValues | null;
  after: FillValues | null;
  at: string;
}

export const MAX_FILLS = 500;
const FIELDS = ["symbol", "side", "quantity", "price", "fee", "executedAt"] as const;
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

const valuesOf = (row: typeof executions.$inferSelect): FillValues => ({
  symbol: row.symbol,
  side: row.side as FillValues["side"],
  quantity: row.quantity,
  price: row.price,
  fee: row.fee,
  executedAt: row.executedAt,
});

/** A row as sent, checked and normalised (trimmed symbol, UTC time), or why it can't be. */
function readFill(value: unknown, index: number): FillInput {
  const row = (value ?? {}) as Partial<Record<keyof FillInput, unknown>>;
  const fill = {
    symbol: typeof row.symbol === "string" ? row.symbol.trim() : "",
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee ?? 0,
    executedAt: typeof row.executedAt === "string" ? row.executedAt.trim() : row.executedAt,
  };
  const problem = executionProblem(fill, "manual");
  requireValue(!problem, `Fill ${index + 1}: ${problem ?? ""}`);
  requireValue(fill.symbol.length <= 100, `Fill ${index + 1}: the symbol is too long.`);
  requireValue(
    row.id === undefined || (typeof row.id === "string" && row.id.length > 0),
    `Fill ${index + 1}: invalid id.`,
  );
  return {
    ...(fill as FillValues),
    executedAt: new Date(fill.executedAt as string).toISOString(),
    ...(typeof row.id === "string" ? { id: row.id } : {}),
  };
}

const sameFill = (a: FillValues, b: FillValues) =>
  FIELDS.every((field) =>
    field === "executedAt" ? Date.parse(a[field]) === Date.parse(b[field]) : a[field] === b[field],
  );

/** Imported or synced fills removed by hand, which an import or sync must not add again. */
export function removedFillHashes(accountId: string): Set<string> {
  return new Set(
    (
      client()
        .prepare("SELECT content_hash AS hash FROM removed_fills WHERE account_id = ?")
        .all(accountId) as { hash: string }[]
    ).map((row) => row.hash),
  );
}

/**
 * Replace a trade's fills with a corrected list: rows with an `id` are that fill (changed or
 * not), rows without one are added, fills left out are removed. Returns the trade's key after
 * the correction (it changes with its first fill's time, symbol or side).
 */
export function correctTradeFills(
  tradeKey: string,
  input: unknown,
): { key: string | null; changed: number } {
  const trade = getTradeByKey(tradeKey);
  requireValue(trade, "Trade not found.");
  requireValue(
    Array.isArray(input) && input.length > 0,
    "A trade needs at least one fill. To remove the trade, delete it instead.",
  );
  requireValue(input.length <= MAX_FILLS, `A trade can have at most ${MAX_FILLS} fills here.`);
  const rows = input.map(readFill);
  const accountId = trade.accountId;
  const ownIds = JSON.parse(trade.executionIdsJson) as string[];
  const current = new Map(
    db
      .select()
      .from(executions)
      .where(and(eq(executions.accountId, accountId), inArray(executions.id, ownIds)))
      .all()
      .map((row) => [row.id, row]),
  );
  const seen = new Set<string>();
  for (const row of rows)
    if (row.id) {
      requireValue(current.has(row.id), "A fill sent is not one of this trade's fills.");
      requireValue(!seen.has(row.id), "The same fill was sent twice.");
      seen.add(row.id);
    }
  const removed = [...current.values()].filter((row) => !seen.has(row.id));
  const changed = rows.filter((row) => row.id && !sameFill(row, valuesOf(current.get(row.id)!)));
  const added = rows.filter((row) => !row.id);
  const total = removed.length + changed.length + added.length;
  if (!total) return { key: tradeKey, changed: 0 };

  const at = nowIso();
  const sql = client();
  const log = sql.prepare(
    "INSERT INTO fill_corrections (id, account_id, trade_key, execution_id, action, before_json, after_json, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  let resultKey: string | null = null;
  db.transaction((tx) => {
    const hashTaken = (hash: string, exceptId: string | null) => {
      const other = tx
        .select({ id: executions.id })
        .from(executions)
        .where(and(eq(executions.accountId, accountId), eq(executions.contentHash, hash)))
        .get();
      return Boolean(other && other.id !== exceptId);
    };
    const before = tx.select().from(trades).where(eq(trades.accountId, accountId)).all();

    for (const fill of removed) {
      tx.delete(executions).where(eq(executions.id, fill.id)).run();
      // An imported or synced fill would come back with the next import of the same file.
      if (fill.source !== "manual")
        sql
          .prepare(
            "INSERT OR IGNORE INTO removed_fills (account_id, content_hash, removed_at) VALUES (?, ?, ?)",
          )
          .run(accountId, fill.contentHash, at);
      log.run(
        newId(),
        accountId,
        tradeKey,
        fill.id,
        "remove",
        JSON.stringify(valuesOf(fill)),
        null,
        at,
      );
    }
    for (const fill of changed) {
      const row = current.get(fill.id!)!;
      let metadata = row.importMetadataJson
        ? (JSON.parse(row.importMetadataJson) as ImportMetadata)
        : undefined;
      // A statement's own P&L for this fill no longer holds once its price, size or side
      // changes: the corrected prices decide it.
      if (
        metadata?.reportedGrossPnl !== undefined &&
        (row.price !== fill.price || row.quantity !== fill.quantity || row.side !== fill.side)
      ) {
        const { reportedGrossPnl: _dropped, ...rest } = metadata;
        metadata = rest;
      }
      // A typed fill is identified by its values; an imported or synced one keeps the
      // fingerprint it arrived with, which is what the next import of it matches.
      const contentHash =
        row.source === "manual"
          ? executionHash({ ...fill, importMetadata: metadata })
          : row.contentHash;
      requireValue(
        !hashTaken(contentHash, row.id),
        `A fill with these values (${fill.side} ${fill.quantity} ${fill.symbol} at ${fill.price}) is already in this account.`,
      );
      tx.update(executions)
        .set({
          symbol: fill.symbol,
          side: fill.side,
          quantity: fill.quantity,
          price: fill.price,
          fee: fill.fee,
          executedAt: fill.executedAt,
          contentHash,
          importMetadataJson: metadata ? JSON.stringify(metadata) : null,
        })
        .where(eq(executions.id, row.id))
        .run();
      log.run(
        newId(),
        accountId,
        tradeKey,
        row.id,
        "edit",
        JSON.stringify(valuesOf(row)),
        JSON.stringify(valuesOf({ ...row, ...fill })),
        at,
      );
    }
    const addedIds: string[] = [];
    for (const fill of added) {
      const values: FillValues = {
        symbol: fill.symbol,
        side: fill.side,
        quantity: fill.quantity,
        price: fill.price,
        fee: fill.fee,
        executedAt: fill.executedAt,
      };
      const contentHash = executionHash(values);
      requireValue(
        !hashTaken(contentHash, null),
        `A fill with these values (${values.side} ${values.quantity} ${values.symbol} at ${values.price}) is already in this account.`,
      );
      const id = newId();
      tx.insert(executions)
        .values({
          id,
          accountId,
          ...values,
          assetClass: trade.assetClass,
          source: "manual",
          importMetadataJson: null,
          contentHash,
          createdAt: at,
        })
        .run();
      addedIds.push(id);
      log.run(newId(), accountId, tradeKey, id, "add", null, JSON.stringify(values), at);
    }

    rebuildAccount(accountId);

    // Each trade that lost its key continues as the trade now holding its fills.
    const after = tx
      .select({ key: trades.key, executionIdsJson: trades.executionIdsJson })
      .from(trades)
      .where(eq(trades.accountId, accountId))
      .all();
    const keys = new Set(after.map((row) => row.key));
    const keyOfFill = new Map<string, string>();
    for (const row of after)
      for (const id of JSON.parse(row.executionIdsJson) as string[]) keyOfFill.set(id, row.key);
    const moved = new Map<string, string>();
    const gone: string[] = [];
    for (const old of before) {
      if (keys.has(old.key)) continue;
      const ids = JSON.parse(old.executionIdsJson) as string[];
      const next = ids.map((id) => keyOfFill.get(id)).find((key) => key !== undefined);
      if (!next) {
        gone.push(old.key);
        continue;
      }
      moved.set(old.key, next);
      // A trade made by the correction takes the annotations whole (its stops would
      // otherwise be the journal's defaults); one that already existed, merged with it,
      // keeps its own and gains only what it had not set.
      const target = tx.select().from(trades).where(eq(trades.key, next)).get();
      const created = !before.some((row) => row.key === next);
      const annotations: Partial<typeof trades.$inferInsert> = {};
      for (const field of ANNOTATIONS)
        if (
          old[field] !== null &&
          old[field] !== "" &&
          (created || target?.[field] === null || target?.[field] === "")
        )
          Object.assign(annotations, { [field]: old[field] });
      if (Object.keys(annotations).length)
        tx.update(trades).set(annotations).where(eq(trades.key, next)).run();
    }
    rekeyTradeReferences(moved);
    deleteTradeReferences(gone);
    for (const [from, to] of moved)
      sql.prepare("UPDATE fill_corrections SET trade_key = ? WHERE trade_key = ?").run(to, from);

    // The trade you corrected, as it is now: under its own key if it kept it.
    if (keys.has(tradeKey)) resultKey = tradeKey;
    else {
      const kept = rows
        .filter((row) => row.id)
        .map((row) => row.id!)
        .concat(addedIds)
        .map((id) => keyOfFill.get(id))
        .find((key) => key !== undefined);
      resultKey = moved.get(tradeKey) ?? kept ?? null;
      if (resultKey && resultKey !== tradeKey && !moved.has(tradeKey)) {
        // The corrected fills now make up a different trade: its history moves along.
        sql
          .prepare("UPDATE fill_corrections SET trade_key = ? WHERE trade_key = ?")
          .run(resultKey, tradeKey);
      }
    }
  });
  return { key: resultKey, changed: total };
}

/** The corrections made to a trade's fills, newest first. */
export function fillCorrections(tradeKey: string): FillCorrection[] {
  const rows = client()
    .prepare(
      "SELECT id, execution_id, action, before_json, after_json, at FROM fill_corrections WHERE trade_key = ? ORDER BY at DESC, rowid DESC LIMIT 200",
    )
    .all(tradeKey) as {
    id: string;
    execution_id: string;
    action: FillCorrection["action"];
    before_json: string | null;
    after_json: string | null;
    at: string;
  }[];
  const parse = (text: string | null) => {
    if (!text) return null;
    try {
      return JSON.parse(text) as FillValues;
    } catch {
      return null;
    }
  };
  return rows.map((row) => ({
    id: row.id,
    executionId: row.execution_id,
    action: row.action,
    before: parse(row.before_json),
    after: parse(row.after_json),
    at: row.at,
  }));
}
