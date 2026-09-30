import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  forexPair,
  futuresRoot,
  publicCandidates,
  servableResolution,
} from "../src/lib/market-symbols";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-keyless-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, settings, trades } = await import("../src/db");
const { saveConnection, providerFor } = await import("../src/server/market-data/connections");
const { createMarketTransport, marketTransport } =
  await import("../src/server/market-data/transport");
const { resetListings } = await import("../src/server/market-data/listings");
const { insertExecutions } = await import("../src/server/executions");
const { tradeMarketSource } = await import("../src/server/trade-market-source");

const M = 60_000;
const H = 60 * M;
const D = 24 * H;

let replies: (url: URL) => Response;
const calls: URL[] = [];
beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  Object.assign(marketTransport, createMarketTransport({ minIntervalMs: 0, limits: {} }));
  resetListings();
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      calls.push(url);
      return replies(url);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  marketTransport.clear();
});
afterAll(() => {
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("OKX candles", () => {
  const okx = providerFor("okx");
  const t0 = Date.UTC(2024, 0, 2, 10);
  const instrument = (instId: string, extra = {}) => ({
    instId,
    state: "live",
    quoteCcy: "USDT",
    settleCcy: "USDT",
    ctVal: "0.01",
    ctValCcy: "BTC",
    ...extra,
  });

  it("reads years-old history in time order, with a perpetual's volume in coins", async () => {
    replies = (url) =>
      url.pathname.endsWith("/instruments")
        ? Response.json({ code: "0", data: [instrument("BTC-USDT-SWAP")] })
        : Response.json({
            code: "0",
            data: [
              [String(t0 + H), "101", "103", "100", "102", "700", "7", "714", "1"],
              [String(t0), "100", "102", "99", "101", "500", "5", "505", "1"],
            ],
          });
    const history = await okx.history(
      { symbol: "BTC-USDT-SWAP", dataset: "swap", resolution: "1h", from: t0, to: t0 + 2 * H },
      "",
    );
    expect(history.bars).toEqual([
      { time: t0, open: 100, high: 102, low: 99, close: 101, volume: 5 },
      { time: t0 + H, open: 101, high: 103, low: 100, close: 102, volume: 7 },
    ]);
    expect(history.quoteCurrency).toBe("USDT");
    expect(history.warnings.join(" ")).toMatch(/One contract is 0.01 BTC/);
    const page = calls.find((u) => u.pathname.endsWith("/history-candles"))!;
    expect(page.searchParams.get("bar")).toBe("1H");
    expect(Number(page.searchParams.get("after"))).toBe(t0 + 2 * H);
    expect(Number(page.searchParams.get("before"))).toBe(t0 - 1);
  });

  it("says when OKX lists no such instrument, and refuses a spot name on the perpetual market", async () => {
    replies = () => Response.json({ code: "0", data: [] });
    await expect(
      okx.history(
        { symbol: "NOPE-USDT", dataset: "spot", resolution: "1d", from: t0, to: t0 + D },
        "",
      ),
    ).rejects.toThrow(/OKX lists no spot instrument NOPE-USDT/);
    await expect(
      okx.history(
        { symbol: "BTC-USDT", dataset: "swap", resolution: "1d", from: t0, to: t0 + D },
        "",
      ),
    ).rejects.toThrow(/BTC-USDT-SWAP/);
  });
});

describe("Kraken candles", () => {
  const kraken = providerFor("kraken");
  const pairs = {
    error: [],
    result: {
      ZEURZUSD: { altname: "EURUSD", wsname: "EUR/USD", status: "online" },
      XXBTZUSD: { altname: "XBTUSD", wsname: "XBT/USD", status: "online" },
    },
  };
  const ohlc = (key: string, start: number, count: number, step: number) =>
    Response.json({
      error: [],
      result: {
        [key]: Array.from({ length: count }, (_, i) => [
          (start + i * step) / 1000,
          "1.1",
          "1.2",
          "1.0",
          "1.15",
          "1.12",
          "1000",
          9,
        ]),
        last: 0,
      },
    });

  it("reads a currency pair, and says Kraken keeps only its latest 720 candles", async () => {
    const now = Math.floor(Date.now() / H) * H;
    const oldest = now - 719 * H;
    replies = (url) =>
      url.pathname.endsWith("AssetPairs") ? Response.json(pairs) : ohlc("ZEURZUSD", oldest, 720, H);
    const recent = await kraken.history(
      { symbol: "EUR/USD", resolution: "1h", from: now - 10 * H, to: now },
      "",
    );
    expect(recent.truncated).toBe(false);
    expect(recent.quoteCurrency).toBe("USD");
    expect(calls.find((u) => u.pathname.endsWith("OHLC"))!.searchParams.get("pair")).toBe("EURUSD");
    const older = await kraken.history(
      { symbol: "EURUSD", resolution: "1h", from: oldest - 100 * H, to: oldest + 10 * H },
      "",
    );
    expect(older.truncated).toBe(true);
    await expect(
      kraken.history(
        { symbol: "EURUSD", resolution: "1h", from: oldest - 90 * D, to: oldest - 80 * D },
        "",
      ),
    ).rejects.toThrow(/latest 720 1h candles/);
  });

  it("finds bitcoin written as BTC", async () => {
    const now = Math.floor(Date.now() / D) * D;
    replies = (url) =>
      url.pathname.endsWith("AssetPairs")
        ? Response.json(pairs)
        : ohlc("XXBTZUSD", now - 5 * D, 5, D);
    const history = await kraken.history(
      { symbol: "BTCUSD", resolution: "1d", from: now - 5 * D, to: now },
      "",
    );
    expect(history.bars).toHaveLength(5);
    expect(calls.find((u) => u.pathname.endsWith("OHLC"))!.searchParams.get("pair")).toBe("XBTUSD");
  });
});

describe("Nasdaq daily candles", () => {
  const nasdaq = providerFor("nasdaq");
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

  it("reads dollar amounts as numbers, on journal days, asking a week wider than needed", async () => {
    replies = () =>
      Response.json({
        data: {
          symbol: "AAPL",
          tradesTable: {
            rows: [
              {
                date: "09/10/2026",
                close: "$326.57",
                volume: "70,011,910",
                open: "$316.67",
                high: "$326.74",
                low: "$316.51",
              },
              {
                date: "09/09/2026",
                close: "$315.34",
                volume: "65,639,960",
                open: "$315.485",
                high: "$319.15",
                low: "$314.00",
              },
            ],
          },
        },
      });
    const history = await nasdaq.history(
      {
        symbol: "AAPL",
        dataset: "stocks",
        resolution: "1d",
        from: day("2026-09-09"),
        to: day("2026-09-11"),
      },
      "",
    );
    expect(history.bars).toEqual([
      {
        time: day("2026-09-09"),
        open: 315.485,
        high: 319.15,
        low: 314,
        close: 315.34,
        volume: 65_639_960,
      },
      {
        time: day("2026-09-10"),
        open: 316.67,
        high: 326.74,
        low: 316.51,
        close: 326.57,
        volume: 70_011_910,
      },
    ]);
    expect(history.quoteCurrency).toBe("USD");
    const url = calls[0]!;
    expect(url.searchParams.get("assetclass")).toBe("stocks");
    expect(url.searchParams.get("fromdate")).toBe("2026-09-02");
  });

  it("serves daily candles only, and passes on an unknown symbol in Nasdaq's words", async () => {
    await expect(
      nasdaq.history(
        { symbol: "AAPL", dataset: "stocks", resolution: "5m", from: 0, to: Date.now() },
        "",
      ),
    ).rejects.toThrow(/daily candles only/);
    replies = () =>
      Response.json({
        data: null,
        status: { rCode: 400, bCodeMessage: [{ code: 1001, errorMessage: "Symbol not exists." }] },
      });
    await expect(
      nasdaq.history(
        {
          symbol: "ZZZZQ",
          dataset: "etf",
          resolution: "1d",
          from: Date.now() - 20 * D,
          to: Date.now(),
        },
        "",
      ),
    ).rejects.toThrow("Nasdaq: Symbol not exists.");
  });
});

describe("Yahoo Finance candles", () => {
  const yahoo = providerFor("yahoo");
  const chart = (timestamps: number[], quote: Record<string, (number | null)[]>, meta = {}) =>
    Response.json({
      chart: {
        result: [
          {
            meta: {
              currency: "USD",
              exchangeTimezoneName: "America/New_York",
              gmtoffset: -14400,
              ...meta,
            },
            timestamp: timestamps,
            indicators: { quote: [quote] },
          },
        ],
        error: null,
      },
    });

  it("skips Yahoo's empty minutes and puts daily candles on the exchange's trading day", async () => {
    // A New York session opens at 13:30 UTC; Yahoo stamps the day there.
    const open = Date.UTC(2026, 8, 28, 13, 30) / 1000;
    replies = () =>
      chart([open, open + 86_400], {
        open: [100, null],
        high: [102, 105],
        low: [99, 101],
        close: [101, 104],
        volume: [1000, 2000],
      });
    const history = await yahoo.history(
      { symbol: "AAPL", resolution: "1d", from: Date.UTC(2026, 8, 28), to: Date.UTC(2026, 8, 30) },
      "",
    );
    expect(history.bars).toEqual([
      { time: Date.UTC(2026, 8, 28), open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    ]);
  });

  it("asks a week of minutes at a time, and says what is older than Yahoo keeps", async () => {
    replies = () => chart([], {});
    const now = Date.now();
    const history = await yahoo.history(
      { symbol: "EURUSD=X", resolution: "1m", from: now - 40 * D, to: now - 5 * D },
      "",
    );
    const pages = calls.map(
      (u) => Number(u.searchParams.get("period2")) - Number(u.searchParams.get("period1")),
    );
    expect(pages.length).toBeGreaterThan(1);
    // A week, give or take the second that rounding the ends to whole seconds adds.
    expect(Math.max(...pages)).toBeLessThanOrEqual(7 * 86_400 + 1);
    expect(history.truncated).toBe(true);
    expect(history.warnings.join(" ")).toMatch(/keeps 1m candles for 30 days/);
    await expect(
      yahoo.history(
        { symbol: "EURUSD=X", resolution: "5m", from: now - 200 * D, to: now - 100 * D },
        "",
      ),
    ).rejects.toThrow(/Choose 1h or 1d/);
  });

  it("names prices in pence, and explains Yahoo refusing the network", async () => {
    const open = Date.UTC(2026, 8, 28, 8) / 1000;
    replies = () =>
      chart(
        [open],
        { open: [500], high: [510], low: [495], close: [505], volume: [10] },
        {
          currency: "GBp",
          exchangeTimezoneName: "Europe/London",
        },
      );
    const pence = await yahoo.history(
      { symbol: "VOD.L", resolution: "1d", from: Date.UTC(2026, 8, 28), to: Date.UTC(2026, 8, 29) },
      "",
    );
    expect(pence.quoteCurrency).toBeUndefined();
    expect(pence.warnings.join(" ")).toMatch(/pence/);
    replies = () => new Response("Too Many Requests", { status: 429 });
    await expect(
      yahoo.history(
        { symbol: "MSFT", resolution: "1d", from: Date.now() - 5 * D, to: Date.now() },
        "",
      ),
    ).rejects.toThrow(/refusing requests from this network/);
  });
});

describe("a trade's instrument on the keyless sources", () => {
  it("reads currency pairs however brokers write them, and nothing else as one", () => {
    for (const symbol of [
      "EURUSD",
      "EUR/USD",
      "EUR_USD",
      "EURUSD.x",
      "EURUSDm",
      "OANDA:EUR_USD",
      "eurusd",
    ])
      expect(forexPair(symbol)).toEqual({ base: "EUR", quote: "USD" });
    for (const symbol of ["EURUSDT", "BTCUSD", "AAPL", "USDUSD", "XAUUSD"])
      expect(forexPair(symbol)).toBeNull();
  });

  it("reads a future's root whatever the contract month", () => {
    expect(["ESZ5", "ESZ25", "ES 12-25", "/ES", "ES"].map(futuresRoot)).toEqual([
      "ES",
      "ES",
      "ES",
      "ES",
      "ES",
    ]);
    expect(["MESZ5", "NQH6", "ZNZ5", "6EZ5", "GCZ5"].map(futuresRoot)).toEqual([
      "MES",
      "NQ",
      "ZN",
      "6E",
      "GC",
    ]);
  });

  it("looks in the right places for each asset class", () => {
    expect(
      publicCandidates("EUR/USD", "forex", false).map((c) => `${c.provider}:${c.symbol}`),
    ).toEqual(["yahoo:EURUSD=X", "kraken:EURUSD"]);
    expect(
      publicCandidates("BRK.B", "equity", true).map(
        (c) => `${c.provider}:${c.symbol}:${c.dataset}`,
      ),
    ).toEqual(["yahoo:BRK-B:null", "nasdaq:BRK.B:stocks", "nasdaq:BRK.B:etf"]);
    expect(publicCandidates("AAPL", "equity", false).map((c) => c.provider)).toEqual(["yahoo"]);
    expect(publicCandidates("ESZ5", "futures", false)[0]!.symbol).toBe("ES=F");
    expect(publicCandidates("AAPL", "option", true)).toEqual([]);
  });

  it("takes the finest candles a source still keeps for an older trade", () => {
    const now = Date.UTC(2026, 8, 30);
    expect(servableResolution("yahoo", "1m", now - 2 * D, now)).toBe("1m");
    expect(servableResolution("yahoo", "1m", now - 45 * D, now)).toBe("5m");
    expect(servableResolution("yahoo", "5m", now - 200 * D, now)).toBe("1h");
    expect(servableResolution("yahoo", "5m", now - 900 * D, now)).toBe("1d");
    expect(servableResolution("kraken", "1m", now - 10 * D, now)).toBe("30m");
    expect(servableResolution("kraken", "1m", now - 3 * 365 * D, now)).toBeNull();
  });
});

describe("candles chosen for a forex, stock or futures trade", () => {
  beforeEach(() => {
    db.delete(settings).run();
    db.delete(trades).run();
    db.delete(executions).run();
    db.delete(accounts).run();
    db.insert(accounts)
      .values({ id: "a", name: "Broker", kind: "manual", createdAt: "2026-01-01" })
      .run();
  });
  const trade = (
    symbol: string,
    assetClass: "forex" | "equity" | "futures" | "cfd" | undefined,
    opened: number,
  ) => {
    insertExecutions(
      "a",
      [
        {
          symbol,
          side: "buy",
          quantity: 1,
          price: 1.1,
          fee: 0,
          executedAt: new Date(opened).toISOString(),
          ...(assetClass ? { assetClass } : {}),
        },
        {
          symbol,
          side: "sell",
          quantity: 1,
          price: 1.2,
          fee: 0,
          executedAt: new Date(opened + 20 * M).toISOString(),
          ...(assetClass ? { assetClass } : {}),
        },
      ],
      "manual",
    );
    const row = db.select().from(trades).all()[0]!;
    return {
      key: row.key,
      symbol,
      assetClass,
      openedAt: row.openedAt,
      closedAt: row.closedAt ?? undefined,
    };
  };
  const yahooSearch = (symbols: string[]) =>
    Response.json({
      quotes: symbols.map((symbol) => ({ symbol, shortname: symbol, quoteType: "CURRENCY" })),
    });

  it("a currency pair goes to Yahoo Finance, not to a crypto exchange's coin of that name", async () => {
    saveConnection("binance", "");
    saveConnection("yahoo", "");
    replies = (url) =>
      url.pathname.includes("/search") ? yahooSearch(["EURUSD=X"]) : Response.json({});
    const found = await tradeMarketSource(trade("EURUSD", "forex", Date.now() - 2 * D));
    expect(found.source).toMatchObject({ provider: "yahoo", symbol: "EURUSD=X", resolution: "1m" });
    expect(calls.some((u) => u.host.includes("binance"))).toBe(false);
  });

  it("uses Kraken when it is the source you enabled, at candles it still keeps", async () => {
    saveConnection("kraken", "");
    replies = () =>
      Response.json({
        error: [],
        result: { ZEURZUSD: { altname: "EURUSD", wsname: "EUR/USD", status: "online" } },
      });
    const found = await tradeMarketSource(trade("EUR/USD", "cfd", Date.now() - 3 * D));
    expect(found.source).toMatchObject({ provider: "kraken", symbol: "EURUSD", resolution: "15m" });
  });

  it("a future reads as Yahoo's continuous front month, and a stock says what to enable", async () => {
    saveConnection("yahoo", "");
    replies = () => yahooSearch(["ES=F"]);
    const future = await tradeMarketSource(trade("ESZ5", "futures", Date.now() - D));
    expect(future.source).toMatchObject({ provider: "yahoo", symbol: "ES=F" });
    saveConnection("yahoo", null);
    db.delete(trades).run();
    db.delete(executions).run();
    const stock = await tradeMarketSource(trade("AAPL", "equity", Date.now() - D));
    expect(stock.source).toBeNull();
    expect((stock as { reason: string }).reason).toMatch(/Enable Yahoo Finance in Settings/);
  });

  it("a trade booked without an asset class is looked up as a stock when no exchange lists it as a coin", async () => {
    saveConnection("binance", "");
    saveConnection("yahoo", "");
    replies = (url) =>
      url.host.includes("binance")
        ? Response.json({
            symbols: [
              { symbol: "BTCUSDT", status: "TRADING", baseAsset: "BTC", quoteAsset: "USDT" },
            ],
          })
        : yahooSearch(["AAPL", "AAPL.TO"]);
    const stock = await tradeMarketSource(trade("AAPL", undefined, Date.now() - D));
    expect(stock.source).toMatchObject({ provider: "yahoo", symbol: "AAPL" });
    db.delete(trades).run();
    db.delete(executions).run();
    const coin = await tradeMarketSource(trade("BTC", undefined, Date.now() - D));
    expect(coin.source).toMatchObject({ provider: "binance", symbol: "BTCUSDT" });
  });
});
