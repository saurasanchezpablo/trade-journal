import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatMultipliers, parseMultipliers, sameMultipliers } from "../src/lib/multipliers";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-multipliers-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, trades } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { PATCH } = await import("../src/app/api/settings/route");

const save = async (body: unknown) => {
  const response = await PATCH(
    new Request("http://localhost/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
  );
  return { status: response.status, body: await response.json() };
};

beforeAll(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  db.insert(accounts)
    .values({ id: "main", name: "Main", kind: "manual", createdAt: "2026-01-01" })
    .run();
  insertExecutions(
    "main",
    [
      {
        symbol: "ES",
        side: "buy",
        quantity: 1,
        price: 5000,
        fee: 0,
        executedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        symbol: "ES",
        side: "sell",
        quantity: 1,
        price: 5010,
        fee: 0,
        executedAt: "2026-09-01T11:00:00.000Z",
      },
    ],
    "manual",
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("contract multiplier lines", () => {
  it("reports lines it cannot read instead of dropping them", () => {
    expect(parseMultipliers("ES=50\nES: 50\nNQ=20,0\n\nMES = 5\nCL=0\nGC=1=2")).toEqual({
      multipliers: { ES: 50, MES: 5 },
      invalid: ["ES: 50", "NQ=20,0", "CL=0", "GC=1=2"],
    });
  });

  it("reads back what it writes", () => {
    const multipliers = { ES: 50, NQ: 20, MES: 1.25 };
    expect(parseMultipliers(formatMultipliers(multipliers))).toEqual({ multipliers, invalid: [] });
    expect(sameMultipliers(multipliers, { MES: 1.25, NQ: 20, ES: 50 })).toBe(true);
    expect(sameMultipliers(multipliers, { ES: 50, NQ: 20 })).toBe(false);
  });
});

describe("saving multipliers", () => {
  it("recalculates trades when the multipliers change, and only then", async () => {
    expect(await save({ multipliers: { ES: 50 } })).toMatchObject({
      status: 200,
      body: { rebuilt: true },
    });
    expect(db.select().from(trades).get()?.netPnl).toBe(500);
    expect(await save({ timeZone: "UTC", multipliers: { ES: 50 } })).toMatchObject({
      status: 200,
      body: { rebuilt: false },
    });
  });

  it("refuses a multiplier that is not a positive number", async () => {
    expect((await save({ multipliers: { ES: "50" } })).status).toBe(400);
    expect((await save({ multipliers: [50] })).status).toBe(400);
    expect(db.select().from(trades).get()?.netPnl).toBe(500);
  });
});
