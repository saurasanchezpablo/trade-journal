import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { ImportedExecution } from "@luxalgo/journal-importers";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-account-data-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const {
  db,
  accounts,
  attachments,
  chartAnalyses,
  chartTradeLinks,
  executions,
  importSources,
  importBatches,
  notes,
  trades,
  tradeRuleChecks,
} = await import("../src/db");
const { insertExecutions, listExecutions } = await import("../src/server/executions");
const { POST: accountAction } = await import("../src/app/api/accounts/[id]/actions/route");
const { DELETE: deleteAccount } = await import("../src/app/api/accounts/[id]/route");
const { POST: bulk } = await import("../src/app/api/trades/bulk/route");

const fills = (symbol: string, day = "2026-09-01"): ImportedExecution[] => [
  { symbol, side: "buy", quantity: 1, price: 100, fee: 0, executedAt: `${day}T10:00:00.000Z` },
  { symbol, side: "sell", quantity: 1, price: 110, fee: 0, executedAt: `${day}T11:00:00.000Z` },
];

const json = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Everything that can point at a trade, attached to `key`. */
function annotate(key: string) {
  db.update(trades)
    .set({ notes: "Waited for the retest", rating: 4 })
    .where(eq(trades.key, key))
    .run();
  db.insert(tradeRuleChecks)
    .values({
      id: JSON.stringify([key, "book", "Entry confirmed"]),
      tradeKey: key,
      playbookId: "book",
      rule: "Entry confirmed",
      followed: true,
    })
    .run();
  db.insert(chartTradeLinks)
    .values({ tradeKey: key, analysisId: "analysis", scenarioId: null, createdAt: "2026-09-01" })
    .run();
  db.insert(attachments)
    .values({
      id: `file-${key}`,
      ownerType: "trade",
      ownerId: key,
      name: "entry.png",
      mime: "image/png",
      size: 3,
      data: Buffer.from([1, 2, 3]),
      createdAt: "2026-09-01",
    })
    .run();
  db.insert(notes)
    .values({
      id: `note-${key}`,
      folderId: "my-notes",
      title: "Trade note",
      content: "",
      tradeKey: key,
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    })
    .run();
}

const references = (key: string) => ({
  checks: db
    .select()
    .from(tradeRuleChecks)
    .all()
    .filter((row) => row.tradeKey === key).length,
  links: db
    .select()
    .from(chartTradeLinks)
    .all()
    .filter((row) => row.tradeKey === key).length,
  files: db
    .select()
    .from(attachments)
    .all()
    .filter((row) => row.ownerType === "trade" && row.ownerId === key).length,
  notes: db
    .select()
    .from(notes)
    .all()
    .filter((row) => row.tradeKey === key).length,
});

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  for (const table of [
    tradeRuleChecks,
    chartTradeLinks,
    attachments,
    notes,
    trades,
    executions,
    importBatches,
    importSources,
    chartAnalyses,
    accounts,
  ])
    db.delete(table).run();
  for (const id of ["from", "to"])
    db.insert(accounts).values({ id, name: id, kind: "manual", createdAt: "2026-01-01" }).run();
  db.insert(chartAnalyses)
    .values({
      id: "analysis",
      symbol: "ES",
      provider: "binance",
      resolution: "1h",
      rangeFrom: 0,
      rangeTo: 1,
      drawingsJson: "{}",
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    })
    .run();
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("transferring an account's data", () => {
  it("moves each trade with its notes, rule checks, plan link, files and notebook anchor", async () => {
    insertExecutions("from", fills("ES"), "manual");
    const oldKey = db.select().from(trades).get()!.key;
    annotate(oldKey);

    const response = await accountAction(
      json({ action: "transfer", toAccountId: "to" }),
      params("from"),
    );
    expect(response.status).toBe(200);

    const moved = db.select().from(trades).all();
    expect(moved).toHaveLength(1);
    const newKey = moved[0]!.key;
    expect(moved[0]).toMatchObject({ accountId: "to", notes: "Waited for the retest", rating: 4 });
    expect(references(newKey)).toEqual({ checks: 1, links: 1, files: 1, notes: 1 });
    expect(references(oldKey)).toEqual({ checks: 0, links: 0, files: 0, notes: 0 });
    // The rule check answers the rules endpoint under its new key.
    expect(db.select().from(tradeRuleChecks).get()?.id).toBe(
      JSON.stringify([newKey, "book", "Entry confirmed"]),
    );
  });

  it("refuses with a clear message when fills already exist in the destination, moving nothing", async () => {
    insertExecutions("from", fills("ES"), "manual");
    insertExecutions("to", fills("ES"), "manual");
    const response = await accountAction(
      json({ action: "transfer", toAccountId: "to" }),
      params("from"),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/2 fills are already in the destination/);
    expect(listExecutions("from")).toHaveLength(2);
    expect(listExecutions("to")).toHaveLength(2);
    expect(
      db
        .select()
        .from(trades)
        .all()
        .map((t) => t.accountId)
        .sort(),
    ).toEqual(["from", "to"]);
  });

  it("refuses to transfer an account into itself", async () => {
    insertExecutions("from", fills("ES"), "manual");
    const response = await accountAction(
      json({ action: "transfer", toAccountId: "from" }),
      params("from"),
    );
    expect(response.status).toBe(400);
    expect(db.select().from(trades).all()).toHaveLength(1);
  });
});

