/**
 * Video intelligence: claims an analyst made (a forecast, a conditional scenario, a trade
 * setup) checked against what the market did afterwards. Pure and deterministic: the same
 * claim over the same candles always gives the same outcome, so every result can be
 * reproduced from the stored claim, the stored candles and `CLAIM_EVALUATOR_VERSION`.
 *
 * Rules that a candle cannot settle are stated, applied the careful way and flagged:
 * - The reference price is the close of the last candle that had closed by the claim's time;
 *   nothing after the claim is used to describe what was known then.
 * - Only candles that open at or after the claim count as "afterwards" (the candle the claim
 *   was made inside is left out: part of it happened before).
 * - A target is reached when a candle trades at it; an invalidation "on a close" needs a
 *   close beyond it, otherwise a touch. Both inside one candle: ambiguous, never a win.
 * - A conditional claim starts at the candle after its trigger is traded through.
 * - A claim with no stated horizon gets the system's (`horizonSource: "convention"`).
 */

export const CLAIM_EVALUATOR_VERSION = "claims-eval-1";

export interface ClaimBar {
  /** Open time, epoch ms. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type ClaimDirection = "long" | "short" | "neutral";

export interface ClaimToEvaluate {
  direction: ClaimDirection;
  /** When the claim was made, epoch ms. */
  claimTime: number;
  /** End of the horizon, epoch ms (null: none known, evaluated open-ended). */
  horizonEnd: number | null;
  horizonSource: "stated" | "convention" | null;
  targets: number[];
  invalidation: number | null;
  /** Whether the invalidation needs a close beyond it ("closes below 90") or a touch. */
  invalidationOn: "close" | "touch";
  /** A conditional claim: only counts once price trades through this level. */
  trigger: { price: number; kind: "above" | "below" } | null;
}

export type ClaimStatus =
  | "pending"
  | "not_triggered"
  | "target_hit"
  | "target_hit_late"
  | "invalidated"
  | "expired"
  | "ambiguous"
  | "unevaluable";

export interface ClaimOutcome {
  status: ClaimStatus;
  /** Why the claim could not be evaluated (status "unevaluable"). */
  reason: string | null;
  /** The close of the last candle closed by the claim's time, and that candle's open time. */
  referencePrice: number | null;
  referenceTime: number | null;
  /** Long or short as evaluated (a neutral claim with targets takes their side: noted). */
  side: "long" | "short" | null;
  /** Conditional claims: when the trigger was traded through. */
  triggeredAt: number | null;
  /** The target the outcome is about: the nearest one in the claim's direction. */
  target: number | null;
  targetHitAt: number | null;
  invalidatedAt: number | null;
  /** Milliseconds from the claim (or its trigger) to the target / the invalidation. */
  timeToTarget: number | null;
  timeToInvalidation: number | null;
  /** Each stated target and when it was first reached (null: not yet). */
  targetsReached: { price: number; at: number | null }[];
  /** Best and worst move from the reference inside the horizon, as fractions (0.05 = 5%). */
  mfe: number | null;
  mae: number | null;
  /** Direction at the horizon's end: the close then against the reference. */
  directional: "correct" | "incorrect" | "flat" | null;
  horizonReturn: number | null;
  /** Whether the candles reach the end of the horizon. */
  complete: boolean;
  /** The conventions this evaluation applied, in words. */
  notes: string[];
}

/** Moves smaller than this count as flat for direction. */
export const FLAT_MOVE = 0.0005;

const sign = (side: "long" | "short") => (side === "long" ? 1 : -1);

/** The length of a candle: the most common gap between consecutive opens. */
export function barLength(bars: readonly ClaimBar[]): number {
  const gaps = new Map<number, number>();
  for (let i = 1; i < bars.length; i++) {
    const gap = bars[i]!.time - bars[i - 1]!.time;
    if (gap > 0) gaps.set(gap, (gaps.get(gap) ?? 0) + 1);
  }
  let best = 0;
  let count = 0;
  for (const [gap, n] of gaps)
    if (n > count || (n === count && gap < best)) {
      best = gap;
      count = n;
    }
  return best || 60_000;
}

