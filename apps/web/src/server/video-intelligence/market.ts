import {
  CLAIM_EVALUATOR_VERSION,
  evaluateClaim,
  mirrorClaim,
  regimeBefore,
  simulateSetup,
  type ClaimBar,
  type ClaimToEvaluate,
} from "@luxalgo/journal-core";
import { maxSpanMs } from "@/lib/chart-analysis";
import { RESOLUTIONS, type Resolution } from "@/lib/market-data";
import { servableResolution } from "@/lib/market-symbols";
import type { VideoClaim } from "@/lib/video-claims";
import { connectionKey, connections, providerFor } from "../market-data/connections";
import { tradeMarketSource } from "../trade-market-source";
import {
  getIntelligenceSettings,
  saveEvaluation,
  storeCandles,
  storedCandles,
  type MarketProvenance,
  type StoredClaim,
  type StoredSimulation,
} from "./store";

/**
 * A claim's market: the instrument resolved to an enabled source (never guessed across asset
 * classes), the closed candles from before the claim to after its horizon fetched and stored,
 * and the claim evaluated from the stored candles, so the stored outcome can always be
 * computed again from what is kept.
 */

export interface ClaimSource {
  provider: string;
  providerName: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
}

/** Indices by the names analysts use, as Yahoo Finance lists them (the index, not a future). */
const INDICES: Record<string, string> = {
  SPX: "^GSPC",
  "S&P 500": "^GSPC",
  "S&P500": "^GSPC",
  SP500: "^GSPC",
  US500: "^GSPC",
  NDX: "^NDX",
  "NASDAQ 100": "^NDX",
  NAS100: "^NDX",
  US100: "^NDX",
  DJI: "^DJI",
  "DOW JONES": "^DJI",
  US30: "^DJI",
  RUT: "^RUT",
  "RUSSELL 2000": "^RUT",
  DAX: "^GDAXI",
  GER40: "^GDAXI",
  DE40: "^GDAXI",
  VIX: "^VIX",
  FTSE: "^FTSE",
  UK100: "^FTSE",
  NIKKEI: "^N225",
  JP225: "^N225",
};

/** Candles fine enough to place a target: the finest size with at most 400 across the span. */
export function evaluationResolution(spanMs: number): Resolution {
  const sizes = (Object.entries(RESOLUTIONS) as [Resolution, number][]).filter(
    ([id]) => id !== "1w",
  );
  return (sizes.find(([, ms]) => spanMs / ms <= 400) ?? sizes.at(-1)!)[0];
}

const CRYPTO = new Set(["binance", "bybit", "coinbase"]);
const PUBLIC = new Set(["yahoo", "kraken", "nasdaq"]);
const ASSET: Record<VideoClaim["assetClass"], string | null> = {
  crypto: "crypto",
  forex: "forex",
  equity: "equity",
  futures: "futures",
  index: null,
  commodity: null,
  unknown: null,
};