describe("clearing or deleting an account", () => {
  it("clearing removes what pointed at its trades and its import history, and keeps the account", async () => {
    insertExecutions("from", fills("ES"), "manual");
    const key = db.select().from(trades).get()!.key;
    annotate(key);
    db.insert(importSources)
      .values({
        id: "src",
        accountId: "from",
        format: "ninjatrader",
        name: "Sim101",
        createdAt: "2026-09-01",
      })
      .run();
    const response = await accountAction(json({ action: "clear" }), params("from"));
    expect(response.status).toBe(200);
    expect(references(key)).toEqual({ checks: 0, links: 0, files: 0, notes: 0 });
    expect(db.select().from(importSources).all()).toHaveLength(0);
    expect(
      db
        .select()
        .from(accounts)
        .all()
        .map((a) => a.id),
    ).toContain("from");
    // Notebook notes stay; they only lose their anchor.
    expect(db.select().from(notes).all()).toHaveLength(1);
  });

  it("deleting removes the account, its trades and their attached files", async () => {
    insertExecutions("from", fills("ES"), "manual");
    const key = db.select().from(trades).get()!.key;
    annotate(key);
    const response = await deleteAccount(new Request("http://localhost/api"), params("from"));
    expect(response.status).toBe(200);
    expect(
      db
        .select()
        .from(accounts)
        .all()
        .map((a) => a.id),
    ).toEqual(["to"]);
    expect(db.select().from(attachments).all()).toHaveLength(0);
    expect(references(key)).toEqual({ checks: 0, links: 0, files: 0, notes: 0 });
  });
});

describe("deleting trades", () => {
  it("removes the deleted trade's rule checks, plan link and files, and leaves other trades alone", async () => {
    insertExecutions("from", [...fills("ES"), ...fills("NQ")], "manual");
    const [es, nq] = ["ES", "NQ"].map(
      (symbol) =>
        db
          .select()
          .from(trades)
          .all()
          .find((t) => t.symbol === symbol)!.key,
    );
    annotate(es!);
    const response = await bulk(json({ action: "delete", keys: [es] }));
    expect(response.status).toBe(200);
    expect(references(es!)).toEqual({ checks: 0, links: 0, files: 0, notes: 0 });
    expect(
      db
        .select()
        .from(trades)
        .all()
        .map((t) => t.key),
    ).toEqual([nq]);
  });

  it("an empty list of fill ids reads no fills, not the whole account", () => {
    insertExecutions("from", fills("ES"), "manual");
    expect(listExecutions("from", [])).toEqual([]);
    expect(listExecutions("from")).toHaveLength(2);
  });
});