const unevaluable = (reason: string, notes: string[] = []): ClaimOutcome => ({
  status: "unevaluable",
  reason,
  referencePrice: null,
  referenceTime: null,
  side: null,
  triggeredAt: null,
  target: null,
  targetHitAt: null,
  invalidatedAt: null,
  timeToTarget: null,
  timeToInvalidation: null,
  targetsReached: [],
  mfe: null,
  mae: null,
  directional: null,
  horizonReturn: null,
  complete: false,
  notes,
});

/**
 * The claim against the candles. `now` bounds what can be known: candles after it are never
 * read (a stored series can't hold them, but a test can).
 */
export function evaluateClaim(
  claim: ClaimToEvaluate,
  candles: readonly ClaimBar[],
  now: number,
): ClaimOutcome {
  const notes: string[] = [];
  const bars = [...candles].filter((b) => b.time <= now).sort((a, b) => a.time - b.time);
  if (!bars.length) return unevaluable("No candles for this instrument around the claim.");
  const step = barLength(bars);
  const before = bars.filter((b) => b.time + step <= claim.claimTime);
  const reference = before.at(-1);
  if (!reference) return unevaluable("No candle had closed by the time of the claim.");
  const after = bars.filter((b) => b.time >= claim.claimTime);
  const referencePrice = reference.close;
  if (claim.horizonSource === "convention")
    notes.push("No horizon was stated: the system's default horizon for its timeframe is used.");

  let side: "long" | "short" | null =
    claim.direction === "neutral" ? null : (claim.direction as "long" | "short");
  if (!side && claim.targets.length) {
    const above = claim.targets.filter((t) => t > referencePrice).length;
    const below = claim.targets.filter((t) => t < referencePrice).length;
    if (above && !below) side = "long";
    else if (below && !above) side = "short";
    if (side) notes.push(`No direction was stated: taken as ${side} from where the targets lie.`);
  }
  if (!side) return unevaluable("The claim names no direction and no one-sided target.", notes);
  const s = sign(side);

  const horizonEnd = claim.horizonEnd;
  const dataEnd = bars.at(-1)!.time + step;
  const complete = horizonEnd !== null && dataEnd >= horizonEnd && dataEnd <= now + step;
  const inHorizon = (b: ClaimBar) => horizonEnd === null || b.time < horizonEnd;

  // Conditional: from the candle after the trigger was traded through, inside the horizon.
  let start = 0;
  let triggeredAt: number | null = null;
  let entryPrice = referencePrice;
  if (claim.trigger) {
    const t = claim.trigger;
    const index = after.findIndex(
      (b) => inHorizon(b) && (t.kind === "above" ? b.high >= t.price : b.low <= t.price),
    );
    notes.push("A conditional claim is followed from the candle after its trigger was reached.");
    if (index < 0) {
      const outcome = unevaluable("", notes);
      return {
        ...outcome,
        status: complete ? "not_triggered" : "pending",
        reason: null,
        referencePrice,
        referenceTime: reference.time,
        side,
        complete,
        targetsReached: claim.targets.map((price) => ({ price, at: null })),
      };
    }
    triggeredAt = after[index]!.time;
    start = index + 1;
    entryPrice = t.price;
  }

  // The nearest target on the claim's side of the starting price.
  const onSide = claim.targets.filter((t) => (t - entryPrice) * s > 0);
  const ignored = claim.targets.length - onSide.length;
  if (ignored)
    notes.push(
      `${ignored} target${ignored === 1 ? " lies" : "s lie"} on the wrong side of the starting price and ${ignored === 1 ? "is" : "are"} not evaluated.`,
    );
  const target = onSide.length
    ? onSide.reduce((best, t) =>
        Math.abs(t - entryPrice) < Math.abs(best - entryPrice) ? t : best,
      )
    : null;

  const reached = (b: ClaimBar, level: number) => (s > 0 ? b.high >= level : b.low <= level);
  const broke = (b: ClaimBar, level: number) =>
    claim.invalidationOn === "close"
      ? (b.close - level) * s <= 0
      : s > 0
        ? b.low <= level
        : b.high >= level;

  const followed = after.slice(start);
  const origin = triggeredAt ?? claim.claimTime;
  let targetHitAt: number | null = null;
  let invalidatedAt: number | null = null;
  let ambiguousAt: number | null = null;
  const targetsReached = claim.targets.map((price) => ({ price, at: null as number | null }));
  let mfe = 0;
  let mae = 0;
  let horizonClose: number | null = null;
  for (const b of followed) {
    const within = inHorizon(b);
    for (const t of targetsReached)
      if (t.at === null && (t.price - entryPrice) * s > 0 && reached(b, t.price)) t.at = b.time;
    if (within) {
      mfe = Math.max(mfe, ((s > 0 ? b.high : b.low) / entryPrice - 1) * s);
      mae = Math.min(mae, ((s > 0 ? b.low : b.high) / entryPrice - 1) * s);
      horizonClose = b.close;
    }
    if (targetHitAt !== null || invalidatedAt !== null || ambiguousAt !== null) continue;
    const hit = target !== null && reached(b, target);
    const out = claim.invalidation !== null && broke(b, claim.invalidation);
    if (hit && out) ambiguousAt = b.time;
    else if (hit) targetHitAt = b.time;
    else if (out) invalidatedAt = b.time;
  }

  let status: ClaimStatus;
  const before_ = (at: number | null) => at !== null && (horizonEnd === null || at < horizonEnd);
  if (before_(ambiguousAt)) {
    status = "ambiguous";
    notes.push("The target and the invalidation were reached inside the same candle.");
  } else if (before_(targetHitAt)) status = "target_hit";
  else if (before_(invalidatedAt)) status = "invalidated";
  else if (target === null && claim.invalidation === null && horizonEnd === null)
    return {
      ...unevaluable("The claim has no target, no invalidation and no horizon to check.", notes),
      referencePrice,
      referenceTime: reference.time,
      side,
    };
  else if (!complete) status = "pending";
  else if (targetHitAt !== null && (invalidatedAt === null || targetHitAt < invalidatedAt))
    status = "target_hit_late";
  else status = "expired";

  const horizonReturn =
    complete && horizonClose !== null ? (horizonClose / entryPrice - 1) * s : null;
  const directional =
    horizonReturn === null
      ? null
      : Math.abs(horizonReturn) < FLAT_MOVE
        ? "flat"
        : horizonReturn > 0
          ? "correct"
          : "incorrect";

  return {
    status,
    reason: null,
    referencePrice,
    referenceTime: reference.time,
    side,
    triggeredAt,
    target,
    targetHitAt: status === "ambiguous" ? null : targetHitAt,
    invalidatedAt: status === "ambiguous" ? null : invalidatedAt,
    timeToTarget: targetHitAt !== null ? targetHitAt - origin : null,
    timeToInvalidation: invalidatedAt !== null ? invalidatedAt - origin : null,
    targetsReached,
    mfe: followed.length ? mfe : null,
    mae: followed.length ? mae : null,
    directional: claim.trigger && triggeredAt === null ? null : directional,
    horizonReturn,
    complete,
    notes,
  };
}

