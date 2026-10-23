import type { InstrumentKind, StrategyFn, StrategyView } from "./backtest";
import {
  buyAndHold,
  fundingCarry,
  meanReversion,
  movingAverageTrend,
  relativeStrength,
  timeSeriesMomentum,
  trendWithVolTarget,
} from "./strategies";

/**
 * The strategies the research module tests, declared before any result was seen: each with
 * the hypothesis it tests, where the idea comes from (docs/trading/STRATEGY_CATALOG.md), the
 * instruments it trades and a small grid of configurations. Every configuration in a grid is
 * a trial: the selection statistics (Deflated Sharpe, PBO) count all of them.
 */
export const CATALOG_VERSION = "catalog-1";

/** The instruments the catalog trades (Binance spot and USD-M perpetual daily data). */
export const RESEARCH_INSTRUMENTS = {
  "BTC-SPOT": { symbol: "BTCUSDT", kind: "spot" },
  "ETH-SPOT": { symbol: "ETHUSDT", kind: "spot" },
  "BTC-PERP": { symbol: "BTCUSDT", kind: "perp" },
} as const satisfies Record<string, { symbol: string; kind: InstrumentKind }>;
export type ResearchInstrumentId = keyof typeof RESEARCH_INSTRUMENTS;

export type StrategyRole = "benchmark" | "candidate";
export type StrategyFamily =
  "passive" | "trend" | "mean-reversion" | "regime" | "cross-asset" | "carry";

export interface GridPoint {
  id: string;
  label: string;
  params: Record<string, number | boolean>;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  role: StrategyRole;
  family: StrategyFamily;
  /** What would have to be true for it to work, in one sentence. */
  hypothesis: string;
  /** Why it can fail, in one sentence. */
  risk: string;
  instruments: ResearchInstrumentId[];
  grid: GridPoint[];
  build: (params: GridPoint["params"]) => StrategyFn;
  /** Days of history the largest configuration needs before its first decision. */
  warmup: number;
  maxGross: number;
  /**
   * What it must beat: BTC held after the same costs, or cash (for a market-neutral book,
   * whose Sharpe ratio is already measured against the cash rate).
   */
  benchmark: "btc" | "cash";
  /** Perpetual margin as a share of the short leg's notional (1 / leverage), if any. */
  marginFraction?: number;
}

const n = (params: GridPoint["params"], key: string) => Number(params[key]);
const grid = (
  prefix: string,
  axes: Record<string, (number | boolean)[]>,
  label: (p: Record<string, number | boolean>) => string,
): GridPoint[] => {
  let points: Record<string, number | boolean>[] = [{}];
  for (const [key, values] of Object.entries(axes))
    points = points.flatMap((p) => values.map((v) => ({ ...p, [key]: v })));
  return points.map((params) => ({
    id: `${prefix}-${Object.values(params).map(String).join("-")}`,
    label: label(params),
    params,
  }));
};
const pct = (x: number | boolean) => `${Math.round(Number(x) * 100)}%`;

