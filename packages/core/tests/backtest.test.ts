import { describe, expect, it } from "vitest";
import {
  BacktestError,
  DEFAULT_BACKTEST_CONFIG,
  backtestReport,
  cancelOrder,
  closePosition,
  modifyPosition,
  newBacktest,
  placeOrder,
  sizeForRisk,
  stepBar,
  type BacktestBar,
  type BacktestConfig,
  type BacktestState,
} from "../src/backtest";

const config: BacktestConfig = { ...DEFAULT_BACKTEST_CONFIG, initialBalance: 10_000 };
let t = 0;
const bar = (open: number, high: number, low: number, close: number): BacktestBar => ({
  time: (t += 60_000),
  open,
  high,
  low,
  close,
});
const run = (state: BacktestState, bars: BacktestBar[], cfg = config) =>
  bars.reduce((s, b) => stepBar(s, b, cfg).state, state);

describe("a replayed trade from order to exit", () => {
  it("a market buy fills at the current close and its stop takes it out", () => {
    const now = bar(100, 101, 99, 100);
    let s = placeOrder(
      newBacktest(config),
      { side: "long", type: "market", qty: 10, stop: 98, target: 106 },
      now,
      config,
    ).state;
    expect(s.position).toMatchObject({ side: "long", entryPrice: 100, risk: 20 });
    s = run(s, [bar(100, 101, 99, 100.5), bar(100.5, 100.8, 97.5, 98)]);
    expect(s.position).toBeNull();
    expect(s.trades[0]).toMatchObject({
      exitReason: "stop",
      exitPrice: 98,
      netPnl: -20,
      r: -1,
      bars: 2,
    });
    expect(s.balance).toBe(9_980);
  });

  it("a target is taken at its price, and a gap through the stop at the open", () => {
    const now = bar(100, 100, 100, 100);
    const short = placeOrder(
      newBacktest(config),
      { side: "short", type: "market", qty: 1, stop: 105, target: 90 },
      now,
      config,
    ).state;
    expect(run(short, [bar(99, 99, 89, 91)]).trades[0]).toMatchObject({
      exitReason: "target",
      exitPrice: 90,
      netPnl: 10,
    });
    const long = placeOrder(
      newBacktest(config),
      { side: "long", type: "market", qty: 1, stop: 95 },
      now,
      config,
    ).state;
    // Opens at 92, beyond the 95 stop: filled at 92, worse than the stop.
    expect(run(long, [bar(92, 94, 91, 93)]).trades[0]).toMatchObject({
      exitReason: "stop",
      exitPrice: 92,
      netPnl: -8,
    });
  });

  it("when one candle reaches both the stop and the target, the stop counts and the trade says so", () => {
    const now = bar(100, 100, 100, 100);
    const s = placeOrder(
      newBacktest(config),
      { side: "long", type: "market", qty: 1, stop: 95, target: 110 },
      now,
      config,
    ).state;
    const wide = bar(100, 111, 94, 105);
    expect(run(s, [wide]).trades[0]).toMatchObject({ exitReason: "stop", ambiguous: true });
    expect(run(s, [wide], { ...config, sameCandle: "target-first" }).trades[0]).toMatchObject({
      exitReason: "target",
      ambiguous: true,
    });
  });

  it("a buy limit fills when price comes down to it, at the open if it gaps below", () => {
    const now = bar(100, 100, 100, 100);
    const s = placeOrder(
      newBacktest(config),
      { side: "long", type: "limit", qty: 1, price: 97, stop: 94 },
      now,
      config,
    ).state;
    expect(s.orders).toHaveLength(1);
    expect(run(s, [bar(99, 100, 98, 99)]).position).toBeNull();
    expect(run(s, [bar(99, 99.5, 96.5, 98)]).position).toMatchObject({ entryPrice: 97 });
    expect(run(s, [bar(95, 96, 94.5, 95.5)]).position).toMatchObject({ entryPrice: 95 });
  });

  it("a sell stop enters on the breakdown, with slippage against it, and an entry and stop in one candle is flagged", () => {
    const now = bar(100, 100, 100, 100);
    const cfg = { ...config, slippage: 0.1 };
    const s = placeOrder(
      newBacktest(cfg),
      { side: "short", type: "stop", qty: 1, price: 98, stop: 99 },
      now,
      cfg,
    ).state;
    const entered = run(s, [bar(98.5, 98.6, 97.8, 98.2)], cfg);
    expect(entered.position?.entryPrice).toBeCloseTo(97.9);
    // Breaks down to 98 and back up through 99 in the same candle: stopped, flagged.
    const whipsaw = run(s, [bar(99.5, 99.4, 97.5, 99.3)], cfg);
    expect(whipsaw.trades[0]).toMatchObject({ exitReason: "stop", ambiguous: true });
  });

  it("orders on the wrong side of the price, or a stop above a long's entry, are refused", () => {
    const now = bar(100, 100, 100, 100);
    const start = newBacktest(config);
    expect(() =>
      placeOrder(start, { side: "long", type: "limit", qty: 1, price: 101 }, now, config),
    ).toThrow(BacktestError);
    expect(() =>
      placeOrder(start, { side: "long", type: "stop", qty: 1, price: 99 }, now, config),
    ).toThrow(/limit order/);
    expect(() =>
      placeOrder(start, { side: "long", type: "market", qty: 1, stop: 101 }, now, config),
    ).toThrow(/below the entry/);
    expect(() => placeOrder(start, { side: "long", type: "market", qty: 0 }, now, config)).toThrow(
      /above zero/,
    );
    const open = placeOrder(start, { side: "long", type: "market", qty: 1 }, now, config).state;
    expect(() => placeOrder(open, { side: "short", type: "market", qty: 1 }, now, config)).toThrow(
      /Close the open position/,
    );
  });

  it("moving the stop to breakeven keeps 1R, and a manual close pays commission both ways", () => {
    const cfg = { ...config, commissionPerFill: 2, commissionRate: 0.001 };
    const now = bar(100, 100, 100, 100);
    let s = placeOrder(
      newBacktest(cfg),
      { side: "long", type: "market", qty: 10, stop: 95 },
      now,
      cfg,
    ).state;
    s = run(s, [bar(100, 106, 100, 105)], cfg);
    s = modifyPosition(s, { stop: 100, target: null }, 105);
    expect(s.position?.risk).toBe(50);
    const { state: done } = closePosition(s, bar(105, 108, 104, 107), cfg);
    const trade = done.trades[0]!;
    expect(trade.grossPnl).toBe(70);
    // 2 + 0.1% of 1000 on entry, 2 + 0.1% of 1070 on exit.
    expect(trade.fees).toBeCloseTo(6.07);
    expect(trade.r).toBeCloseTo((70 - 6.07) / 50);
    // The close at 107 is the best price it reached.
    expect(trade.mfe).toBe(70);
  });

  it("a cancelled order never fills", () => {
    const now = bar(100, 100, 100, 100);
    const s = placeOrder(
      newBacktest(config),
      { side: "long", type: "limit", qty: 1, price: 99 },
      now,
      config,
    ).state;
    expect(run(cancelOrder(s, s.orders[0]!.id), [bar(99, 99, 90, 91)]).position).toBeNull();
  });

  it("the worst and best open results are tracked while the position is open", () => {
    const now = bar(100, 100, 100, 100);
    let s = placeOrder(
      newBacktest(config),
      { side: "long", type: "market", qty: 2 },
      now,
      config,
    ).state;
    s = run(s, [bar(100, 103, 96, 101), bar(101, 104, 99, 102)]);
    expect(s.position).toMatchObject({ mae: -8, mfe: 8, bars: 2 });
  });
});

