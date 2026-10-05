import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { ImportedExecution } from "@luxalgo/journal-importers";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-fill-corrections-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, trades, tradeRuleChecks } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const fillsRoute = await import("../src/app/api/trades/[key]/fills/route");

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  db.delete(tradeRuleChecks).run();
  db.delete(trades).run();
  db.delete(executions).run();
  db.delete(accounts).run();
  db.$client.exec("DELETE FROM removed_fills; DELETE FROM fill_corrections;");
  db.insert(accounts)
    .values({ id: "acc", name: "Test", kind: "manual", createdAt: "2026-01-01" })
    .run();
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

// The tables are made on first use; make them before the first cleanup.
await import("../src/server/fill-corrections").then((m) => m.removedFillHashes("none"));

const fills: ImportedExecution[] = [
  {
    symbol: "ES",
    side: "buy",
    quantity: 2,
    price: 100,
    fee: 1,
    executedAt: "2026-09-01T10:00:00Z",
  },
  {
    symbol: "ES",
    side: "sell",
    quantity: 2,
    price: 110,
    fee: 1,
    executedAt: "2026-09-01T11:00:00Z",
  },
];

const only = () => {
  const all = db.select().from(trades).all();
  expect(all).toHaveLength(1);
  return all[0]!;
};
const fillsOf = (key: string) => {
  const ids = JSON.parse(
    db
      .select()
      .from(trades)
      .all()
      .find((t) => t.key === key)!.executionIdsJson,
  ) as string[];
  return db
    .select()
    .from(executions)
    .all()
    .filter((e) => ids.includes(e.id))
    .sort((a, b) => a.executedAt.localeCompare(b.executedAt));
};
const values = (row: typeof executions.$inferSelect) => ({
  id: row.id,
  symbol: row.symbol,
  side: row.side,
  quantity: row.quantity,
  price: row.price,
  fee: row.fee,
  executedAt: row.executedAt,
});
const put = async (key: string, body: unknown) => {
  const response = await fillsRoute.PUT(
    new Request("http://journal.test/api/trades/x/fills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fills: body }),
    }),
    { params: Promise.resolve({ key }) },
  );
  return { status: response.status, body: await response.json() };
};
const corrections = async (key: string) =>
  (
    await (
      await fillsRoute.GET(new Request("http://journal.test"), {
        params: Promise.resolve({ key }),
      })
    ).json()
  ).corrections;

