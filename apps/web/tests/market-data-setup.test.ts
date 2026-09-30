import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-market-setup-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, trades } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { POST: history } = await import("../src/app/api/market-data/history/route");
const { GET: symbols } = await import("../src/app/api/market-data/symbols/route");
const { POST: tradeHistory } = await import("../src/app/api/trades/[key]/market-data/route");

const post = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

beforeAll(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  // Any network call would mean the check came too late.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("no network in this test");
    }),
  );
  db.insert(accounts)
    .values({ id: "main", name: "Main", kind: "manual", createdAt: "2026-01-01" })
    .run();
  insertExecutions(
    "main",
    [
      {
        symbol: "BTCUSDT",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-09-01T10:00:00.000Z",
      },
      {
        symbol: "BTCUSDT",
        side: "sell",
        quantity: 1,
        price: 101,
        fee: 0,
        executedAt: "2026-09-01T11:00:00.000Z",
      },
    ],
    "manual",
  );
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("a market data source that is not set up yet is the request's problem, not the provider's", () => {
  it("chart history answers 400 with what to do in Settings", async () => {
    const response = await history(
      post({ provider: "binance", symbol: "BTCUSDT", resolution: "1h", to: Date.now(), limit: 10 }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Settings/);
  });

  it("symbol search answers 400", async () => {
    const response = await symbols(
      new Request("http://localhost/api/market-data/symbols?provider=binance&q=btc"),
    );
    expect(response.status).toBe(400);
  });

  it("a trade's candles answer 400", async () => {
    const key = db.select().from(trades).get()!.key;
    const response = await tradeHistory(
      post({ provider: "binance", symbol: "BTCUSDT", resolution: "1h" }),
      { params: Promise.resolve({ key }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Settings/);
  });
});