// ── Strategies ──

/**
 * A: a forecast that can be checked. B: a setup with some trade rules but not enough to
 * trade it (no entry or no stop). C: entry, stop and a target all stated: simulated as a
 * trade under the stated execution rules.
 */
export type StrategyLevel = "A" | "B" | "C";

export interface ClaimSetup {
  direction: ClaimDirection;
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  targets: number[];
}

export function strategyLevel(setup: ClaimSetup): StrategyLevel {
  const entry = setup.entryLow !== null || setup.entryHigh !== null;
  const side = setup.direction !== "neutral";
  if (side && entry && setup.stop !== null && setup.targets.length) return "C";
  if (side && (entry || setup.stop !== null)) return "B";
  return "A";
}

export interface ExecutionCosts {
  /** Commission per side, in basis points of the fill (5 = 0.05%). */
  commissionBps: number;
  /** Price moved against you on every fill, in basis points. */
  slippageBps: number;
  /** A target fills only once price trades this far beyond it, in basis points. */
  targetBufferBps: number;
}

export const DEFAULT_COSTS: ExecutionCosts = {
  commissionBps: 5,
  slippageBps: 5,
  targetBufferBps: 2,
};

export type TradeExit = "target" | "stop" | "time" | "open";

export interface SimulatedTrade {
  side: "long" | "short";
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
  exit: TradeExit;
  stop: number;
  target: number;
  /** Return before and after costs, as fractions of the entry. */
  grossReturn: number | null;
  netReturn: number | null;
  /** Net result in R (the stop's distance from the entry). */
  r: number | null;
  bars: number;
  /** The candle could not tell which came first; the stop was assumed. */
  ambiguous: boolean;
}

