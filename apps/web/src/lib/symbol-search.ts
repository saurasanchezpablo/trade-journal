/**
 * Rank a source's instruments for a search: an exact symbol first, then symbols and base
 * assets starting with the query, then those containing it. Within a group the most traded
 * come first (`weight`, e.g. a day's turnover), then shorter symbols (BTCUSDT before
 * BTCUSDT-26DEC25). Case and separators are ignored.
 */
export interface Listed {
  symbol: string;
  description: string;
  /** Also matched, e.g. the base asset (`BTC`). */
  aliases?: string[];
  /** How much it trades; higher first among equally good matches. */
  weight?: number;
}

/** A weight from the quote currency, for sources that give no volume in their listing. */
const QUOTES = ["USDT", "USDC", "USD", "EUR", "FDUSD", "BTC", "ETH", "GBP"];
export const quoteWeight = (quote: string) => {
  const index = QUOTES.indexOf(quote.toUpperCase());
  return index < 0 ? 0 : QUOTES.length - index;
};

export const MAX_SYMBOL_MATCHES = 20;

const plain = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function rankSymbols<T extends Listed>(
  listed: readonly T[],
  query: string,
  limit = MAX_SYMBOL_MATCHES,
): T[] {
  const q = plain(query);
  if (!q) return [];
  const scored: { item: T; score: number }[] = [];
  for (const item of listed) {
    const symbol = plain(item.symbol);
    const names = [symbol, ...(item.aliases ?? []).map(plain)];
    let score = -1;
    if (symbol === q) score = 0;
    else if (names.some((name) => name === q)) score = 1;
    else if (names.some((name) => name.startsWith(q))) score = 2;
    else if (names.some((name) => name.includes(q))) score = 3;
    if (score >= 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (b.item.weight ?? 0) - (a.item.weight ?? 0) ||
      a.item.symbol.length - b.item.symbol.length ||
      a.item.symbol.localeCompare(b.item.symbol),
  );
  return scored.slice(0, limit).map((entry) => entry.item);
}
