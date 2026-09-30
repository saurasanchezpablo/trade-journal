import { describe, expect, it } from "vitest";
import { PineTS } from "pinets";
import { EXAMPLE_STRATEGIES } from "../src/lib/backtest-strategies";

// A swinging hourly series: crossovers and oversold dips every few days.
const candles = Array.from({ length: 600 }, (_, i) => {
  const base = 100 + Math.sin(i / 15) * 10 + Math.sin(i / 4) * 2;
  return {
    openTime: Date.UTC(2026, 0, 1) + i * 3_600_000,
    open: base,
    high: base + 1.5,
    low: base - 1.5,
    close: base + Math.sin(i) * 0.5,
    volume: 1000,
    closeTime: Date.UTC(2026, 0, 1) + (i + 1) * 3_600_000 - 1,
  };
});

describe("the strategy tester's example strategies", () => {
  for (const example of EXAMPLE_STRATEGIES)
    it(`"${example.name}" runs and trades`, async () => {
      const context = await new PineTS(candles, "BINANCE:BTCUSDT", "60").run(example.source);
      const strategy = (context as { strategy?: { closedtrades?: unknown[] } }).strategy;
      expect(Array.isArray(strategy?.closedtrades)).toBe(true);
      expect(strategy!.closedtrades!.length).toBeGreaterThan(2);
    });
});
