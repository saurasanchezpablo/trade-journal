import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baselineSymbols,
  parseWorkspaceSymbol,
  searchScope,
  seedCells,
  startingMarket,
  typedSymbols,
  workspaceIndicators,
  workspaceSources,
  workspaceStateProblem,
} from "../src/lib/chart-workspace";
import type { MarketConnection } from "../src/lib/market-data";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-workspace-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db } = await import("../src/db");
const route = await import("../src/app/api/chart-workspace/route");

afterAll(() => {
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const connection = (id: string, name: string, configured = true): MarketConnection => ({
  id,
  name,
  configured,
  source: configured ? "public" : null,
});
const sources = workspaceSources([
  connection("binance", "Binance"),
  connection("bybit", "Bybit"),
  connection("yahoo", "Yahoo Finance"),
  connection("nasdaq", "Nasdaq"),
  connection("market-csv", "Market data CSV"),
  connection("alpaca", "Alpaca", false),
]);

describe("the workspace's sources", () => {
  it("offers every configured source, one per market where a source has several", () => {
    expect(sources.map((s) => s.name)).toEqual([
      "binance",
      "bybit_linear",
      "bybit_spot",
      "bybit_inverse",
      "yahoo",
      "nasdaq_stocks",
      "nasdaq_etf",
      "market_csv",
    ]);
    expect(sources.find((s) => s.name === "bybit_spot")).toMatchObject({
      provider: "bybit",
      dataset: "spot",
      label: "Bybit · Spot",
    });
  });

  it("reads a chart's symbol back to its source and market", () => {
    expect(parseWorkspaceSymbol("bybit_spot:BTCUSDT", sources)).toMatchObject({
      source: { provider: "bybit", dataset: "spot" },
      symbol: "BTCUSDT",
    });
    expect(parseWorkspaceSymbol("BYBIT_SPOT:BTCUSDT", sources)?.symbol).toBe("BTCUSDT");
    expect(parseWorkspaceSymbol("alpaca:AAPL", sources)).toBeNull();
    expect(parseWorkspaceSymbol("BTCUSDT", sources)).toBeNull();
  });
});

describe("a new workspace", () => {
  it("shows the market you came from on four charts, from the day down to 15 minutes", () => {
    const cells = seedCells(sources, { provider: "binance", dataset: null, symbol: "BTCUSDT" });
    expect(Object.values(cells ?? {})).toEqual([
      { symbol: "binance:BTCUSDT", timeframe: "1D" },
      { symbol: "binance:BTCUSDT", timeframe: "240" },
      { symbol: "binance:BTCUSDT", timeframe: "60" },
      { symbol: "binance:BTCUSDT", timeframe: "15" },
    ]);
  });

  it("uses the nearest candle size a source serves", () => {
    const cells = seedCells(sources, { provider: "nasdaq", dataset: "stocks", symbol: "AAPL" });
    expect(Object.values(cells ?? {}).map((c) => c.timeframe)).toEqual(["1D", "1D", "1D", "1D"]);
  });

  it("starts on the chart you came from, else the latest symbol you watched on a source you have", () => {
    const recent = [
      { provider: "alpaca", dataset: "iex", symbol: "MSFT" },
      { provider: "yahoo", dataset: null, symbol: "AAPL" },
    ];
    expect(
      startingMarket(sources, { provider: "binance", dataset: null, symbol: "ETHUSDT" }, recent),
    ).toEqual({ provider: "binance", dataset: null, symbol: "ETHUSDT" });
    expect(startingMarket(sources, null, recent)).toEqual({
      provider: "yahoo",
      dataset: null,
      symbol: "AAPL",
    });
    expect(startingMarket(sources, null, [])).toBeNull();
  });
});

describe("the workspace's symbol search", () => {
  it("starts from the charts' symbols and your recent ones, each once", () => {
    const rows = baselineSymbols(
      sources,
      ["binance:BTCUSDT", "binance:BTCUSDT", "yahoo:AAPL"],
      [{ provider: "binance", dataset: null, symbol: "BTCUSDT" }],
    );
    expect(rows.map((r) => `${r.provider}:${r.ticker}`)).toEqual(["binance:BTCUSDT", "yahoo:AAPL"]);
  });

  it("offers a typed symbol on the sources that have no listing to search", () => {
    expect(typedSymbols(sources, "es").map((r) => `${r.provider}:${r.ticker}`)).toEqual([
      "market_csv:ES",
    ]);
    expect(typedSymbols(sources, "market_csv:nq").map((r) => r.ticker)).toEqual(["NQ"]);
    expect(typedSymbols(sources, "two words")).toEqual([]);
  });

  it("asks only the source a query names", () => {
    expect(searchScope(sources, "bybit:eth")).toMatchObject({ term: "eth" });
    expect(searchScope(sources, "bybit:eth").sources.map((s) => s.name)).toEqual([
      "bybit_linear",
      "bybit_spot",
      "bybit_inverse",
    ]);
    expect(searchScope(sources, "eth").sources).toHaveLength(sources.length);
  });

  it("lists the journal's indicators and your scripts, none added by themselves", () => {
    const list = workspaceIndicators([
      { id: "s1", name: "My bands", source: "//@version=5", createdAt: "", updatedAt: "" },
    ]);
    expect(list.every((entry) => entry.enabled === false && entry.language === "pine")).toBe(true);
    expect(list.at(-1)).toMatchObject({ name: "My bands", category: "My scripts" });
  });
});

describe("saving the workspace", () => {
  beforeEach(() => vi.stubEnv("JOURNAL_PASSWORD", ""));
  const put = (value: unknown) =>
    route.PUT(
      new Request("http://journal.test/api/chart-workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      }),
    );
  const doc = JSON.stringify({
    version: 1,
    layout: "4",
    charts: [{ id: "chart-1", symbol: "binance:BTCUSDT", timeframe: "60" }],
  });

  it("keeps the latest state, and starting over forgets it", async () => {
    expect(await (await route.GET()).json()).toMatchObject({ state: null });
    expect((await put({ state: doc })).status).toBe(200);
    expect((await (await route.GET()).json()).state).toBe(doc);
    await route.DELETE();
    expect((await (await route.GET()).json()).state).toBeNull();
  });

  it("refuses anything that is not a workspace document", async () => {
    expect((await put({ state: "{not json" })).status).toBe(400);
    expect((await put({ state: JSON.stringify({ version: 2, layout: "4" }) })).status).toBe(400);
    expect((await put({ state: { version: 1 } })).status).toBe(400);
    expect(workspaceStateProblem("x".repeat(5 * 1024 * 1024))).toMatch(/too large/);
  });
});