describe("correcting a trade's fills", () => {
  it("a wrong exit price is fixed and the trade's result follows, notes and tags kept", async () => {
    insertExecutions("acc", fills, "manual");
    const trade = only();
    db.update(trades)
      .set({ notes: "Good patience", tagsJson: '["breakout"]', rating: 4 })
      .where(eq(trades.key, trade.key))
      .run();
    const [entry, exit] = fillsOf(trade.key);
    const result = await put(trade.key, [values(entry!), { ...values(exit!), price: 105 }]);
    expect(result).toMatchObject({ status: 200, body: { key: trade.key, changed: 1 } });
    expect(only()).toMatchObject({
      key: trade.key,
      grossPnl: 2 * 5,
      notes: "Good patience",
      tagsJson: '["breakout"]',
      rating: 4,
    });
    const log = await corrections(trade.key);
    expect(log[0]).toMatchObject({
      action: "edit",
      before: { price: 110 },
      after: { price: 105 },
    });
  });

  it("a wrong entry time moves the trade to its new key with everything attached to it", async () => {
    insertExecutions("acc", fills, "manual");
    const trade = only();
    db.update(trades)
      .set({ notes: "Keep me", stopLoss: 95 })
      .where(eq(trades.key, trade.key))
      .run();
    db.insert(tradeRuleChecks)
      .values({
        id: JSON.stringify([trade.key, "pb", "rule"]),
        tradeKey: trade.key,
        playbookId: "pb",
        rule: "rule",
        followed: true,
      })
      .run();
    const [entry, exit] = fillsOf(trade.key);
    const result = await put(trade.key, [
      { ...values(entry!), executedAt: "2026-09-01T09:30:00Z" },
      values(exit!),
    ]);
    const moved = only();
    expect(moved.key).not.toBe(trade.key);
    expect(result.body.key).toBe(moved.key);
    expect(moved).toMatchObject({
      notes: "Keep me",
      stopLoss: 95,
      openedAt: "2026-09-01T09:30:00.000Z",
    });
    expect(
      db
        .select()
        .from(tradeRuleChecks)
        .all()
        .map((c) => c.tradeKey),
    ).toEqual([moved.key]);
    // The correction log follows the trade.
    expect(await corrections(moved.key)).toHaveLength(1);
  });

  it("a missing partial exit is added and a fill that should not be there is removed", async () => {
    insertExecutions("acc", fills, "manual");
    const trade = only();
    const [entry, exit] = fillsOf(trade.key);
    await put(trade.key, [
      values(entry!),
      { ...values(exit!), quantity: 1 },
      {
        symbol: "ES",
        side: "sell",
        quantity: 1,
        price: 108,
        fee: 1,
        executedAt: "2026-09-01T10:30:00Z",
      },
    ]);
    expect(only()).toMatchObject({ quantity: 2, executionCount: 3, status: "win" });
    const three = fillsOf(only().key);
    await put(only().key, three.filter((f) => f.price !== 108).map(values));
    expect(only()).toMatchObject({ executionCount: 2, openQuantity: 1, status: "open" });
    expect((await corrections(only().key)).map((c: { action: string }) => c.action)).toEqual([
      "remove",
      "add",
      "edit",
    ]);
  });

  it("an imported fill stays corrected, and stays removed, when the same file is imported again", async () => {
    insertExecutions("acc", fills, "import");
    const trade = only();
    const [entry, exit] = fillsOf(trade.key);
    await put(trade.key, [values(entry!), { ...values(exit!), price: 105 }]);
    expect(insertExecutions("acc", fills, "import")).toMatchObject({ inserted: 0, duplicates: 2 });
    expect(only().grossPnl).toBe(2 * 5);
    expect(db.select().from(executions).all()).toHaveLength(2);
  });

  it("a removed imported fill does not come back with the next import", async () => {
    // Bought 3, sold 2 then 1: one trade with a partial exit.
    const three = [
      { ...fills[0]!, quantity: 3 },
      fills[1]!,
      { ...fills[1]!, quantity: 1, price: 120, executedAt: "2026-09-01T12:00:00Z" },
    ];
    insertExecutions("acc", three, "import");
    const trade = only();
    const kept = fillsOf(trade.key).filter((f) => f.price !== 120);
    await put(trade.key, kept.map(values));
    expect(db.select().from(executions).all()).toHaveLength(2);
    expect(insertExecutions("acc", three, "import")).toMatchObject({ inserted: 0, duplicates: 3 });
    expect(db.select().from(executions).all()).toHaveLength(2);
    // Typed back by hand, it is welcome.
    expect(insertExecutions("acc", [three[2]!], "manual").inserted).toBe(1);
  });

  it("refuses an empty trade, a fill from another trade, a duplicate and a bad value", async () => {
    insertExecutions("acc", fills, "manual");
    insertExecutions(
      "acc",
      [
        { ...fills[0]!, symbol: "NQ" },
        { ...fills[1]!, symbol: "NQ" },
      ],
      "manual",
    );
    const es = db
      .select()
      .from(trades)
      .all()
      .find((t) => t.symbol === "ES")!;
    const nq = db
      .select()
      .from(trades)
      .all()
      .find((t) => t.symbol === "NQ")!;
    const [entry, exit] = fillsOf(es.key);
    const [nqEntry] = fillsOf(nq.key);
    expect((await put(es.key, [])).status).toBe(400);
    expect((await put(es.key, [values(entry!), values(nqEntry!)])).status).toBe(400);
    // Making this exit identical to the other trade's exit would duplicate it.
    const clash = await put(es.key, [values(entry!), { ...values(exit!), symbol: "NQ" }]);
    expect(clash.status).toBe(400);
    expect(clash.body.error).toMatch(/already in this account/);
    expect((await put(es.key, [values(entry!), { ...values(exit!), quantity: 0 }])).status).toBe(
      400,
    );
    expect(
      (await put(es.key, [values(entry!), { ...values(exit!), executedAt: "2026-09-01 11:00" }]))
        .status,
    ).toBe(400);
    // Nothing changed.
    expect(fillsOf(es.key).map((f) => f.price)).toEqual([100, 110]);
    expect(await corrections(es.key)).toEqual([]);
  });

  it("saving the fills unchanged changes nothing", async () => {
    insertExecutions("acc", fills, "manual");
    const trade = only();
    const result = await put(trade.key, fillsOf(trade.key).map(values));
    expect(result.body).toEqual({ key: trade.key, changed: 0 });
  });
});
