import { describe, expect, it } from "vitest";
import {
  edgeTest,
  evaluateClaim,
  mirrorClaim,
  simulateSetup,
  wilsonInterval,
  type ClaimBar,
  type ClaimOutcome,
  type ClaimToEvaluate,
} from "../src/claims";

/**
 * Evidence that the evaluation can be trusted, beyond hand-picked examples: thousands of
 * seeded random markets and claims, checked against an independent implementation and
 * against properties any correct evaluation must have. Seeded, so every run is the same.
 */

/** A small deterministic random generator (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H = 3_600_000;
const T0 = Date.parse("2026-01-05T00:00:00Z");
const BEFORE = 60;

/** A random-walk market: hourly candles, ±`vol` per candle, wicks around the body. */
function market(rand: () => number, count: number, vol = 0.01, start = 100): ClaimBar[] {
  const bars: ClaimBar[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open * Math.exp((rand() - 0.5) * 2 * vol);
    const high = Math.max(open, close) * (1 + rand() * vol * 0.6);
    const low = Math.min(open, close) * (1 - rand() * vol * 0.6);
    bars.push({ time: T0 + i * H, open, high, low, close });
    price = close;
  }
  return bars;
}

/** A random claim made after BEFORE candles: direction, target and invalidation distances. */
function randomClaim(rand: () => number, reference: number, horizon = 48): ClaimToEvaluate {
  const long = rand() < 0.5;
  const s = long ? 1 : -1;
  // One claim in ten has levels so close that one candle can reach both (ambiguous).
  const tight = rand() < 0.1;
  const reach = tight ? 0.002 : 0.005 + rand() * 0.05;
  const risk = tight ? 0.002 : 0.005 + rand() * 0.05;
  return {
    direction: long ? "long" : "short",
    claimTime: T0 + BEFORE * H,
    horizonEnd: T0 + (BEFORE + horizon) * H,
    horizonSource: "stated",
    targets: [reference * (1 + s * reach)],
    invalidation: rand() < 0.85 ? reference * (1 - s * risk) : null,
    invalidationOn: rand() < 0.3 ? "close" : "touch",
    trigger: null,
  };
}

const NOW = T0 + 10_000 * H;
const referenceOf = (bars: ClaimBar[]) => bars[BEFORE - 1]!.close;

/**
 * An independent reading of the rules, written another way (first index of each event,
 * then compared): the status and decision times must always agree with `evaluateClaim`.
 */
function oracle(claim: ClaimToEvaluate, bars: ClaimBar[]) {
  const reference = bars.filter((b) => b.time + H <= claim.claimTime).at(-1)!.close;
  const s = claim.direction === "long" ? 1 : -1;
  const after = bars.filter((b) => b.time >= claim.claimTime);
  const target = claim.targets
    .filter((t) => (t - reference) * s > 0)
    .sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference))[0];
  const hitIndex =
    target === undefined
      ? -1
      : after.findIndex((b) => (s > 0 ? b.high >= target : b.low <= target));
  const inv = claim.invalidation;
  const outIndex =
    inv === null
      ? -1
      : after.findIndex((b) =>
          claim.invalidationOn === "close"
            ? s > 0
              ? b.close <= inv
              : b.close >= inv
            : s > 0
              ? b.low <= inv
              : b.high >= inv,
        );
  const inHorizon = (i: number) => i >= 0 && after[i]!.time < claim.horizonEnd!;
  const complete = bars.at(-1)!.time + H >= claim.horizonEnd!;
  const first = [hitIndex, outIndex].filter((i) => i >= 0);
  const decided = first.length ? Math.min(...first) : -1;
  if (inHorizon(decided)) {
    if (hitIndex === outIndex) return { status: "ambiguous", at: after[decided]!.time };
    return decided === hitIndex
      ? { status: "target_hit", at: after[hitIndex]!.time }
      : { status: "invalidated", at: after[outIndex]!.time };
  }
  if (!complete) return { status: "pending", at: null };
  if (hitIndex >= 0 && (outIndex < 0 || hitIndex < outIndex))
    return { status: "target_hit_late", at: after[hitIndex]!.time };
  return { status: "expired", at: null };
}

const decidedAt = (o: ClaimOutcome) =>
  o.status === "target_hit" ? o.targetHitAt : o.status === "invalidated" ? o.invalidatedAt : null;

