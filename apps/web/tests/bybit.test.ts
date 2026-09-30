import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankSymbols } from "../src/lib/symbol-search";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-bybit-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db } = await import("../src/db");
const { saveConnection, providerFor } = await import("../src/server/market-data/connections");
const { createMarketTransport, marketTransport } =
  await import("../src/server/market-data/transport");
const { resetListings } = await import("../src/server/market-data/listings");
const live = await import("../src/server/market-data/live");
const symbolsRoute = await import("../src/app/api/market-data/symbols/route");

const M = 60_000;
const t0 = Date.parse("2026-09-28T10:00:00Z");
const ok = (result: unknown) => Response.json({ retCode: 0, retMsg: "OK", result });
const instrument = (symbol: string, extra: Record<string, unknown> = {}) => ({
  symbol,
  baseCoin: symbol.replace(/USDT$|USDC$|USD$|-.*$/, ""),
  quoteCoin: "USDT",
  status: "Trading",
  contractType: "LinearPerpetual",
  ...extra,
});

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  Object.assign(marketTransport, createMarketTransport({ minIntervalMs: 0 }));
  resetListings();
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

describe("Bybit candles", () => {
  const bybit = providerFor("bybit");

  it("reads a perpetual's candles in time order from Bybit's newest-first pages", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        calls.push(url);
        if (url.pathname === "/v5/market/instruments-info")
          return ok({ category: "linear", list: [instrument("BTCUSDT")] });
        // Two 5m candles, newest first, as Bybit sends them.
        return ok({
          category: "linear",
          symbol: "BTCUSDT",
          list: [
            [String(t0 + 5 * M), "101", "103", "100", "102", "7.5", "760"],
            [String(t0), "100", "102", "99", "101", "5", "505"],
          ],
        });
      }),
    );
    const history = await bybit.history(
      { symbol: "BTCUSDT", dataset: "linear", resolution: "5m", from: t0, to: t0 + 10 * M },
      "",
    );
    expect(history.bars).toEqual([
      { time: t0, open: 100, high: 102, low: 99, close: 101, volume: 5 },
      { time: t0 + 5 * M, open: 101, high: 103, low: 100, close: 102, volume: 7.5 },
    ]);
    expect(history.quoteCurrency).toBe("USDT");
    const kline = calls.find((u) => u.pathname === "/v5/market/kline")!;
    expect(Object.fromEntries(kline.searchParams)).toMatchObject({
      category: "linear",
      symbol: "BTCUSDT",
      interval: "5",
      start: String(t0),
      end: String(t0 + 10 * M - 1),
      limit: "1000",
    });
    expect(kline.origin).toBe("https://api.bybit.com");
  });

  it("fetches weeks, 4h and 2h candles from Bybit itself, not built from finer ones", async () => {
    const intervals: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.pathname === "/v5/market/instruments-info")
          return ok({ list: [instrument("BTCUSDT")] });
        intervals.push(url.searchParams.get("interval")!);
        return ok({ list: [] });
      }),
    );
    for (const resolution of ["1w", "4h", "2h", "3m", "1d"] as const)
      await bybit.history(
        { symbol: "BTCUSDT", dataset: "spot", resolution, from: t0 - 86_400_000, to: t0 },
        "",
      );
    expect(intervals).toEqual(["W", "240", "120", "3", "D"]);
  });

  it("asks for the market, and names the symbol it cannot find", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ list: [] })),
    );
    await expect(
      bybit.history({ symbol: "BTCUSDT", resolution: "1h", from: t0 - 3_600_000, to: t0 }, ""),
    ).rejects.toThrow(/Choose a Bybit market/);
    await expect(
      bybit.history(
        { symbol: "NOPEUSDT", dataset: "spot", resolution: "1h", from: t0 - 3_600_000, to: t0 },
        "",
      ),
    ).rejects.toThrow(/lists no spot NOPEUSDT/);
    await expect(
      bybit.history(
        { symbol: "btc usdt", dataset: "spot", resolution: "1h", from: t0 - 3_600_000, to: t0 },
        "",
      ),
    ).rejects.toThrow(/Bybit symbol/);
  });

  it("reports Bybit's own refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ retCode: 10001, retMsg: "params error: symbol invalid" })),
    );
    await expect(
      bybit.history(
        { symbol: "BTCUSDT", dataset: "linear", resolution: "1h", from: t0 - 3_600_000, to: t0 },
        "",
      ),
    ).rejects.toThrow(/Bybit refused the request: params error/);
  });
});

