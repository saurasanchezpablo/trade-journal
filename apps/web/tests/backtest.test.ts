import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newBacktest, placeOrder, stepBar, DEFAULT_BACKTEST_CONFIG } from "@luxalgo/journal-core";
import {
  chartOverlays,
  localInput,
  orderSize,
  viewBars,
  viewForming,
  viewResolutions,
  zonedTime,
} from "../src/lib/backtest-replay";
import {
  DEFAULT_SESSION_SETTINGS,
  readState,
  settingsProblem,
  stateProblem,
} from "../src/lib/backtest-session";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-backtest-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db } = await import("../src/db");
const sessions = await import("../src/app/api/backtests/route");
const session = await import("../src/app/api/backtests/[id]/route");
const { strategyReport } = await import("../src/components/backtest/strategy-tester");

afterAll(() => {
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const M = 60_000;
const t0 = Date.UTC(2026, 8, 1, 10);
const candle = (i: number, open: number, high: number, low: number, close: number) => ({
  time: t0 + i * 15 * M,
  open,
  high,
  low,
  close,
  volume: 10,
});

describe("what the replay chart shows", () => {
  it("offers the session's candle size and every larger one", () => {
    expect(viewResolutions("15m")).toEqual(["15m", "30m", "1h", "2h", "4h", "1d", "1w"]);
  });

  it("builds a higher timeframe from revealed candles only, its last candle still forming", () => {
    const revealed = [candle(0, 100, 102, 99, 101), candle(1, 101, 104, 100, 103)];
    expect(viewBars(revealed, "1h")).toEqual([
      { time: t0, open: 100, high: 104, low: 99, close: 103, volume: 20 },
    ]);
    const forming = viewForming(revealed, { ...candle(2, 103, 106, 102, 105), volume: 4 }, "1h");
    expect(forming).toEqual({ time: t0, open: 100, high: 106, low: 99, close: 105, volume: 24 });
    // A candle opening a new hour forms alone.
    expect(viewForming(revealed, candle(4, 105, 107, 104, 106), "1h").time).toBe(t0 + 60 * M);
  });

  it("sizes an order from the balance and its stop", () => {
    expect(orderSize(DEFAULT_SESSION_SETTINGS, 10_000, 100, 98)).toEqual({ qty: 50, risk: 100 });
    expect(
      orderSize(
        { ...DEFAULT_SESSION_SETTINGS, riskMode: "amount", riskValue: 250 },
        10_000,
        100,
        95,
      ).qty,
    ).toBe(50);
    expect(orderSize(DEFAULT_SESSION_SETTINGS, 10_000, 100, null).qty).toBe(0);
  });

  it("draws the position's levels, pending orders and only fills already revealed", () => {
    const config = { ...DEFAULT_BACKTEST_CONFIG };
    let state = placeOrder(
      newBacktest(config),
      { side: "long", type: "market", qty: 1, stop: 95, target: 110 },
      candle(0, 100, 100, 100, 100),
      config,
    ).state;
    const overlay = chartOverlays(state, t0 + 15 * M);
    expect(overlay.levels.map((l) => l.kind)).toEqual(["entry", "stop", "target"]);
    state = stepBar(state, candle(1, 100, 111, 99, 108), config).state;
    expect(state.trades).toHaveLength(1);
    expect(chartOverlays(state, t0 + 30 * M).marks.map((m) => m.text)).toEqual(["Buy", "Target"]);
    expect(chartOverlays(state, t0 + 15 * M).marks.map((m) => m.text)).toEqual(["Buy"]);
  });

  it("reads dates in the journal's timezone, across a daylight saving change", () => {
    expect(zonedTime("2026-09-01T09:30", "America/New_York")).toBe(Date.UTC(2026, 8, 1, 13, 30));
    expect(zonedTime("2026-01-15T09:30", "America/New_York")).toBe(Date.UTC(2026, 0, 15, 14, 30));
    expect(localInput(Date.UTC(2026, 8, 1, 13, 30), "America/New_York")).toBe("2026-09-01T09:30");
    expect(zonedTime("tomorrow", "UTC")).toBeNull();
  });
});

describe("saving a backtest", () => {
  it("refuses unreadable settings and states, and reads a damaged state as a fresh one", () => {
    expect(settingsProblem(DEFAULT_SESSION_SETTINGS)).toBeNull();
    expect(settingsProblem({ ...DEFAULT_SESSION_SETTINGS, initialBalance: 0 })).toMatch(/balance/);
    expect(settingsProblem({ ...DEFAULT_SESSION_SETTINGS, riskValue: 150 })).toMatch(/100%/);
    expect(settingsProblem({ ...DEFAULT_SESSION_SETTINGS, currency: "usdt" })).toMatch(/currency/);
    const good = newBacktest({ initialBalance: 1_000 });
    expect(stateProblem(good)).toBeNull();
    expect(stateProblem({ ...good, trades: [{ id: "T1" }] })).toMatch(/trade/);
    expect(stateProblem({ ...good, balance: Number.NaN })).toMatch(/Invalid/);
    expect(readState("nonsense", 500)).toEqual(newBacktest({ initialBalance: 500 }));
  });
});

describe("the backtests API", () => {
  beforeEach(() => vi.stubEnv("JOURNAL_PASSWORD", ""));
  const body = (value: unknown, method = "POST") =>
    new Request("http://journal.test/api/backtests", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("creates a session, saves its progress and lists its results", async () => {
    const created = await sessions.POST(
      body({
        name: "BTC pullbacks",
        provider: "binance",
        symbol: "BTCUSDT",
        resolution: "15m",
        startAt: t0,
        settings: { initialBalance: 5_000, riskValue: 2 },
      }),
    );
    expect(created.status).toBe(200);
    const { session: made } = await created.json();
    expect(made).toMatchObject({
      cursorAt: t0,
      settings: { initialBalance: 5_000, riskValue: 2, currency: "USD" },
    });
    expect(made.state).toEqual(newBacktest({ initialBalance: 5_000 }));

    const config = { ...DEFAULT_BACKTEST_CONFIG, initialBalance: 5_000 };
    let state = placeOrder(
      made.state,
      { side: "long", type: "market", qty: 1, stop: 95 },
      candle(0, 100, 100, 100, 100),
      config,
    ).state;
    state = stepBar(state, candle(1, 100, 101, 94, 96), config).state;
    const saved = await session.PATCH(
      body({ cursorAt: t0 + 15 * M, state, notes: "Only with the trend" }, "PATCH"),
      ctx(made.id),
    );
    expect(saved.status).toBe(200);
    const listed = await (await sessions.GET()).json();
    expect(listed.sessions[0]).toMatchObject({
      trades: 1,
      netProfit: -5,
      winRate: 0,
      currency: "USD",
    });
    const read = await (await session.GET(new Request("http://journal.test"), ctx(made.id))).json();
    expect(read.session).toMatchObject({ cursorAt: t0 + 15 * M, notes: "Only with the trend" });
    expect(read.session.state.trades[0]).toMatchObject({ exitReason: "stop", netPnl: -5 });
  });

  it("refuses a bad session, a bad state and a missing one", async () => {
    expect(
      (
        await sessions.POST(
          body({ name: "x", provider: "nope", symbol: "A", resolution: "1h", startAt: t0 }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await sessions.POST(
          body({
            name: "x",
            provider: "binance",
            symbol: "BTCUSDT",
            resolution: "1h",
            startAt: Date.now() + 86_400_000,
          }),
        )
      ).status,
    ).toBe(400);
    const { session: made } = await (
      await sessions.POST(
        body({
          name: "Second",
          provider: "binance",
          symbol: "ETHUSDT",
          resolution: "1h",
          startAt: t0,
        }),
      )
    ).json();
    const bad = await session.PATCH(body({ state: { balance: "lots" } }, "PATCH"), ctx(made.id));
    expect(bad.status).toBe(400);
    expect(
      (await session.DELETE(new Request("http://journal.test", { method: "DELETE" }), ctx(made.id)))
        .status,
    ).toBe(200);
    expect((await session.GET(new Request("http://journal.test"), ctx(made.id))).status).toBe(404);
  });
});

describe("a strategy's results as a report", () => {
  it("counts closed trades only, with their commission and candles held", () => {
    const bars = Array.from({ length: 10 }, (_, i) => candle(i, 100, 101, 99, 100));
    const report = strategyReport(
      [
        {
          id: "1",
          side: "long",
          qty: 1,
          open: false,
          entry: { id: "L", time: bars[1]!.time, price: 100 },
          exit: { id: "X", time: bars[4]!.time, price: 110 },
          pnl: 9,
          commission: 1,
        },
        {
          id: "2",
          side: "short",
          qty: 1,
          open: false,
          entry: { id: "S", time: bars[5]!.time, price: 110 },
          exit: { id: "X", time: bars[6]!.time, price: 112 },
          pnl: -3,
          commission: 1,
        },
        {
          id: "3",
          side: "long",
          qty: 1,
          open: true,
          entry: { id: "L", time: bars[8]!.time, price: 100 },
        },
      ],
      bars,
      1_000,
    );
    expect(report).toMatchObject({
      trades: 2,
      netProfit: 6,
      commission: 2,
      avgBars: 2,
      winRate: 0.5,
    });
    expect(report.long.trades).toBe(1);
  });
});
