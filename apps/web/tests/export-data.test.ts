import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { csvCell } from "../src/lib/csv-cell";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-export-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, chartAnalyses, chartTradeLinks, trades } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { addGoal } = await import("../src/server/goals");
const { GET } = await import("../src/app/api/export/route");

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
        price: 101,
        fee: 0,
        executedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        symbol: "ES",
        side: "sell",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-09-01T11:00:00.000Z",
      },
    ],
    "manual",
  );
  const key = db.select().from(trades).get()!.key;
  db.update(trades).set({ notes: '=HYPERLINK("http://example.com","x")' }).run();
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
  db.insert(chartTradeLinks)
    .values({ tradeKey: key, analysisId: "analysis", scenarioId: null, createdAt: "2026-09-01" })
    .run();
  addGoal({
    periodKind: "month",
    period: "2026-09",
    metric: null,
    comparator: null,
    target: null,
    text: "Wait for the retest",
  });
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("the trades CSV opens safely in a spreadsheet", () => {
  it("shows text that looks like a formula instead of running it", () => {
    for (const text of ["=1+1", "+1", "-cmd", "@SUM(A1)", "\tx", "\rx"])
      expect(csvCell(text).replace(/^"/, "")).toMatch(/^'/);
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(null)).toBe("");
  });

  it("is private, never cached, and keeps a losing trade's P&L a number", async () => {
    const response = await GET(new Request("http://localhost/api/export?format=csv"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const [, line] = (await response.text()).split("\n");
    expect(line).toContain(",-1,");
    expect(line).toContain(`"'=HYPERLINK(""http://example.com"",""x"")"`);
  });
});

describe("the JSON backup", () => {
  it("includes plan trade links and review goals", async () => {
    const body = await (await GET(new Request("http://localhost/api/export"))).json();
    expect(body.chartTradeLinks).toHaveLength(1);
    expect(body.chartPlanReviews).toEqual([]);
    expect(body.reviewGoals).toMatchObject([{ period: "2026-09", text: "Wait for the retest" }]);
  });
});
