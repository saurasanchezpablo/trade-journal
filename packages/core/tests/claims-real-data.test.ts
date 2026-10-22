import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateClaim,
  mirrorClaim,
  simulateSetup,
  type ClaimBar,
  type ClaimToEvaluate,
} from "../src/claims";

/**
 * Real market data: Binance BTCUSDT hourly candles around 1 October 2026, with the expected
 * results computed independently (a separate Python script over the same candles), so this
 * guards the engine against real candles, gaps and all, not only hand-made ones.
 */
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/btcusdt-1h-2026-10.json", import.meta.url), "utf8"),
) as {
  claimTime: number;
  horizonEnd: number;
  bars: ClaimBar[];
  expected: {
    referencePrice: number;
    rally: { targetHitAt: number; status: string };
    flush: { targetHitAt: number; status: string };
    setup: {
      entryPrice: number;
      entryTime: number;
      exit: string;
      exitTime: number;
      exitPrice: number;
      netReturn: number;
      r: number;
    };
  };
};
const NOW = Date.parse("2026-10-22T00:00:00Z");
const claim = (overrides: Partial<ClaimToEvaluate>): ClaimToEvaluate => ({
  direction: "long",
  claimTime: fixture.claimTime,
  horizonEnd: fixture.horizonEnd,
  horizonSource: "convention",
  targets: [],
  invalidation: null,
  invalidationOn: "touch",
  trigger: null,
  ...overrides,
});

describe("claims on real bitcoin candles (October 2026)", () => {
  it("takes the last close before the video as the reference", () => {
    const outcome = evaluateClaim(
      claim({ targets: [87000], invalidation: 80000 }),
      fixture.bars,
      NOW,
    );
    expect(outcome.referencePrice).toBe(fixture.expected.referencePrice);
  });

  it("finds the rally to 87,000 on the candle it happened", () => {
    const outcome = evaluateClaim(
      claim({ targets: [87000], invalidation: 80000 }),
      fixture.bars,
      NOW,
    );
    expect(outcome.status).toBe(fixture.expected.rally.status);
    expect(outcome.targetHitAt).toBe(fixture.expected.rally.targetHitAt);
  });

  it("finds that the rally's mirror also reached its target (8 October, 15:00), so the pair says nothing about skill", () => {
    const rally = claim({ targets: [87000], invalidation: 80000 });
    const mirror = evaluateClaim(
      mirrorClaim(rally, fixture.expected.referencePrice),
      fixture.bars,
      NOW,
    );
    expect(mirror.target).toBeCloseTo(80921.57, 2);
    expect(mirror.status).toBe("target_hit");
    expect(new Date(mirror.targetHitAt!).toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });

  it("finds the drop to 80,000 only after the horizon", () => {
    const outcome = evaluateClaim(
      claim({ direction: "short", targets: [80000], invalidation: 88000 }),
      fixture.bars,
      NOW,
    );
    expect(outcome.status).toBe(fixture.expected.flush.status);
    expect(outcome.targetHitAt).toBe(fixture.expected.flush.targetHitAt);
  });

  it("trades the long setup to the same fills and result", () => {
    const result = simulateSetup(
      { direction: "long", entryLow: 84000, entryHigh: 84500, stop: 82500, targets: [86500] },
      { claimTime: fixture.claimTime, horizonEnd: fixture.horizonEnd },
      fixture.bars,
      NOW,
      { commissionBps: 5, slippageBps: 5, targetBufferBps: 2 },
    );
    const e = fixture.expected.setup;
    expect(result.trade).toMatchObject({
      entryTime: e.entryTime,
      exit: e.exit,
      exitTime: e.exitTime,
    });
    expect(result.trade!.entryPrice).toBeCloseTo(e.entryPrice, 8);
    expect(result.trade!.exitPrice).toBeCloseTo(e.exitPrice, 8);
    expect(result.trade!.netReturn).toBeCloseTo(e.netReturn, 12);
    expect(result.trade!.r).toBeCloseTo(e.r, 10);
  });
});