export type SimulationResult =
  { trade: SimulatedTrade; notes: string[] } | { trade: null; reason: string; notes: string[] };

/**
 * The setup traded once: a limit entry in the stated zone (the zone's near edge, or the open
 * when a candle opens inside or past it) between the claim and the horizon's end; then the
 * stop, the nearest target, or the horizon's end (at that candle's close). A gap past the stop
 * exits at the open. The candle that fills the entry can stop it out (assumed first) but not
 * take its target. Costs: commission on both fills, slippage on every fill.
 */
export function simulateSetup(
  setup: ClaimSetup,
  timing: { claimTime: number; horizonEnd: number | null },
  candles: readonly ClaimBar[],
  now: number,
  costs: ExecutionCosts = DEFAULT_COSTS,
): SimulationResult {
  const notes = [
    "Entry on a limit at the near edge of the stated zone (at the open if a candle opens past it).",
    "A target fills only once price trades beyond it; a stop and a target inside one candle count as the stop.",
  ];
  if (strategyLevel(setup) !== "C")
    return {
      trade: null,
      reason: "The setup does not state an entry, a stop and a target.",
      notes,
    };
  const side = setup.direction as "long" | "short";
  const s = sign(side);
  const low = setup.entryLow ?? setup.entryHigh!;
  const high = setup.entryHigh ?? setup.entryLow!;
  // The near edge: the first price the zone offers coming from above (long) or below (short).
  const edge = s > 0 ? Math.max(low, high) : Math.min(low, high);
  const stop = setup.stop!;
  const onSide = setup.targets.filter((t) => (t - edge) * s > 0);
  if ((stop - edge) * s >= 0)
    return {
      trade: null,
      reason: `The stop is not on the ${side === "long" ? "low" : "high"} side of the entry.`,
      notes,
    };
  if (!onSide.length)
    return {
      trade: null,
      reason: "No target lies beyond the entry in the setup's direction.",
      notes,
    };
  const target = onSide.reduce((a, b) => (Math.abs(b - edge) < Math.abs(a - edge) ? b : a));
  const slip = costs.slippageBps / 10_000;
  const buffer = costs.targetBufferBps / 10_000;
  const bars = [...candles]
    .filter((b) => b.time <= now && b.time >= timing.claimTime)
    .sort((a, b) => a.time - b.time);
  const inHorizon = (b: ClaimBar) => timing.horizonEnd === null || b.time < timing.horizonEnd;
  if (timing.horizonEnd === null)
    notes.push("No horizon: the trade is followed until the data ends and stays open after that.");

  let entryIndex = -1;
  let entryPrice = 0;
  for (let i = 0; i < bars.length && inHorizon(bars[i]!); i++) {
    const b = bars[i]!;
    const touched = s > 0 ? b.low <= edge : b.high >= edge;
    if (!touched) continue;
    const gapped = (b.open - edge) * s <= 0;
    entryPrice = (gapped ? b.open : edge) * (1 + s * slip);
    entryIndex = i;
    break;
  }
  if (entryIndex < 0)
    return { trade: null, reason: "Price never reached the entry zone inside the horizon.", notes };

  const entryBar = bars[entryIndex]!;
  const result = (
    exit: TradeExit,
    exitTime: number | null,
    exitPrice: number | null,
    count: number,
    ambiguous = false,
  ): SimulationResult => {
    const gross = exitPrice === null ? null : ((exitPrice - entryPrice) / entryPrice) * s;
    const fees = (2 * costs.commissionBps) / 10_000;
    const net = gross === null ? null : gross - fees;
    const risk = Math.abs(entryPrice - stop) / entryPrice;
    return {
      trade: {
        side,
        entryTime: entryBar.time,
        entryPrice,
        exitTime,
        exitPrice,
        exit,
        stop,
        target,
        grossReturn: gross,
        netReturn: net,
        r: net === null || !(risk > 0) ? null : net / risk,
        bars: count,
        ambiguous,
      },
      notes,
    };
  };
  const stopFill = (b: ClaimBar) => ((b.open - stop) * s <= 0 ? b.open : stop) * (1 - s * slip);
  // The entry candle: its stop counts (assumed after the fill), its target does not.
  if ((s > 0 ? entryBar.low : entryBar.high) * s <= stop * s)
    return result("stop", entryBar.time, stopFill(entryBar), 1, true);

  const beyond = target * (1 + s * buffer);
  for (let i = entryIndex + 1; i < bars.length; i++) {
    const b = bars[i]!;
    const count = i - entryIndex + 1;
    if (!inHorizon(b)) {
      const last = bars[i - 1]!;
      return result("time", last.time, last.close * (1 - s * slip), count - 1);
    }
    if ((b.open - stop) * s <= 0) return result("stop", b.time, stopFill(b), count);
    if ((b.open - beyond) * s >= 0) return result("target", b.time, b.open * (1 - s * slip), count);
    const stopped = (s > 0 ? b.low : b.high) * s <= stop * s;
    const won = (s > 0 ? b.high : b.low) * s >= beyond * s;
    if (stopped) return result("stop", b.time, stopFill(b), count, won);
    if (won) return result("target", b.time, target * (1 - s * slip), count);
  }
  const last = bars.at(-1)!;
  const dataEnd = last.time + barLength(bars);
  if (timing.horizonEnd !== null && dataEnd >= timing.horizonEnd)
    return result("time", last.time, last.close * (1 - s * slip), bars.length - entryIndex);
  return result("open", null, null, bars.length - entryIndex);
}

