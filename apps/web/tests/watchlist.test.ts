import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PREFERENCES,
  preferencesProblem,
  setWatched,
  watchedSymbols,
  type ChartPreferences,
} from "../src/lib/chart-preferences";
import type { MarketHistory } from "../src/lib/market-data";
import { quoteFrom, sortWatchRows } from "../src/lib/watchlist";
import { hideJournalIndicators } from "../src/components/workspace-overlays";
import { JOURNAL_OVERLAYS_TYPE } from "../src/components/vela-view-limits";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-watchlist-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db } = await import("../src/db");
const { saveConnection } = await import("../src/server/market-data/connections");
const { MarketDataError } = await import("../src/server/market-data/provider");
const quotes = await import("../src/server/market-data/quotes");
const route = await import("../src/app/api/market-data/quotes/route");

afterAll(() => {
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const day = (i: number, close: number) => ({
  time: Date.UTC(2026, 9, 1 + i),
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

describe("the watchlist", () => {
  it("shows the last price and its change since the previous daily close", () => {
    expect(quoteFrom([day(0, 100), day(1, 103)])).toEqual({
      price: 103,
      previousClose: 100,
      change: 3,
      changePct: 0.03,
      time: day(1, 0).time,
    });
    expect(quoteFrom([day(0, 50)])).toMatchObject({ price: 50, change: null, changePct: null });
    expect(quoteFrom([])).toBeNull();
  });

  it("sorts by a column, with symbols that have no price last either way", () => {
    const row = (name: string, changePct: number | null) => ({
      name,
      quote:
        changePct === null
          ? null
          : { price: 1, previousClose: 1, change: changePct, changePct, time: 0 },
    });
    const rows = [row("B", 0.02), row("A", null), row("C", -0.01)];
    expect(sortWatchRows(rows, "changePct", true).map((r) => r.name)).toEqual(["B", "C", "A"]);
    expect(sortWatchRows(rows, "changePct", false).map((r) => r.name)).toEqual(["C", "B", "A"]);
    expect(sortWatchRows(rows, "symbol", false).map((r) => r.name)).toEqual(["A", "B", "C"]);
    expect(sortWatchRows(rows, null, false).map((r) => r.name)).toEqual(["B", "A", "C"]);
  });

  it("is the starred symbols, each with the market it is watched on, keeping their other settings", () => {
    let prefs: ChartPreferences = {
      ...DEFAULT_PREFERENCES,
      symbols: { "bybit|BTCUSDT": { label: "Bitcoin", decimals: 1 } },
    };
    prefs = setWatched(prefs, { provider: "bybit", dataset: "spot", symbol: "BTCUSDT" }, true);
    prefs = setWatched(prefs, { provider: "yahoo", dataset: null, symbol: "AAPL" }, true);
    expect(watchedSymbols(prefs)).toEqual([
      {
        key: "bybit|BTCUSDT",
        provider: "bybit",
        dataset: "spot",
        symbol: "BTCUSDT",
        label: "Bitcoin",
      },
      { key: "yahoo|AAPL", provider: "yahoo", dataset: null, symbol: "AAPL" },
    ]);
    expect(preferencesProblem(prefs)).toBeNull();
    prefs = setWatched(prefs, { provider: "bybit", dataset: "spot", symbol: "BTCUSDT" }, false);
    expect(prefs.symbols["bybit|BTCUSDT"]).toEqual({ label: "Bitcoin", decimals: 1 });
    prefs = setWatched(prefs, { provider: "yahoo", dataset: null, symbol: "AAPL" }, false);
    expect(prefs.symbols["yahoo|AAPL"]).toBeUndefined();
    expect(
      preferencesProblem({
        ...DEFAULT_PREFERENCES,
        symbols: { "x|Y": { favorite: true, dataset: "../etc" } },
      }),
    ).toMatch(/invalid/);
  });
});

describe("watchlist prices", () => {
  beforeEach(() => {
    vi.stubEnv("JOURNAL_PASSWORD", "");
    quotes.resetQuotes();
    saveConnection("binance", "enabled");
  });
  const post = (items: unknown) =>
    route.POST(
      new Request("http://journal.test/api/market-data/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }),
    );

  it("answers each symbol on its own: one that fails never fails the others", async () => {
    const latest = vi.spyOn(quotes.quoteDeps, "latest").mockImplementation(async (source) => {
      if (source.symbol === "NOPE") throw new MarketDataError("Binance does not list NOPE.");
      if (source.symbol === "BROKEN") throw new Error("socket hang up at 10.0.0.3");
      return {
        provider: "binance",
        symbol: source.symbol,
        resolution: "1d",
        bars: [day(0, 100), day(1, 99)],
        fetchedAt: "",
        truncated: false,
      } as MarketHistory;
    });
    const response = await post([
      { provider: "binance", symbol: "BTCUSDT" },
      { provider: "binance", symbol: "NOPE" },
      { provider: "binance", symbol: "BROKEN" },
      { provider: "kraken", symbol: "XBTUSD" },
      { provider: "market-csv", symbol: "ES" },
    ]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.quotes[0]).toMatchObject({ ok: true, price: 99, change: -1 });
    expect(body.quotes[1]).toEqual({ ok: false, error: "Binance does not list NOPE." });
    // Anything that is not a source's own message stays on the server.
    expect(body.quotes[2]).toEqual({ ok: false, error: "The price could not be read." });
    // Kraken is not enabled here: its own message says so.
    expect(body.quotes[3].ok).toBe(false);
    expect(body.quotes[4]).toEqual({ ok: false, error: "Candle files have no live price." });
    expect(latest.mock.calls[0]![0]).toMatchObject({ resolution: "1d" });
    latest.mockRestore();
  });

  it("keeps an answer a few seconds for every page, and asks again after a failure", async () => {
    let calls = 0;
    const latest = vi.spyOn(quotes.quoteDeps, "latest").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new MarketDataError("Busy.");
      return {
        provider: "binance",
        symbol: "ETHUSDT",
        resolution: "1d",
        bars: [day(0, 10), day(1, 11)],
        fetchedAt: "",
        truncated: false,
      } as MarketHistory;
    });
    const item = [{ provider: "binance", symbol: "ETHUSDT" }];
    expect((await (await post(item)).json()).quotes[0].ok).toBe(false);
    expect((await (await post(item)).json()).quotes[0].ok).toBe(true);
    expect((await (await post(item)).json()).quotes[0].ok).toBe(true);
    expect(calls).toBe(2);
    latest.mockRestore();
  });

  it("refuses too many symbols and anything that is not a symbol", async () => {
    const many = Array.from({ length: 41 }, (_, i) => ({ provider: "binance", symbol: `S${i}` }));
    expect((await post(many)).status).toBe(400);
    expect((await post([{ provider: "../x", symbol: "A" }])).status).toBe(400);
    expect((await post([{ provider: "binance", symbol: "" }])).status).toBe(400);
    expect((await post([{ provider: "binance", symbol: "A", dataset: "a/b" }])).status).toBe(400);
    expect((await post("BTCUSDT")).status).toBe(400);
  });
});

describe("the journal on a workspace chart", () => {
  it("is drawn by an indicator the workspace never lists, saves or removes", async () => {
    const journal = { id: "j", nativeType: `${JOURNAL_OVERLAYS_TYPE}1-x` };
    const volume = { id: "v", nativeType: "volume" };
    const chart = {
      indicators: () => [journal, volume],
      availableNativeIndicators: async () => [
        { type: `${JOURNAL_OVERLAYS_TYPE}1-x`, title: "Journal overlays" },
        { type: "vwap", title: "VWAP" },
      ],
    };
    hideJournalIndicators(chart as never);
    hideJournalIndicators(chart as never);
    expect(chart.indicators()).toEqual([volume]);
    expect((await chart.availableNativeIndicators()).map((n) => n.type)).toEqual(["vwap"]);
  });
});
