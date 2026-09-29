import { describe, expect, it } from "vitest";
import type { AnnotatedTrade } from "../src/types";
import { afterLossStreak, dayOrder, detectBehaviours, revengeTrades } from "../src/behaviour";

let n = 0;
/** A closed trade: opened at `open` (UTC ISO), held `minutes`, net `pnl`. */
const trade = (
  open: string,
  pnl: number,
  over: Partial<AnnotatedTrade> & { minutes?: number } = {},
): AnnotatedTrade => {
  const { minutes = 10, ...rest } = over;
  const closedAt = new Date(Date.parse(open) + minutes * 60_000).toISOString();
  return {
    key: `k${++n}`,
    accountId: "a",
    symbol: "ES",
    direction: "long",
    status: pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven",
    openedAt: open,
    closedAt,
    quantity: 1,
    openQuantity: 0,
    avgEntry: 100,
    avgExit: 100,
    grossPnl: pnl,
    fees: 0,
    netPnl: pnl,
    executionCount: 2,
    executionIds: [],
    exits: [],
    durationMs: minutes * 60_000,
    ...rest,
  };
};
const at = (day: number, hh: number, mm = 0) =>
  `2026-03-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`;

describe("revenge trades", () => {
  it("are trades opened within minutes of a loss closing, on the same account", () => {
    const loss = trade(at(2, 14), -50); // closes 14:10
    const quick = trade(at(2, 14, 20), -30);
    const later = trade(at(2, 15), 20);
    const other = trade(at(2, 14, 15), 10, { accountId: "b" });
    const keys = revengeTrades([loss, quick, later, other], 15);
    expect([...keys]).toEqual([quick.key]);
  });
});

describe("trading on after losses", () => {
  it("counts trades after two losses in a row that day, not across days", () => {
    const a = trade(at(2, 14), -10);
    const b = trade(at(2, 14, 20), -10);
    const c = trade(at(2, 15), 5);
    const d = trade(at(3, 14), 5);
    expect([...afterLossStreak([a, b, c, d], 2)]).toEqual([c.key]);
  });

  it("uses the journal's timezone for the day", () => {
    // 23:00 and 23:30 UTC are the next morning in Tokyo, with the 00:30 trade.
    const a = trade("2026-03-02T23:00:00.000Z", -10);
    const b = trade("2026-03-02T23:20:00.000Z", -10);
    const c = trade("2026-03-03T00:30:00.000Z", 5);
    expect(afterLossStreak([a, b, c], 2, "UTC").has(c.key)).toBe(false);
    expect(afterLossStreak([a, b, c], 2, "Asia/Tokyo").has(c.key)).toBe(true);
  });
});

describe("the behaviour report", () => {
  it("flags a habit only with enough trades and worse results than the rest", () => {
    const trades: AnnotatedTrade[] = [];
    for (let day = 2; day <= 13; day += 1) {
      trades.push(trade(at(day, 14), 40)); // a calm winner
      trades.push(trade(at(day, 15), -30)); // a loss closing 15:10
      trades.push(trade(at(day, 15, 15), -35)); // straight back in: revenge
    }
    const report = detectBehaviours(trades, { minSample: 5 });
    const revenge = report.patterns.find((p) => p.kind === "revenge")!;
    expect(revenge.flagged).toBe(true);
    expect(revenge.flaggedSide.trades).toBe(12);
    expect(revenge.flaggedSide.avgPnl).toBe(-35);
    expect(revenge.baseline.avgPnl).toBe(5);
    expect(revenge.cost).toBe(480);
    expect(revenge.examples).toHaveLength(5);
    expect(revenge.summary).toBe(
      "12 trades opened within 15 minutes of a loss: 0% won, -35.00 a trade, against 50% and +5.00 for the rest.",
    );
    // Too few to say anything: not flagged, but still reported.
    const small = detectBehaviours(trades.slice(0, 6), { minSample: 5 });
    expect(small.patterns.find((p) => p.kind === "revenge")!.flagged).toBe(false);
  });

  it("does not flag a habit that does no harm", () => {
    const trades: AnnotatedTrade[] = [];
    for (let day = 2; day <= 13; day += 1) {
      trades.push(trade(at(day, 14), -30));
      trades.push(trade(at(day, 14, 15), 60)); // quick re-entries that win
    }
    const revenge = detectBehaviours(trades).patterns.find((p) => p.kind === "revenge")!;
    expect(revenge.flaggedSide.trades).toBe(12);
    expect(revenge.flagged).toBe(false);
  });

  it("finds size creeping up on a symbol, and results fading later in the day", () => {
    const trades: AnnotatedTrade[] = [];
    for (let i = 0; i < 18; i += 1)
      trades.push(trade(at(2 + i, 14), i < 12 ? 20 : -40, { quantity: i < 12 ? 1 : 2 }));
    const creep = detectBehaviours(trades).patterns.find((p) => p.kind === "size-creep")!;
    expect(creep.flagged).toBe(true);
    expect(creep.detail).toEqual([{ symbol: "ES", earlier: 1, recent: 2, ratio: 2 }]);

    const days: AnnotatedTrade[] = [];
    for (let day = 2; day <= 8; day += 1)
      for (let k = 0; k < 5; k += 1) days.push(trade(at(day, 14 + k), k < 3 ? 25 : -20));
    const order = dayOrder(days);
    expect(order.get(days[3]!.key)).toBe(4);
    const fade = detectBehaviours(days).patterns.find((p) => p.kind === "late-fade")!;
    expect(fade.flagged).toBe(true);
    expect(fade.flaggedSide.trades).toBe(14);
  });

  it("flags sizing up right after a loss when it costs money", () => {
    const trades: AnnotatedTrade[] = [];
    for (let day = 2; day <= 13; day += 1) {
      trades.push(trade(at(day, 14), -20, { quantity: 1 }));
      trades.push(trade(at(day, 16), -60, { quantity: 3 }));
      trades.push(trade(at(day, 18), 30, { quantity: 1 }));
    }
    const up = detectBehaviours(trades).patterns.find((p) => p.kind === "size-after-loss")!;
    expect(up.flaggedSide.trades).toBe(12);
    expect(up.flagged).toBe(true);
  });

  it("ignores open trades", () => {
    const open = { ...trade(at(2, 14), 0), status: "open" as const, closedAt: undefined };
    expect(detectBehaviours([open]).trades).toBe(0);
  });
});