describe("searching a source's symbols", () => {
  it("ranks the exact symbol, then those starting with the query, then the rest", () => {
    const listed = [
      { symbol: "WBTCUSDT", description: "", aliases: ["WBTC"] },
      { symbol: "BTCUSDT-26DEC26", description: "", aliases: ["BTC"] },
      { symbol: "BTCUSDT", description: "", aliases: ["BTC"] },
      { symbol: "BTCPERP", description: "", aliases: ["BTC"] },
      { symbol: "ETHUSDT", description: "", aliases: ["ETH"] },
    ];
    expect(rankSymbols(listed, "btcusdt").map((s) => s.symbol)).toEqual([
      "BTCUSDT",
      "BTCUSDT-26DEC26",
      "WBTCUSDT",
    ]);
    expect(rankSymbols(listed, "btc").map((s) => s.symbol)).toEqual([
      "BTCPERP",
      "BTCUSDT",
      "BTCUSDT-26DEC26",
      "WBTCUSDT",
    ]);
    expect(rankSymbols(listed, "")).toEqual([]);
    // Among equally good matches, the most traded (or the common quote) first.
    const pairs = [
      { symbol: "ETHAED", description: "", aliases: ["ETH"], weight: 1 },
      { symbol: "ETHUSDT", description: "", aliases: ["ETH"], weight: 90 },
      { symbol: "ETHBRL", description: "", aliases: ["ETH"] },
    ];
    expect(rankSymbols(pairs, "eth").map((s) => s.symbol)).toEqual(["ETHUSDT", "ETHAED", "ETHBRL"]);
    expect(rankSymbols(listed, "btc", 2)).toHaveLength(2);
  });

  it("lists every trading Bybit instrument of the market, across its pages, once an hour", async () => {
    const fetcher = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === "/v5/market/tickers")
        return ok({
          list: [
            { symbol: "BTCUSDT", turnover24h: "5" },
            { symbol: "BTC-26DEC26", turnover24h: "9000" },
            { symbol: "ETHUSDT", turnover24h: "70" },
          ],
        });
      const page = url.searchParams.get("cursor");
      return ok(
        page
          ? { list: [instrument("ETHUSDT"), instrument("OLDUSDT", { status: "Closed" })] }
          : {
              list: [
                instrument("BTCUSDT"),
                instrument("BTC-26DEC26", { contractType: "LinearFutures" }),
              ],
              nextPageCursor: "page-2",
            },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const bybit = providerFor("bybit");
    // Equally good matches: the most traded first.
    expect(await bybit.symbols!("btc", "linear", "")).toEqual([
      { symbol: "BTC-26DEC26", description: "BTC / USDT futures" },
      { symbol: "BTCUSDT", description: "BTC / USDT perpetual" },
    ]);
    expect(await bybit.symbols!("eth", "linear", "")).toEqual([
      { symbol: "ETHUSDT", description: "ETH / USDT perpetual" },
    ]);
    expect(await bybit.symbols!("old", "linear", "")).toEqual([]);
    // Two pages and the tickers for the first search; the others used the kept listing.
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new URL(fetcher.mock.calls[0]![0]).searchParams.get("category")).toBe("linear");
  });

  it("still lists instruments when their turnover cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        new URL(input).pathname === "/v5/market/tickers"
          ? new Response("down", { status: 503 })
          : ok({ list: [instrument("XRPUSDT")] }),
      ),
    );
    expect(await providerFor("bybit").symbols!("xrp", "spot", "")).toEqual([
      { symbol: "XRPUSDT", description: "XRP / USDT spot" },
    ]);
  });

  it("the search route answers only for enabled sources, and nothing for sources without a listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok({ list: [instrument("SOLUSDT")] })),
    );
    const ask = (query: string) =>
      symbolsRoute.GET(new Request(`http://journal.test/api/market-data/symbols?${query}`));
    const refused = await ask("provider=bybit&dataset=linear&q=sol");
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(/Enable this public market data source/);
    saveConnection("bybit", "enabled");
    const found = await ask("provider=bybit&dataset=linear&q=sol");
    expect(await found.json()).toEqual({
      symbols: [{ symbol: "SOLUSDT", description: "SOL / USDT perpetual" }],
    });
    expect(await (await ask("provider=oanda&q=eur")).json()).toEqual({ symbols: [] });
    expect((await ask("provider=bybit&dataset=linear&q=" + "x".repeat(41))).status).toBe(400);
  });
});