// ── Market regime at the claim (candles before it only) ──

export interface Regime {
  trend: "up" | "down" | "unknown";
  volatility: "high" | "normal" | "unknown";
}

/** Trend: the last close against its 50-candle average. Volatility: the last 14 candles' range against the 100 before. */
export function regimeBefore(candles: readonly ClaimBar[], claimTime: number): Regime {
  const step = barLength(candles);
  const bars = [...candles]
    .filter((b) => b.time + step <= claimTime)
    .sort((a, b) => a.time - b.time);
  const trend =
    bars.length >= 50
      ? bars.at(-1)!.close >= bars.slice(-50).reduce((sum, b) => sum + b.close, 0) / 50
        ? "up"
        : "down"
      : "unknown";
  const range = (b: ClaimBar) => (b.high - b.low) / b.close;
  let volatility: Regime["volatility"] = "unknown";
  if (bars.length >= 114) {
    const recent = bars.slice(-14).reduce((sum, b) => sum + range(b), 0) / 14;
    const base = bars.slice(-114, -14).reduce((sum, b) => sum + range(b), 0) / 100;
    volatility = recent > base * 1.25 ? "high" : "normal";
  }
  return { trend, volatility };
}

// ── Statistics ──

/** Wilson score interval for k successes in n (95% by default); null for n = 0. */
export function wilsonInterval(
  k: number,
  n: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, (centre - margin) / denominator),
    high: Math.min(1, (centre + margin) / denominator),
  };
}

/** Below this many observations a rate is shown with a warning, never ranked. */
export const MIN_SAMPLE = 20;

/** Brier score of stated probabilities against what happened (0 best, 1 worst). */
export function brierScore(
  pairs: readonly { probability: number; happened: boolean }[],
): number | null {
  if (!pairs.length) return null;
  return (
    pairs.reduce((sum, p) => sum + (p.probability - (p.happened ? 1 : 0)) ** 2, 0) / pairs.length
  );
}

export interface OutcomeTally {
  claims: number;
  /** Resolved within the horizon: target hit or invalidated (ambiguous left out). */
  resolved: number;
  targetHits: number;
  targetHitRate: number | null;
  targetHitInterval: { low: number; high: number } | null;
  late: number;
  invalidated: number;
  expired: number;
  pending: number;
  notTriggered: number;
  ambiguous: number;
  unevaluable: number;
  /** Direction at the horizon's end. */
  directional: number;
  directionCorrect: number;
  directionRate: number | null;
  directionInterval: { low: number; high: number } | null;
  medianTimeToTarget: number | null;
  insufficient: boolean;
}

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * The outcomes of a group of claims. Target hit rate counts only claims settled inside their
 * horizon (hit, invalidated or expired); pending, untriggered, ambiguous and unevaluable
 * claims are counted apart, never as misses.
 */
