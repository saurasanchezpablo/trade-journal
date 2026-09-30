import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-trade-status-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { setSetting } = await import("../src/server/settings");
const { GET: listTrades } = await import("../src/app/api/trades/route");
const { chartOverlayData } = await import("../src/server/chart-overlays");
const { dayTradesFor } = await import("../src/server/trade-links");
const { weekContext } = await import("../src/server/journal-history");
const { EMPTY_PLAN } = await import("../src/lib/analysis-plan");

beforeAll(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  db.insert(accounts)
    .values({ id: "main", name: "Main", kind: "manual", createdAt: "2026-01-01" })
    .run();
  // A $2 winner, inside a $5 breakeven tolerance.
  insertExecutions(
    "main",
    [
      {
        symbol: "ES",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        symbol: "ES",
        side: "sell",
        quantity: 1,
        price: 102,
        fee: 0,
        executedAt: "2026-09-01T11:00:00.000Z",
      },
    ],
    "manual",
  );
  setSetting("journalDefaults", JSON.stringify({ breakeven: 5, breakevenMode: "money" }));
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("a trade inside the breakeven tolerance reads as breakeven everywhere", () => {
  it("in the trades list", async () => {
    const response = await listTrades(new Request("http://localhost/api/trades?view=list"));
    const body = await response.json();
    expect(body.trades[0].status).toBe("breakeven");
  });

  it("on the chart's journal trades", () => {
    expect(chartOverlayData("ES").trades[0]?.status).toBe("breakeven");
  });

  it("in a chart plan's trades of the day", () => {
    const [trade] = dayTradesFor({ symbol: "ES", plan: EMPTY_PLAN }, "2026-09-01", "UTC");
    expect(trade?.status).toBe("breakeven");
  });

  it("in the weekly review's win count", () => {
    expect(weekContext("2026-09-06", "UTC").text).toMatch(/2026-09-01: 1 trade \(ES\), 0 won/);
  });
});