/** A WebSocket stand-in the feed drives like the real one. */
class FakeSocket {
  static opened: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
  open() {
    this.onopen?.();
  }
  push(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe("Bybit live prices", () => {
  const original = live.liveSockets.connect;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.opened = [];
    live.liveSockets.connect = (url) => new FakeSocket(url) as unknown as WebSocket;
  });
  afterEach(() => {
    live.liveSockets.connect = original;
    vi.useRealTimers();
  });

  it("subscribe to the market's stream: the candle and every trade", () => {
    const upstream = live.upstreamFor("bybit", "BTCUSDT", "15m", "linear")!;
    expect(upstream.url).toBe("wss://stream.bybit.com/v5/public/linear");
    expect(JSON.parse(upstream.hello!)).toEqual({
      op: "subscribe",
      args: ["kline.15.BTCUSDT", "publicTrade.BTCUSDT"],
    });
    expect(live.upstreamFor("bybit", "BTCUSDT", "1d", "spot")!.url).toBe(
      "wss://stream.bybit.com/v5/public/spot",
    );
    expect(() => live.upstreamFor("bybit", "BTCUSDT", "1m", null)).toThrow(/Choose a Bybit market/);
  });

  it("forward trades and the forming candle, and keep the connection alive with pings", () => {
    const messages: unknown[] = [];
    const off = live.listenLive("bybit", "ETHUSDT", "1m", (m) => messages.push(m), "linear")!;
    const socket = FakeSocket.opened[0]!;
    socket.open();
    socket.push({ success: true, op: "subscribe" });
    socket.push({
      topic: "publicTrade.ETHUSDT",
      data: [
        { T: t0 + 1000, s: "ETHUSDT", S: "Buy", v: "0.5", p: "2500.5" },
        { T: t0 + 2000, s: "ETHUSDT", S: "Sell", v: "1.25", p: "2500" },
      ],
    });
    vi.advanceTimersByTime(300);
    socket.push({
      topic: "kline.1.ETHUSDT",
      data: [
        {
          start: t0,
          end: t0 + M - 1,
          open: "2499",
          high: "2501",
          low: "2498",
          close: "2500",
          volume: "12.5",
          confirm: false,
          timestamp: t0 + 2500,
        },
      ],
    });
    expect(messages).toContainEqual({
      kind: "trades",
      trades: [
        [t0 + 1000, 2500.5, 0.5],
        [t0 + 2000, 2500, 1.25],
      ],
    });
    expect(messages).toContainEqual({
      kind: "bar",
      bar: { time: t0, open: 2499, high: 2501, low: 2498, close: 2500, volume: 12.5 },
    });
    vi.advanceTimersByTime(20_000);
    expect(socket.sent).toContain(JSON.stringify({ op: "ping" }));
    off();
    vi.advanceTimersByTime(10_000);
    const sentAfterClose = socket.sent.length;
    vi.advanceTimersByTime(60_000);
    expect(socket.sent.length).toBe(sentAfterClose);
  });

  it("a refused subscription stops the feed with Bybit's reason", () => {
    const messages: { kind: string; state?: string; message?: string }[] = [];
    live.listenLive("bybit", "NOPEUSDT", "1m", (m) => messages.push(m as never), "spot");
    const socket = FakeSocket.opened[0]!;
    socket.open();
    socket.push({
      success: false,
      ret_msg: "Invalid symbol :[publicTrade.NOPEUSDT]",
      op: "subscribe",
    });
    expect(messages.at(-1)).toMatchObject({ state: "error" });
    expect(messages.at(-1)!.message).toMatch(/Bybit refused the live feed: Invalid symbol/);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.opened).toHaveLength(1);
  });
});