export function tallyOutcomes(outcomes: readonly ClaimOutcome[]): OutcomeTally {
  const count = (status: ClaimStatus) => outcomes.filter((o) => o.status === status).length;
  const targetHits = count("target_hit");
  const invalidated = count("invalidated");
  const expired = count("expired");
  const late = count("target_hit_late");
  const settled = targetHits + invalidated + expired + late;
  const directionals = outcomes.filter((o) => o.directional && o.directional !== "flat");
  const correct = directionals.filter((o) => o.directional === "correct").length;
  return {
    claims: outcomes.length,
    resolved: settled,
    targetHits,
    targetHitRate: settled ? targetHits / settled : null,
    targetHitInterval: wilsonInterval(targetHits, settled),
    late,
    invalidated,
    expired,
    pending: count("pending"),
    notTriggered: count("not_triggered"),
    ambiguous: count("ambiguous"),
    unevaluable: count("unevaluable"),
    directional: directionals.length,
    directionCorrect: correct,
    directionRate: directionals.length ? correct / directionals.length : null,
    directionInterval: wilsonInterval(correct, directionals.length),
    medianTimeToTarget: median(
      outcomes
        .filter((o) => o.status === "target_hit" && o.timeToTarget !== null)
        .map((o) => o.timeToTarget!),
    ),
    insufficient: settled < MIN_SAMPLE,
  };
}

export interface TradeStats {
  trades: number;
  wins: number;
  winRate: number | null;
  winInterval: { low: number; high: number } | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Mean net return per trade, and its 95% interval (normal approximation). */
  expectancy: number | null;
  expectancyInterval: { low: number; high: number } | null;
  grossTotal: number;
  netTotal: number;
  avgR: number | null;
  profitFactor: number | null;
  /** Largest fall of the cumulative net return, one trade after another (additive). */
  maxDrawdown: number;
  avgBars: number | null;
  ambiguous: number;
  insufficient: boolean;
}

/** Closed simulated trades only; open ones are left out. */
export function tradeStats(trades: readonly SimulatedTrade[]): TradeStats {
  const closed = [...trades]
    .filter((t) => t.netReturn !== null)
    .sort((a, b) => a.entryTime - b.entryTime);
  const net = closed.map((t) => t.netReturn!);
  const wins = net.filter((r) => r > 0);
  const losses = net.filter((r) => r <= 0);
  const mean = net.length ? net.reduce((a, b) => a + b, 0) / net.length : null;
  const sd =
    net.length > 1 && mean !== null
      ? Math.sqrt(net.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (net.length - 1))
      : null;
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const r of net) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const rs = closed.filter((t) => t.r !== null).map((t) => t.r!);
  const lossSum = -losses.reduce((a, b) => a + b, 0);
  return {
    trades: closed.length,
    wins: wins.length,
    winRate: closed.length ? wins.length / closed.length : null,
    winInterval: wilsonInterval(wins.length, closed.length),
    avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null,
    avgLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null,
    expectancy: mean,
    expectancyInterval:
      mean !== null && sd !== null
        ? {
            low: mean - (1.96 * sd) / Math.sqrt(net.length),
            high: mean + (1.96 * sd) / Math.sqrt(net.length),
          }
        : null,
    grossTotal: closed.reduce((sum, t) => sum + t.grossReturn!, 0),
    netTotal: net.reduce((a, b) => a + b, 0),
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    // No losing trade: no finite profit factor (shown as such, never as infinity).
    profitFactor: lossSum > 0 ? wins.reduce((a, b) => a + b, 0) / lossSum : null,
    maxDrawdown,
    avgBars: closed.length ? closed.reduce((sum, t) => sum + t.bars, 0) / closed.length : null,
    ambiguous: closed.filter((t) => t.ambiguous).length,
    insufficient: closed.length < MIN_SAMPLE,
  };
}
