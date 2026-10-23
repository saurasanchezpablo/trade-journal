import {
  BETA_FEATURES,
  readBetaFlags,
  type BetaFeature,
  type BetaFlags,
} from "@/lib/beta-features";
import { bad } from "./api";
import { getSetting, setSetting } from "./settings";

const KEY = "betaFeatures";

export function getBetaFlags(): BetaFlags {
  try {
    return readBetaFlags(JSON.parse(getSetting(KEY) ?? "{}"));
  } catch {
    return readBetaFlags({});
  }
}

export const saveBetaFlags = (flags: BetaFlags) => setSetting(KEY, JSON.stringify(flags));

export const betaEnabled = (feature: BetaFeature) => getBetaFlags()[feature];

/**
 * For an API route of a beta feature: a 404 response while the feature is off (as if it did
 * not exist), or null to go on.
 */
export function betaGate(feature: BetaFeature): Response | null {
  if (betaEnabled(feature)) return null;
  const title = BETA_FEATURES.find((f) => f.id === feature)!.title;
  return bad(`${title} is a beta feature that is off. Turn it on in Settings, Beta features.`, 404);
}
