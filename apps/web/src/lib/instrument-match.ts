import { matchKeys, symbolKey } from "./symbol-match";

/**
 * A journal symbol matched to an exchange's instrument, for the candles of a trade. Brokers
 * and manual entries write the same coin many ways (BTC, BTCUSD, BTC/USDT, XBTUSD,
 * BTCUSDT.P, BINANCE:BTCUSDT); exchanges list one spelling. Dollar stablecoins count as
 * USD, as elsewhere in the journal, and a bare coin means its dollar pair.
 */

/** Perpetual and venue suffixes that don't change which coin it is. */
const SUFFIX = /(?:\.P|[-_ .]?PERP(?:ETUAL)?|[-_ .]?SWAP|\.X)$/i;
const ALIASES: Record<string, string> = { XBT: "BTC" };
const DOLLARS = ["USDT", "USDC", "USD", "BUSD", "FDUSD"];
/** Quotes that name a particular dollar coin, unlike a plain USD. */
const STABLES = ["USDT", "USDC", "BUSD", "FDUSD"];

/** The key a journal symbol compares by: no prefix, suffix or punctuation, aliases resolved. */
export function journalKey(symbol: string): string {
  let key = symbolKey(symbol.trim().replace(SUFFIX, ""));
  for (const [alias, name] of Object.entries(ALIASES))
    if (key.startsWith(alias)) key = name + key.slice(alias.length);
  return key;
}

/** The coin a journal symbol trades, when it names one ("BTC" for BTCUSDT or BTC-USD). */
export function baseOf(symbol: string): string {
  const key = journalKey(symbol);
  const quote = DOLLARS.find((q) => key.length > q.length + 1 && key.endsWith(q));
  return quote ? key.slice(0, -quote.length) : key;
}

/** Whether an exchange instrument is the journal symbol's instrument. */
export function instrumentMatches(journalSymbol: string, instrument: string): boolean {
  const key = journalKey(journalSymbol);
  const keys = matchKeys(instrument);
  if (keys.has(key)) return true;
  // A bare coin ("BTC") is its dollar pair.
  return !DOLLARS.some((q) => key.endsWith(q)) && DOLLARS.some((q) => keys.has(key + q));
}

/**
 * The best listed instrument for a journal symbol: the exchange's own ranking decides (most
 * traded first), since a plain "USD" often names a thin pair (Binance lists a BTCUSD that
 * barely trades) while the journal means bitcoin in dollars. Only an explicit stablecoin
 * ("BTC/USDC") that the exchange lists is taken as written.
 */
export function pickInstrument(journalSymbol: string, listed: readonly string[]): string | null {
  const matches = listed.filter((s) => instrumentMatches(journalSymbol, s));
  if (!matches.length) return null;
  const key = journalKey(journalSymbol);
  if (STABLES.some((q) => key.endsWith(q))) {
    const exact = matches.find((s) => symbolKey(s) === key);
    if (exact) return exact;
  }
  return matches[0]!;
}