export const STRATEGIES: StrategyDefinition[] = [
  {
    id: "btc-buy-hold",
    name: "BTC buy and hold",
    role: "benchmark",
    family: "passive",
    hypothesis:
      "The passive benchmark every candidate must be compared with, after the same costs.",
    risk: "Full exposure to bitcoin's drawdowns (over 75% in 2018 and 2022).",
    instruments: ["BTC-SPOT"],
    grid: [{ id: "hold", label: "Always 100% BTC", params: {} }],
    build: () => buyAndHold("BTC-SPOT"),
    // Same first day as the spot candidates, so they are compared over the same period.
    warmup: 366,
    maxGross: 1,
    benchmark: "btc",
  },
  {
    id: "btc-tsmom",
    name: "BTC time-series momentum",
    role: "candidate",
    family: "trend",
    hypothesis:
      "Bitcoin's past return over weeks to months predicts the sign of its next returns (time-series momentum), so being out after negative periods avoids part of the large drawdowns.",
    risk: "Whipsaws in sideways markets and late exits after sharp reversals; the effect has weakened in some studies.",
    instruments: ["BTC-SPOT"],
    grid: grid(
      "tsmom",
      { lookback: [20, 60, 120, 180, 365] },
      (p) => `${p.lookback}-day return > 0`,
    ),
    build: (p) => timeSeriesMomentum({ asset: "BTC-SPOT", lookback: n(p, "lookback") }),
    warmup: 366,
    maxGross: 1,
    benchmark: "btc",
  },
  {
    id: "btc-sma-trend",
    name: "BTC moving-average trend",
    role: "candidate",
    family: "trend",
    hypothesis:
      "Holding bitcoin only while it closes above a moving average keeps most of its uptrends and avoids part of its bear markets.",
    risk: "Same as momentum: whipsaws and lag; very sensitive to the window when samples are short.",
    instruments: ["BTC-SPOT"],
    grid: grid(
      "sma",
      { window: [20, 50, 100, 150, 200] },
      (p) => `Close above ${p.window}-day average`,
    ),
    build: (p) => movingAverageTrend({ asset: "BTC-SPOT", window: n(p, "window") }),
    warmup: 366,
    maxGross: 1,
    benchmark: "btc",
  },
  {
    id: "btc-trend-vol",
    name: "BTC trend with volatility targeting",
    role: "candidate",
    family: "regime",
    hypothesis:
      "Combining a trend filter (the regime) with position sizing by realized volatility lowers drawdowns and improves risk-adjusted returns, since volatility clusters and is partly predictable.",
    risk: "Volatility targeting cuts exposure after shocks, missing sharp rebounds; adds turnover.",
    instruments: ["BTC-SPOT"],
    grid: grid(
      "tv",
      { window: [50, 100, 200], target: [0.3, 0.5] },
      (p) => `Above ${p.window}-day average, ${pct(p.target!)} volatility target`,
    ),
    build: (p) =>
      trendWithVolTarget({
        asset: "BTC-SPOT",
        window: n(p, "window"),
        target: n(p, "target"),
        lookback: 30,
      }),
    warmup: 366,
    maxGross: 1,
    benchmark: "btc",
  },
  {
    id: "btc-mean-reversion",
    name: "BTC short-term mean reversion",
    role: "candidate",
    family: "mean-reversion",
    hypothesis:
      "Sharp short-term sell-offs in bitcoin partly reverse within days (overreaction and liquidity provision), at least while the long-term trend is up.",
    risk: "Buying falling markets: losses are large when a sell-off becomes a crash; short-horizon effects are easily eaten by costs.",
    instruments: ["BTC-SPOT"],
    grid: grid(
      "mr",
      { window: [5, 10, 20], entryZ: [1, 1.5, 2] },
      (p) => `Buy ${p.entryZ} sd below the ${p.window}-day mean (above the 200-day average)`,
    ),
    build: (p) =>
      meanReversion({
        asset: "BTC-SPOT",
        window: n(p, "window"),
        entryZ: n(p, "entryZ"),
        exitZ: 0,
        trendFilter: true,
      }),
    warmup: 366,
    maxGross: 1,
    benchmark: "btc",
  },
  {
    id: "btc-eth-rotation",
    name: "BTC/ETH relative strength",
    role: "candidate",
    family: "cross-asset",
    hypothesis:
      "Between bitcoin and ether, the one with the stronger recent return keeps outperforming for a while (cross-sectional momentum), and cash when both fall.",
    risk: "Only two assets: little diversification of the signal; relative moves between them reverse often.",
    instruments: ["BTC-SPOT", "ETH-SPOT"],
    grid: grid(
      "rs",
      { lookback: [30, 60, 90] },
      (p) => `Stronger ${p.lookback}-day return, if positive`,
    ),
    build: (p) =>
      relativeStrength({ assets: ["BTC-SPOT", "ETH-SPOT"], lookback: n(p, "lookback") }),
    warmup: 366,
    maxGross: 1,
    benchmark: "btc",
  },
  {
    id: "btc-funding-carry",
    name: "BTC funding carry (cash and carry)",
    role: "candidate",
    family: "carry",
    hypothesis:
      "Perpetual futures funding is positive most of the time because leveraged demand is mostly long; a delta-neutral long spot, short perpetual book collects it.",
    risk: "Funding can turn negative; exchange and liquidation risk on the short leg in a rally (2x leverage here); returns compress as more capital does the trade.",
    instruments: ["BTC-SPOT", "BTC-PERP"],
    grid: grid(
      "carry",
      { periods: [9, 21, 42], entry: [0.05, 0.1, 0.15] },
      (p) => `Trailing ${p.periods} fundings above ${pct(p.entry!)} a year`,
    ),
    build: (p) =>
      fundingCarry({
        spot: "BTC-SPOT",
        perp: "BTC-PERP",
        periods: n(p, "periods"),
        entry: n(p, "entry"),
        exit: n(p, "entry") / 2,
        leverage: 2,
      }),
    warmup: 15,
    maxGross: 2,
    benchmark: "cash",
    marginFraction: 0.5,
  },
];

export const strategyById = (id: string) => STRATEGIES.find((s) => s.id === id);

/**
 * Replays recorded signals as a strategy: on each day, the weights of the most recent
 * decision among the signals that could be executed by the next open (`executeAt` at or
 * before it). A decision recorded late never overrides a newer one that was recorded in time.
 * Used for the paper ledger, so its trades are exactly the signals recorded at the time,
 * never recomputed with hindsight.
 */
export function replaySignals(
  signals: readonly { executeAt: number; decisionTime?: number; weights: Record<string, number> }[],
): StrategyFn {
  const sorted = [...signals].sort((a, b) => a.executeAt - b.executeAt);
  return (view: StrategyView) => {
    const nextOpen = view.time + 86_400_000;
    let latest: (typeof sorted)[number] | null = null;
    for (const s of sorted) {
      if (s.executeAt > nextOpen) break;
      if (!latest || (s.decisionTime ?? s.executeAt) >= (latest.decisionTime ?? latest.executeAt))
        latest = s;
    }
    return { weights: latest?.weights ?? {} };
  };
}
