import { createMarketTransport, marketTransport } from "../src/server/market-data/transport";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-market-data-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, settings, accounts, executions, trades, marketCsvDatasets } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { GET: savedHistory, POST: loadHistory } =
  await import("../src/app/api/trades/[key]/market-data/route");
const { GET: listCsv, POST: csvRequest } = await import("../src/app/api/market-data/csv/route");
const { GET: explorer } = await import("../src/app/api/trade-explorer/route");
const { connectionKey, connections, saveConnection } =
  await import("../src/server/market-data/connections");
const { GET, POST } = await import("../src/app/api/market-data/connections/route");
const session = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (session.token ? { value: session.token } : undefined) }),
}));
const id = "london-strategic-edge";
const request = (body: unknown) =>
  new Request("http://localhost/api/market-data/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  db.delete(settings).run();
  db.delete(marketCsvDatasets).run();
  db.delete(trades).run();
  db.delete(executions).run();
  db.delete(accounts).run();
  for (const name of [
    "LSE_API_KEY",
    "ALPACA_API_KEY",
    "ALPACA_SECRET_KEY",
    "OANDA_API_TOKEN",
    "OANDA_ACCOUNT_ID",
    "OANDA_ENVIRONMENT",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("JOURNAL_PASSWORD", "");
});

describe("trade history endpoint", () => {
  const body = {
    provider: "london-strategic-edge",
    symbol: "TEST",
    resolution: "1m",
    basisConfirmed: true,
  };
  function seed(assetClass: "equity" | "option" = "equity") {
    db.insert(accounts)
      .values({ id: "fixture", name: "Fixture", kind: "manual", createdAt: "2026-01-01" })
      .run();
    insertExecutions(
      "fixture",
      [
        {
          symbol: "TEST",
          side: "buy",
          quantity: 10,
          price: 100,
          fee: 0,
          executedAt: "2026-01-02T10:00:00Z",
          assetClass,
        },
        {
          symbol: "TEST",
          side: "sell",
          quantity: 10,
          price: 102,
          fee: 0,
          executedAt: "2026-01-02T10:03:00Z",
          assetClass,
        },
      ],
      "manual",
    );
    return db.select().from(trades).all()[0]!.key;
  }
  it("loads candles and estimates without changing journal facts or exposing credentials", async () => {
    const key = seed();
    saveConnection(id, "fixture-key-only");
    const before = db.select().from(trades).all();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          [0, 1, 2].map((minute) => ({
            ts: `2026-01-02 10:0${minute}:00`,
            open: 100,
            low: 98,
            high: 104,
            close: 102,
          })),
        ),
      ),
    );
    const response = await loadHistory(request(body), { params: Promise.resolve({ key }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const result = await response.json();
    expect(result.estimate).toMatchObject({ mae: 20, mfe: 40 });
    expect(result.bars).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("fixture-key-only");
    expect(db.select().from(trades).all()).toEqual(before);
    const saved = await (
      await savedHistory(request({}), { params: Promise.resolve({ key }) })
    ).json();
    expect(saved.saved.estimate).toMatchObject({ mae: 20, mfe: 40 });
    const report = await (
      await explorer(new Request("http://localhost/api/trade-explorer?accounts=fixture"))
    ).json();
    expect(report.points).toHaveLength(1);
    expect(report.points[0]).toMatchObject({ key, mae: 20, mfe: 40 });
    const other = await (
      await explorer(new Request("http://localhost/api/trade-explorer?accounts=other"))
    ).json();
    expect(other.points).toEqual([]);
    // Chart-only loads do not erase the earlier, explicitly confirmed estimate.
    const chartOnly = await (
      await loadHistory(request({ ...body, basisConfirmed: false }), {
        params: Promise.resolve({ key }),
      })
    ).json();
    expect(chartOnly.bars).toHaveLength(3);
    expect(chartOnly.estimate.mae).toBeNull();
    expect(
      (await (await savedHistory(request({}), { params: Promise.resolve({ key }) })).json()).saved
        .estimate.mae,
    ).toBe(20);
    db.insert(settings)
      .values({ key: "multipliers", value: JSON.stringify({ TEST: 2 }) })
      .run();
    expect(
      (await (await savedHistory(request({}), { params: Promise.resolve({ key }) })).json()).saved,
    ).toBeNull();
    db.delete(settings).where(eq(settings.key, "multipliers")).run();
    // Account currency and execution changes invalidate derived values, even without a rebuild.
    db.update(accounts).set({ currency: "EUR" }).where(eq(accounts.id, "fixture")).run();
    expect(
      (await (await savedHistory(request({}), { params: Promise.resolve({ key }) })).json()).saved,
    ).toBeNull();
    db.update(accounts).set({ currency: "USD" }).where(eq(accounts.id, "fixture")).run();
    db.update(executions).set({ price: 101 }).where(eq(executions.side, "buy")).run();
    const stale = await (await explorer(new Request("http://localhost/api/trade-explorer"))).json();
    expect(stale.points[0]).toMatchObject({ mae: null, mfe: null });
  });
  it("previews CSV without writes, imports candles, replays them, persists estimates and removes their derived results", async () => {
    const key = seed();
    const payload = {
      name: "Fixture.csv",
      symbol: "TEST",
      resolution: "1m",
      currency: "USD",
      priceBasis: "raw",
      content:
        "time,open,high,low,close\n2026-01-02T10:00:00Z,100,104,98,102\n2026-01-02T10:01:00Z,100,104,98,102\n2026-01-02T10:02:00Z,100,104,98,102",
    };
    expect(
      (await (await csvRequest(request({ ...payload, action: "preview" }))).json()).count,
    ).toBe(3);
    expect((await (await listCsv()).json()).datasets).toHaveLength(0);
    const imported = await (await csvRequest(request({ ...payload, action: "import" }))).json();
    expect(imported.datasets).toMatchObject([{ symbol: "TEST", count: 3 }]);
    expect(connections().find((item) => item.id === "market-csv")?.configured).toBe(true);
    const history = await (
      await loadHistory(request({ ...body, provider: "market-csv", dataset: imported.id }), {
        params: Promise.resolve({ key }),
      })
    ).json();
    expect(history.bars).toHaveLength(3);
    expect(history.estimate).toMatchObject({ mae: 20, mfe: 40 });
    const compact = await (
      await loadHistory(
        request({ ...body, provider: "market-csv", dataset: imported.id, estimateOnly: true }),
        {
          params: Promise.resolve({ key }),
        },
      )
    ).json();
    expect(compact.bars).toBeUndefined();
    expect(compact.estimate).toEqual(history.estimate);

    expect(
      (await (await savedHistory(request({}), { params: Promise.resolve({ key }) })).json()).saved
        .estimate.mae,
    ).toBe(20);
    await csvRequest(request({ action: "remove", id: imported.id }));
    expect(
      (await (await savedHistory(request({}), { params: Promise.resolve({ key }) })).json()).saved,
    ).toBeNull();
    expect(db.select().from(trades).all()).toHaveLength(1);
  });
  it("keeps CSV currency mismatches unavailable even with the confirmation checked", async () => {
    const key = seed();
    const imported = await (
      await csvRequest(
        request({
          action: "import",
          name: "EUR.csv",
          symbol: "TEST",
          resolution: "1m",
          currency: "EUR",
          priceBasis: "raw",
          content:
            "time,open,high,low,close\n2026-01-02T10:00:00Z,100,104,98,102\n2026-01-02T10:02:00Z,100,104,98,102",
        }),
      )
    ).json();
    const history = await (
      await loadHistory(request({ ...body, provider: "market-csv", dataset: imported.id }), {
        params: Promise.resolve({ key }),
      })
    ).json();
    expect(history.bars).toHaveLength(2);
    expect(history.estimate.mae).toBeNull();
    expect(history.estimate.warnings.join()).toContain("EUR");
    expect(
      (await (await savedHistory(request({}), { params: Promise.resolve({ key }) })).json()).saved,
    ).toBeNull();
  });
  it("loads a small range from a large CSV and reuses decoded candles", async () => {
    const { importCsvDataset, marketCsv, csvDatasets, removeCsvDataset } =
      await import("../src/server/market-data/csv");
    const start = Date.parse("2025-01-01T00:00:00Z");
    const id = importCsvDataset({
      name: "large.csv",
      symbol: "TEST",
      resolution: "1m",
      currency: "USD",
      priceBasis: "raw",
      content:
        "time,open,high,low,close\n" +
        Array.from({ length: 50_000 }, (_, i) => `${start + i * 60_000},100,104,98,102`).join("\n"),
    });
    expect(csvDatasets()[0]?.count).toBe(50_000);
    const request = {
      symbol: "TEST",
      resolution: "1m" as const,
      from: start + 40_000 * 60_000 + 1000,
      to: start + 40_003 * 60_000,
    };
    const first = await marketCsv.history(request, "");
    expect(first.bars.map((bar) => bar.time)).toEqual(
      [40_000, 40_001, 40_002].map((i) => start + i * 60_000),
    );
    const prepare = vi.spyOn(db.$client, "prepare");
    try {
      expect((await marketCsv.history(request, "")).bars).toEqual(first.bars);
      expect(prepare.mock.calls.every(([query]) => !query.includes('"bars_json"'))).toBe(true);
    } finally {
      prepare.mockRestore();
    }
    removeCsvDataset(id);
    await expect(marketCsv.history(request, "")).rejects.toThrow("No CSV dataset");
  });
  it("validates hundreds of saved estimates with bounded database reads", async () => {
    const { estimateFingerprint, savedEstimates } =
      await import("../src/server/market-data/estimates");
    const { rowToTrade } = await import("../src/server/trades-query");
    const { tradeExcursions } = await import("../src/db");
    db.insert(accounts)
      .values({ id: "batch", name: "Batch", kind: "manual", createdAt: "2025-01-01" })
      .run();
    const start = Date.parse("2025-01-01T10:00:00Z");
    insertExecutions(
      "batch",
      Array.from({ length: 401 }, (_, index) => [
        {
          symbol: "TEST",
          side: "buy" as const,
          quantity: 10,
          price: 100,
          fee: 0,
          assetClass: "equity" as const,
          executedAt: new Date(start + index * 86_400_000).toISOString(),
        },
        {
          symbol: "TEST",
          side: "sell" as const,
          quantity: 10,
          price: 102,
          fee: 0,
          assetClass: "equity" as const,
          executedAt: new Date(start + index * 86_400_000 + 180_000).toISOString(),
        },
      ]).flat(),
      "manual",
    );
    const selected = db
      .select()
      .from(trades)
      .all()
      .map((row) => rowToTrade(row));
    expect(selected).toHaveLength(401);
    for (const trade of selected)
      db.insert(tradeExcursions)
        .values({
          tradeKey: trade.key,
          fingerprint: estimateFingerprint(trade),
          provider: "Fixture",
          symbol: "TEST",
          resolution: "1m",
          fetchedAt: "2026-01-01",
          estimateJson: JSON.stringify({ mae: 20, mfe: 40, warnings: [] }),
        })
        .run();
    const prepare = vi.spyOn(db.$client, "prepare");
    try {
      expect(savedEstimates(selected).size).toBe(401);
      expect(prepare.mock.calls.length).toBeLessThanOrEqual(10);
    } finally {
      prepare.mockRestore();
    }
  });
  it("rejects missing trades, invalid resolutions, and options before requesting data", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await loadHistory(request(body), { params: Promise.resolve({ key: "missing" }) })).status,
    ).toBe(404);
    const key = seed("option");
    expect(
      (
        await loadHistory(request({ ...body, resolution: "tick" }), {
          params: Promise.resolve({ key }),
        })
      ).status,
    ).toBe(400);
    expect((await loadHistory(request(body), { params: Promise.resolve({ key }) })).status).toBe(
      400,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => {
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("market data credential lifecycle", () => {
  it("starts with every source disabled and makes no provider requests", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const state = connections();
    expect(state).toHaveLength(7);
    expect(state.every((item) => !item.configured && item.source === null)).toBe(true);
    expect(state.map((item) => item.name)).toEqual(
      state.map((item) => item.name).sort((a, b) => a.localeCompare(b)),
    );
    const response = await GET();
    expect(response.status).toBe(200);
    for (const id of ["london-strategic-edge", "alpaca", "binance", "bybit", "coinbase", "oanda"])
      expect(() => connectionKey(id)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("encrypts saved keys and never returns them from status or save responses", async () => {
    const response = await POST(
      request({ provider: id, action: "save", apiKey: "fixture-key-only" }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("fixture-key-only");
    expect(JSON.stringify(db.select().from(settings).all())).not.toContain("fixture-key-only");
    expect(connectionKey(id)).toBe("fixture-key-only");
    expect(await (await GET()).json()).toEqual({
      connections: expect.arrayContaining([
        { id, name: "London Strategic Edge", configured: true, source: "saved" },
      ]),
    });
    expect((await POST(request({ provider: id, action: "remove" }))).status).toBe(200);
    expect(connections()[0]?.configured).toBe(false);
    expect(() => connectionKey(id)).toThrow("Add a market data API key");
  });
  it("encrypts multi-field credentials, validates complete sets and leaves partial environment configs unavailable", async () => {
    expect(
      (
        await POST(
          request({ provider: "alpaca", action: "save", credentials: { apiKey: "fixture-id" } }),
        )
      ).status,
    ).toBe(400);
    const response = await POST(
      request({
        provider: "alpaca",
        action: "save",
        credentials: { apiKey: "fixture-id", secretKey: "fixture-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("fixture-secret");
    expect(JSON.stringify(db.select().from(settings).all())).not.toContain("fixture-secret");
    expect(JSON.parse(connectionKey("alpaca"))).toEqual({
      apiKey: "fixture-id",
      secretKey: "fixture-secret",
    });
    vi.stubEnv("ALPACA_API_KEY", "environment-fixture");
    expect(connections().find((item) => item.id === "alpaca")).toMatchObject({
      configured: false,
      source: "environment",
    });
    expect(() => connectionKey("alpaca")).toThrow("Complete all");
    expect((await POST(request({ provider: "alpaca", action: "remove" }))).status).toBe(400);
    expect(
      (
        await POST(
          request({
            provider: "oanda",
            action: "save",
            credentials: { apiKey: "fixture-token", accountId: "001-123", environment: "other" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({
            provider: "oanda",
            action: "save",
            credentials: { apiKey: "fixture-token", accountId: "001-123", environment: "practice" },
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("enables and disables public sources explicitly without accepting unnecessary secrets", async () => {
    expect(() => connectionKey("binance")).toThrow("Enable");
    expect(
      (await POST(request({ provider: "binance", action: "save", apiKey: "unused-secret" })))
        .status,
    ).toBe(400);
    expect((await POST(request({ provider: "binance", action: "enable" }))).status).toBe(200);
    expect(connectionKey("binance")).toBe("");
    expect(connections().find((item) => item.id === "binance")).toMatchObject({
      configured: true,
      source: "public",
    });
    expect((await POST(request({ provider: "binance", action: "remove" }))).status).toBe(200);
    expect(() => connectionKey("binance")).toThrow("Enable");
  });
  it("honors environment precedence and refuses misleading saves or removals", async () => {
    saveConnection(id, "saved-fixture");
    vi.stubEnv("LSE_API_KEY", "environment-fixture");
    expect(connectionKey(id)).toBe("environment-fixture");
    expect(connections().find((item) => item.id === id)?.source).toBe("environment");
    expect((await POST(request({ provider: id, action: "remove" }))).status).toBe(400);
    expect(
      (await POST(request({ provider: id, action: "save", apiKey: "replacement" }))).status,
    ).toBe(400);
  });
  it("validates input before changing credentials", async () => {
    for (const apiKey of [null, "", " ", 42, "a\nb", "a".repeat(4097)])
      expect((await POST(request({ provider: id, action: "save", apiKey }))).status).toBe(400);
    expect((await POST(request({ provider: "unknown", action: "remove" }))).status).toBe(400);
    expect(connections()[0]?.configured).toBe(false);
  });
  it("tests access only on request and does not relay upstream details", async () => {
    const fetcher = vi.fn(async () => new Response("fixture-key-only", { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    saveConnection(id, "fixture-key-only");
    expect(fetcher).not.toHaveBeenCalled();
    const response = await POST(request({ provider: id, action: "test" }));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("fixture-key-only");
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it("uses the app's authentication gate for reads and writes", async () => {
    vi.stubEnv("JOURNAL_PASSWORD", "fixture-password");
    expect((await GET()).status).toBe(401);
    expect((await listCsv()).status).toBe(401);
    expect((await csvRequest(request({ action: "remove", id: "anything" }))).status).toBe(401);
    expect(
      (await POST(request({ provider: id, action: "save", apiKey: "fixture-key" }))).status,
    ).toBe(401);
    expect(connections()[0]?.configured).toBe(false);
  });
});

afterEach(() => marketTransport.clear());

beforeEach(() => Object.assign(marketTransport, createMarketTransport({ minIntervalMs: 0 })));
