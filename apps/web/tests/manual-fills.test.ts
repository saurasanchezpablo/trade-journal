import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-manual-fills-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, trades } = await import("../src/db");
const { executionHash } = await import("../src/server/ids");
const { POST } = await import("../src/app/api/executions/route");

const leg = (side: "buy" | "sell", executedAt: string) => ({
  symbol: "es",
  side,
  quantity: 1,
  price: side === "buy" ? 100 : 101,
  fee: 0,
  executedAt,
});
const submit = (executions: unknown[]) =>
  POST(
    new Request("http://localhost/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "main", executions }),
    }),
  );

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  db.delete(trades).run();
  db.delete(executions).run();
  db.delete(accounts).run();
  db.insert(accounts)
    .values({ id: "main", name: "Main", kind: "manual", createdAt: "2026-01-01" })
    .run();
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("manually entered fills are exact instants", () => {
  it("refuses a time without an offset, which the server would read in its own timezone", async () => {
    const response = await submit([
      leg("buy", "2026-01-05 10:00"),
      leg("sell", "2026-01-05 11:00"),
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/UTC offset or Z/);
    expect(db.select().from(executions).all()).toHaveLength(0);
  });

  it("stores an offset time as UTC, so the same moment written two ways is one fill", async () => {
    expect(
      (
        await submit([
          leg("buy", "2026-01-05T10:00:00+00:00"),
          leg("sell", "2026-01-05T06:00-05:00"),
        ])
      ).status,
    ).toBe(200);
    expect(
      db
        .select()
        .from(executions)
        .all()
        .map((row) => row.executedAt)
        .sort(),
    ).toEqual(["2026-01-05T10:00:00.000Z", "2026-01-05T11:00:00.000Z"]);
    const again = await submit([leg("buy", "2026-01-05T10:00:00Z")]);
    expect(await again.json()).toMatchObject({ inserted: 0, duplicates: 1 });
  });

  it("keeps the hash of fills the entry form sends unchanged", async () => {
    const form = leg("buy", new Date("2026-01-05T10:00:00Z").toISOString());
    await submit([form]);
    expect(db.select().from(executions).get()?.contentHash).toBe(
      executionHash({ ...form, symbol: "ES" }),
    );
  });
});