describe("sizing a trade from its risk", () => {
  it("risks the amount at the stop, rounded down to the lot size", () => {
    expect(sizeForRisk(100, 98, 100)).toBe(50);
    expect(sizeForRisk(4000, 3990, 500, 50)).toBe(1);
    expect(sizeForRisk(1.1, 1.099, 100, 1, 1000)).toBe(100_000);
    expect(sizeForRisk(83_000, 82_500, 100, 1, 0.001)).toBeCloseTo(0.2);
    expect(sizeForRisk(100, 100, 100)).toBe(0);
  });
});

describe("the backtest report", () => {
  const trade = (netPnl: number, r: number | null, side: "long" | "short" = "long", i = 0) => ({
    netPnl,
    r,
    side,
    fees: 1,
    bars: 4,
    exitTime: 1_000 * (i + 1),
    ambiguous: false,
  });

  it("summarises results like a strategy tester", () => {
    const trades = [
      trade(200, 2),
      trade(-100, -1),
      trade(-100, -1),
      trade(300, 3, "short"),
      trade(0, 0),
    ].map((x, i) => ({ ...x, exitTime: 1_000 * (i + 1) }));
    const report = backtestReport(trades, 1_000);
    expect(report).toMatchObject({
      trades: 5,
      wins: 2,
      losses: 2,
      breakeven: 1,
      winRate: 0.4,
      netProfit: 300,
      grossProfit: 500,
      grossLoss: 200,
      profitFactor: 2.5,
      avgWin: 250,
      avgLoss: 100,
      payoff: 2.5,
      largestWin: 300,
      largestLoss: -100,
      maxConsecutiveLosses: 2,
      maxDrawdown: 200,
      returnPct: 0.3,
      commission: 5,
      avgBars: 4,
    });
    expect(report.maxDrawdownPct).toBeCloseTo(200 / 1_200);
    expect(report.avgR).toBeCloseTo(0.6);
    expect(report.long.trades).toBe(4);
    expect(report.short).toMatchObject({ trades: 1, netProfit: 300, winRate: 1 });
    expect(report.equity.map((p) => p.equity)).toEqual([1_000, 1_200, 1_100, 1_000, 1_300, 1_300]);
  });

  it("says nothing it cannot know with no trades or no losses", () => {
    const empty = backtestReport([], 1_000);
    expect(empty).toMatchObject({
      trades: 0,
      winRate: null,
      profitFactor: null,
      avgR: null,
      maxDrawdownPct: null,
    });
    const winners = backtestReport([trade(50, null)], 1_000);
    expect(winners).toMatchObject({ profitFactor: null, profitFactorIsInfinite: true, avgR: null });
  });
});
