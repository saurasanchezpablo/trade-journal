/**
 * Beta features: parts of the journal that are still experimental, hidden (sidebar, pages,
 * API and background work) until switched on under Settings → Beta features.
 */
export const BETA_FEATURES = [
  {
    id: "videoIntelligence",
    href: "/video-intelligence",
    title: "Video intelligence",
    detail:
      "The claims in the YouTube videos you follow, checked against what the market did afterwards. Uses AI tokens to read each video.",
  },
  {
    id: "strategyResearch",
    href: "/research",
    title: "Strategy research",
    detail:
      "Trading strategies from published research, backtested on Binance's daily history, with signal monitoring and paper trading. No orders are ever placed.",
  },
] as const;

export type BetaFeature = (typeof BETA_FEATURES)[number]["id"];
export type BetaFlags = Record<BetaFeature, boolean>;

export const NO_BETA: BetaFlags = { videoIntelligence: false, strategyResearch: false };

export const isBetaFeature = (value: unknown): value is BetaFeature =>
  BETA_FEATURES.some((f) => f.id === value);

/** Stored flags, anything unknown or malformed off. */
export function readBetaFlags(value: unknown): BetaFlags {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(BETA_FEATURES.map((f) => [f.id, v[f.id] === true])) as BetaFlags;
}

/** Sidebar links of the beta features that are off. */
export const hiddenBetaLinks = (flags: BetaFlags): Set<string> =>
  new Set(BETA_FEATURES.filter((f) => !flags[f.id]).map((f) => f.href));