export async function resolveClaimSource(
  claim: VideoClaim,
  claimTime: number,
  horizonEnd: number,
  now: number,
  signal?: AbortSignal,
): Promise<{ source: ClaimSource } | { source: null; reason: string }> {
  const wanted = evaluationResolution(Math.min(horizonEnd, now) - claimTime);
  if (claim.assetClass === "commodity")
    return {
      source: null,
      reason:
        "A commodity's spot price has no keyless source, and its futures are a different instrument: not evaluated.",
    };
  if (claim.assetClass === "index") {
    const name = (claim.ticker ?? claim.instrument).toUpperCase().trim();
    const symbol = INDICES[name] ?? INDICES[claim.instrument.toUpperCase().trim()];
    if (!symbol)
      return {
        source: null,
        reason: `The index "${claim.instrument}" is not one the journal can look up.`,
      };
    if (!connections().some((c) => c.id === "yahoo" && c.configured))
      return {
        source: null,
        reason: "Enable Yahoo Finance in Settings → Market data to evaluate index claims.",
      };
    const resolution = servableResolution("yahoo", wanted, claimTime, now);
    if (!resolution)
      return { source: null, reason: "Yahoo Finance no longer keeps candles this far back." };
    return {
      source: {
        provider: "yahoo",
        providerName: "Yahoo Finance",
        dataset: null,
        symbol,
        resolution,
      },
    };
  }
  const symbol = claim.ticker ?? claim.instrument;
  const found = await tradeMarketSource(
    {
      key: `video-claim:${symbol}`,
      symbol,
      assetClass: ASSET[claim.assetClass] as never,
      openedAt: new Date(claimTime).toISOString(),
      closedAt: new Date(Math.min(horizonEnd, now)).toISOString(),
    },
    signal,
  );
  if (!found.source) return { source: null, reason: found.reason };
  const s = found.source;
  const resolution = CRYPTO.has(s.provider)
    ? wanted
    : PUBLIC.has(s.provider)
      ? (servableResolution(s.provider as "yahoo", wanted, claimTime, now) ?? s.resolution)
      : s.resolution;
  return {
    source: {
      provider: s.provider,
      providerName: s.providerName,
      dataset: s.dataset,
      symbol: s.symbol,
      resolution,
    },
  };
}

/** Candles before a claim, for its reference price and its market regime. */
export const BARS_BEFORE = 120;

/**
 * The window to read: from enough candles before the claim to one more horizon after it (to
 * see a late target), never past now, and within what one request can hold.
 */
export function evaluationWindow(
  claimTime: number,
  horizonEnd: number,
  now: number,
  resolution: Resolution,
): { from: number; to: number } {
  const step = RESOLUTIONS[resolution];
  const from = claimTime - BARS_BEFORE * step;
  const late = horizonEnd + (horizonEnd - claimTime);
  const to = Math.min(now, late, from + maxSpanMs(resolution));
  return { from, to };
}

/** Network, replaced in tests. */
export interface MarketDeps {
  now: () => number;
  resolve: typeof resolveClaimSource;
  history: (source: ClaimSource, from: number, to: number) => Promise<ClaimBar[]>;
}

export const defaultMarketDeps: MarketDeps = {
  now: () => Date.now(),
  resolve: resolveClaimSource,
  history: async (source, from, to) => {
    const provider = providerFor(source.provider);
    const history = await provider.history(
      {
        symbol: source.symbol,
        dataset: source.dataset ?? undefined,
        resolution: source.resolution,
        from,
        to,
      },
      connectionKey(source.provider),
    );
    return history.bars;
  },
};

export const toEvaluate = (stored: StoredClaim): ClaimToEvaluate => {
  const c = stored.claim;
  return {
    direction: c.direction,
    claimTime: Date.parse(stored.claimTime),
    horizonEnd: Date.parse(stored.horizonEnd),
    horizonSource: stored.horizonSource,
    targets: c.targets,
    invalidation: c.invalidation,
    invalidationOn: c.invalidationOn,
    trigger:
      c.kind === "conditional" && c.triggerPrice !== null && c.triggerKind
        ? { price: c.triggerPrice, kind: c.triggerKind }
        : null,
  };
};

/**
 * Evaluate one claim and store the result. A claim that can't be resolved or read is stored
 * as unevaluable with its reason (and tried again later: data may become available).
 */