describe("the evaluation agrees with an independent implementation", () => {
  it("on 3000 random markets and claims", () => {
    const rand = random(42);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      // Some markets end before the horizon, to cover pending claims.
      const bars = market(rand, BEFORE + 20 + Math.floor(rand() * 60));
      const claim = randomClaim(rand, referenceOf(bars));
      const outcome = evaluateClaim(claim, bars, NOW);
      const expected = oracle(claim, bars);
      expect(outcome.status, `case ${i}`).toBe(expected.status);
      if (expected.status === "target_hit") expect(outcome.targetHitAt).toBe(expected.at);
      if (expected.status === "invalidated") expect(outcome.invalidatedAt).toBe(expected.at);
      counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
    }
    // Every outcome came up, so none of the branches went untested.
    for (const status of [
      "target_hit",
      "invalidated",
      "expired",
      "pending",
      "target_hit_late",
      "ambiguous",
    ])
      expect(counts[status], status).toBeGreaterThan(0);
  });
});

describe("properties any correct evaluation has", () => {
  it("never changes a decided outcome when later candles arrive (no look-ahead)", () => {
    const rand = random(7);
    let checked = 0;
    for (let i = 0; i < 1500; i++) {
      const bars = market(rand, BEFORE + 120);
      const claim = randomClaim(rand, referenceOf(bars), 200);
      const full = evaluateClaim(claim, bars, NOW);
      const at = decidedAt(full);
      if (at === null) continue;
      // Only the candles up to the deciding one: the same outcome, at the same time.
      const cut = evaluateClaim(
        claim,
        bars.filter((b) => b.time <= at),
        NOW,
      );
      expect(cut.status).toBe(full.status);
      expect(decidedAt(cut)).toBe(at);
      // One candle fewer: it is not decided yet.
      expect(
        evaluateClaim(
          claim,
          bars.filter((b) => b.time < at),
          NOW,
        ).status,
      ).toBe("pending");
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("reads candles after `now` as unknown", () => {
    const rand = random(11);
    for (let i = 0; i < 300; i++) {
      const bars = market(rand, BEFORE + 100);
      const claim = randomClaim(rand, referenceOf(bars), 80);
      const now = T0 + (BEFORE + 10) * H;
      const outcome = evaluateClaim(claim, bars, now);
      const at = decidedAt(outcome);
      if (at !== null) expect(at).toBeLessThanOrEqual(now);
      else expect(["pending", "ambiguous"]).toContain(outcome.status);
    }
  });

  it("gives the mirrored claim on the mirrored market the same outcome (no bias to longs or shorts)", () => {
    const rand = random(3);
    for (let i = 0; i < 1000; i++) {
      const bars = market(rand, BEFORE + 80);
      const reference = referenceOf(bars);
      const claim = randomClaim(rand, reference);
      // Each price p becomes reference² / p: rises become equal falls, highs become lows.
      const flip = (p: number) => (reference * reference) / p;
      const mirrored = bars.map((b) => ({
        time: b.time,
        open: flip(b.open),
        high: flip(b.low),
        low: flip(b.high),
        close: flip(b.close),
      }));
      const a = evaluateClaim(claim, bars, NOW);
      const b = evaluateClaim(mirrorClaim(claim, reference), mirrored, NOW);
      expect(b.status, `case ${i}`).toBe(a.status);
      expect(decidedAt(b)).toBe(decidedAt(a));
      // Returns are not symmetric in percent: a rise of x mirrors to a fall of 1 - 1/(1 + x).
      // (The long side's rise is the x.)
      const [rise, fall] = a.side === "long" ? [a.mfe!, b.mfe!] : [b.mfe!, a.mfe!];
      expect(1 - fall).toBeCloseTo(1 / (1 + rise), 9);
    }
  });

  it("does not depend on the price's scale", () => {
    const rand = random(5);
    for (let i = 0; i < 500; i++) {
      const bars = market(rand, BEFORE + 80);
      const claim = randomClaim(rand, referenceOf(bars));
      const k = 0.001 + rand() * 1000;
      const scaled = bars.map((b) => ({
        ...b,
        open: b.open * k,
        high: b.high * k,
        low: b.low * k,
        close: b.close * k,
      }));
      const scaledClaim = {
        ...claim,
        targets: claim.targets.map((t) => t * k),
        invalidation: claim.invalidation === null ? null : claim.invalidation * k,
      };
      const a = evaluateClaim(claim, bars, NOW);
      const b = evaluateClaim(scaledClaim, scaled, NOW);
      expect(b.status).toBe(a.status);
      expect(b.mfe).toBeCloseTo(a.mfe!, 6);
      expect(b.mae).toBeCloseTo(a.mae!, 6);
    }
  });

  it("only ever lowers a simulated trade's net result as costs rise", () => {
    const rand = random(9);
    let trades = 0;
    for (let i = 0; i < 1000; i++) {
      const bars = market(rand, BEFORE + 80);
      const reference = referenceOf(bars);
      const long = rand() < 0.5;
      const s = long ? 1 : -1;
      const setup = {
        direction: (long ? "long" : "short") as "long" | "short",
        entryLow: reference * (1 - s * 0.004),
        entryHigh: reference * (1 - s * 0.004),
        stop: reference * (1 - s * 0.02),
        targets: [reference * (1 + s * 0.02)],
      };
      const timing = { claimTime: T0 + BEFORE * H, horizonEnd: T0 + (BEFORE + 48) * H };
      const net = (bps: number) =>
        simulateSetup(setup, timing, bars, NOW, {
          commissionBps: bps,
          slippageBps: bps,
          targetBufferBps: 2,
        }).trade?.netReturn ?? null;
      const [free, base, double] = [net(0), net(5), net(10)];
      if (free === null || base === null || double === null) continue;
      expect(base).toBeLessThanOrEqual(free + 1e-12);
      expect(double).toBeLessThanOrEqual(base + 1e-12);
      trades++;
    }
    expect(trades).toBeGreaterThan(200);
  });
});

describe("the statistics mean what they say", () => {
  it("95% Wilson intervals hold the true rate about 95% of the time", () => {
    const rand = random(21);
    for (const [p, n] of [
      [0.3, 50],
      [0.6, 20],
      [0.9, 100],
    ]) {
      let covered = 0;
      const trials = 4000;
      for (let i = 0; i < trials; i++) {
        let k = 0;
        for (let j = 0; j < n!; j++) if (rand() < p!) k++;
        const interval = wilsonInterval(k, n!)!;
        if (interval.low <= p! && p! <= interval.high) covered++;
      }
      expect(covered / trials, `p=${p} n=${n}`).toBeGreaterThan(0.92);
      expect(covered / trials, `p=${p} n=${n}`).toBeLessThan(0.98);
    }
  });

  it("computes the sign test exactly", () => {
    // 9 against 1: 2 × P(X ≥ 9 | n = 10) = 2 × 11 / 1024.
    expect(
      edgeTest([
        ...Array(9).fill({ analyst: true, mirror: false }),
        { analyst: false, mirror: true },
      ]).pValue,
    ).toBeCloseTo(22 / 1024, 10);
    expect(edgeTest([{ analyst: true, mirror: true }]).pValue).toBeNull();
    expect(
      edgeTest([
        { analyst: true, mirror: false },
        { analyst: false, mirror: true },
      ]).pValue,
    ).toBe(1);
  });

  /** Many "analysts", each with `claims` claims on random walks; how often their edge test fires. */
  function falseAlarmRate(
    pick: (rand: () => number, bars: ClaimBar[], horizonEnd: number) => boolean,
    seed: number,
  ) {
    const rand = random(seed);
    let fired = 0;
    const analysts = 150;
    for (let a = 0; a < analysts; a++) {
      const pairs: { analyst: boolean; mirror: boolean }[] = [];
      for (let c = 0; c < 40; c++) {
        const bars = market(rand, BEFORE + 60);
        const reference = referenceOf(bars);
        const claim = randomClaim(rand, reference, 48);
        const long = pick(rand, bars, claim.horizonEnd!);
        const s = long ? 1 : -1;
        const reach = Math.abs(claim.targets[0]! / reference - 1);
        const directed = {
          ...claim,
          direction: (long ? "long" : "short") as "long" | "short",
          targets: [reference * (1 + s * reach)],
          invalidation: reference * (1 - s * reach),
        };
        const own = evaluateClaim(directed, bars, NOW);
        const mirror = evaluateClaim(mirrorClaim(directed, reference), bars, NOW);
        const settled = (o: ClaimOutcome) =>
          ["target_hit", "invalidated", "expired", "target_hit_late"].includes(o.status);
        if (settled(own) && settled(mirror))
          pairs.push({
            analyst: own.status === "target_hit",
            mirror: mirror.status === "target_hit",
          });
      }
      const p = edgeTest(pairs).pValue;
      if (p !== null && p < 0.05) fired++;
    }
    return fired / analysts;
  }

  it("finds no edge in analysts who guess (false alarms near the 5% expected)", () => {
    expect(falseAlarmRate((rand) => rand() < 0.5, 101)).toBeLessThan(0.1);
  });

  it("finds the edge of an analyst who really knows where price goes", () => {
    const knows = (_rand: () => number, bars: ClaimBar[], horizonEnd: number) => {
      const last = bars.filter((b) => b.time < horizonEnd).at(-1)!.close;
      return last >= referenceOf(bars);
    };
    expect(falseAlarmRate(knows, 202)).toBeGreaterThan(0.8);
  });
});
