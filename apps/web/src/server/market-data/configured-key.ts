import { RequestError } from "../api";
import { connectionKey } from "./connections";
import { MarketDataError } from "./provider";

/**
 * A source's key for a request handler. A source that is not set up yet (a public source
 * not enabled, a missing or unreadable key) is the request's problem to fix in Settings, so
 * it answers 400 with the same message rather than 502, which means the provider failed.
 */
export function configuredKey(providerId: string): string {
  try {
    return connectionKey(providerId);
  } catch (error) {
    if (error instanceof MarketDataError) throw new RequestError(error.message);
    throw error;
  }
}