export async function evaluateStoredClaim(
  stored: StoredClaim,
  deps: MarketDeps = defaultMarketDeps,
) {
  const now = deps.now();
  const claimTime = Date.parse(stored.claimTime);
  const horizonEnd = Date.parse(stored.horizonEnd);
  const save = (
    outcome: ReturnType<typeof evaluateClaim>,
    extra: Partial<Parameters<typeof saveEvaluation>[0]> = {},
  ) =>
    saveEvaluation({
      claimId: stored.id,
      evaluatorVersion: CLAIM_EVALUATOR_VERSION,
      outcome,
      simulation: null,
      regime: null,
      market: null,
      baseline: null,
      ...extra,
    });
  const unevaluable = (reason: string) =>
    save({ ...evaluateClaim(toEvaluate(stored), [], now), status: "unevaluable", reason });

  if (claimTime > now) return unevaluable("The claim's time is in the future.");
  const resolved = await deps.resolve(stored.claim, claimTime, horizonEnd, now);
  if (!resolved.source) return unevaluable(resolved.reason);
  const source = resolved.source;
  const { from, to } = evaluationWindow(claimTime, horizonEnd, now, source.resolution);
  let fetched: ClaimBar[];
  try {
    fetched = await deps.history(source, from, to);
  } catch (error) {
    return unevaluable(
      `The candles could not be loaded: ${error instanceof Error ? error.message : "the source failed"}.`,
    );
  }
  // Only closed candles are kept (the source drops the forming one; anything still forming by
  // now is left out here too).
  const step = RESOLUTIONS[source.resolution];
  const closed = fetched.filter((b) => b.time + step <= now && b.time >= from && b.time <= to);
  const series = storeCandles(source, closed);
  const bars = storedCandles(series, from, to);
  const computed = computeEvaluation(stored, bars, now, getIntelligenceSettings());
  const market: MarketProvenance = {
    series,
    provider: source.provider,
    providerName: source.providerName,
    dataset: source.dataset,
    symbol: source.symbol,
    resolution: source.resolution,
    from,
    to,
    bars: bars.length,
    retrievedAt: new Date(now).toISOString(),
  };
  save(computed.outcome, {
    simulation: computed.simulation,
    regime: computed.regime,
    baseline: computed.baseline,
    market,
  });
}

/**
 * Everything an evaluation stores, from the claim, the candles and the moment it was made:
 * pure, so the audit can compute it again from the stored candles and compare.
 */
export function computeEvaluation(
  stored: StoredClaim,
  bars: readonly ClaimBar[],
  now: number,
  costs: { commissionBps: number; slippageBps: number; targetBufferBps: number },
) {
  const claimTime = Date.parse(stored.claimTime);
  const horizonEnd = Date.parse(stored.horizonEnd);
  const claim = toEvaluate(stored);
  const outcome = evaluateClaim(claim, bars, now);
  const baseline =
    outcome.referencePrice !== null && outcome.status !== "unevaluable"
      ? evaluateClaim(mirrorClaim(claim, outcome.referencePrice), bars, now)
      : null;
  const c = stored.claim;
  const simulate = (multiplier: number) =>
    simulateSetup(
      {
        direction: c.direction,
        entryLow: c.entryLow,
        entryHigh: c.entryHigh,
        stop: c.stop,
        targets: c.targets,
      },
      { claimTime, horizonEnd },
      bars,
      now,
      {
        commissionBps: costs.commissionBps * multiplier,
        slippageBps: costs.slippageBps * multiplier,
        targetBufferBps: costs.targetBufferBps,
      },
    );
  const base = stored.level === "C" ? simulate(1) : null;
  const simulation: StoredSimulation | null = base
    ? {
        ...base,
        costs: {
          commissionBps: costs.commissionBps,
          slippageBps: costs.slippageBps,
          targetBufferBps: costs.targetBufferBps,
        },
        sensitivity: {
          free: simulate(0).trade?.netReturn ?? null,
          double: simulate(2).trade?.netReturn ?? null,
        },
      }
    : null;
  // An analyst's quoted price far from the market's is a sign of the wrong instrument.
  if (c.referencePrice !== null && outcome.referencePrice !== null) {
    const gap = Math.abs(c.referencePrice / outcome.referencePrice - 1);
    if (gap > 0.1)
      outcome.notes.push(
        `The price quoted in the video (${c.referencePrice}) is ${Math.round(gap * 100)}% from the market's (${outcome.referencePrice}): check that this is the right instrument.`,
      );
  }
  return { outcome, baseline, simulation, regime: regimeBefore(bars, claimTime) };
}
