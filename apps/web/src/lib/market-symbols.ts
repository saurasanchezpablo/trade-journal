import { RESOLUTIONS, type Resolution } from "./market-data";

/**
 * The keyless sources' symbols for a journal trade's instrument, for candles chosen without
 * asking: currency pairs (Yahoo Finance's EURUSD=X, Kraken's EURUSD), stocks and ETFs (Yahoo
 * as written, Nasdaq for daily candles) and futures (Yahoo's continuous front month, ES=F
 * for ESZ5). Nothing is guessed across asset classes: a symbol that does not read as the
 * trade's class gets no candidates, and the page asks as before.
 */

/** ISO currencies common in forex statements. */
const CURRENCIES = new Set(
  "USD EUR GBP JPY CHF CAD AUD NZD SEK NOK DKK PLN HUF CZK TRY ZAR MXN SGD HKD CNH CNY ILS INR KRW BRL".split(
    " ",
  ),
);

export interface PublicCandidate {
  provider: "yahoo" | "kraken" | "nasdaq";
  symbol: string;
  dataset: string | null;
}

/** A venue prefix a symbol may carry (FX:EURUSD, NASDAQ:AAPL, OANDA:EUR_USD). */
const withoutVenue = (symbol: string) => symbol.trim().replace(/^[A-Za-z0-9_]+:/, "");

/**
 * The two currencies of a forex symbol however a broker writes it: EURUSD, EUR/USD, EUR_USD,
 * EUR.USD and broker suffixes such as EURUSD.x, EURUSDm or EURUSD.pro.
 */
export function forexPair(symbol: string): { base: string; quote: string } | null {
  const match = /^([A-Za-z]{3})[/_.\- ]?([A-Za-z]{3})(?:[._-]?[a-z]{1,4}|\.[A-Za-z]{1,4})?$/.exec(
    withoutVenue(symbol),
  );
  if (!match) return null;
  const base = match[1]!.toUpperCase();
  const quote = match[2]!.toUpperCase();
  return base !== quote && CURRENCIES.has(base) && CURRENCIES.has(quote) ? { base, quote } : null;
}

/**
 * A futures symbol's root: ES for ESZ5, ESZ25, "ES 12-25" (NinjaTrader), /ES or a bare ES;
 * MES for MESZ5; 6E for 6EZ5. The contract month and year are dropped.
 */
export function futuresRoot(symbol: string): string | null {
  const plain = withoutVenue(symbol).toUpperCase().replace(/^\//, "");
  const dated =
    /^([A-Z0-9]{1,4}?)[FGHJKMNQUVXZ](\d{1,4})$/.exec(plain) ??
    /^([A-Z0-9]{1,4})\s+\d{2}-\d{2}$/.exec(plain) ??
    /^([A-Z0-9]{1,4})$/.exec(plain);
  return dated && /[A-Z]/.test(dated[1]!) ? dated[1]! : null;
}

/** A stock or ETF ticker as Yahoo writes it: BRK.B is BRK-B there; other suffixes stay. */
function equityTicker(symbol: string): string | null {
  const plain = withoutVenue(symbol).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(plain)) return null;
  return plain;
}

/**
 * Where to look, best first, for a trade of this symbol and asset class. `daily` says the
 * trade needs daily candles anyway, the only kind Nasdaq serves.
 */
export function publicCandidates(
  symbol: string,
  assetClass: string | null | undefined,
  daily: boolean,
): PublicCandidate[] {
  const pair = forexPair(symbol);
  if (pair && (assetClass === "forex" || assetClass === "cfd" || !assetClass))
    return [
      { provider: "yahoo", symbol: `${pair.base}${pair.quote}=X`, dataset: null },
      { provider: "kraken", symbol: `${pair.base}${pair.quote}`, dataset: null },
    ];
  if (assetClass === "equity") {
    const ticker = equityTicker(symbol);
    if (!ticker) return [];
    const yahooTicker = /^[A-Z]+\.[A-Z]$/.test(ticker) ? ticker.replace(".", "-") : ticker;
    return [
      { provider: "yahoo", symbol: yahooTicker, dataset: null },
      // A US ticker only (no exchange suffix other than a share class).
      ...(daily && /^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker)
        ? [
            { provider: "nasdaq" as const, symbol: ticker, dataset: "stocks" },
            { provider: "nasdaq" as const, symbol: ticker, dataset: "etf" },
          ]
        : []),
    ];
  }
  if (assetClass === "futures") {
    const root = futuresRoot(symbol);
    return root ? [{ provider: "yahoo", symbol: `${root}=F`, dataset: null }] : [];
  }
  return [];
}

const DAY = RESOLUTIONS["1d"];
/** How far back each keyless source keeps a candle size (Kraken: its latest 720). */
const KEPT: Record<PublicCandidate["provider"], (resolution: Resolution) => number> = {
  yahoo: (r) =>
    r === "1m" || r === "3m"
      ? 30 * DAY
      : r === "5m" || r === "15m" || r === "30m"
        ? 60 * DAY
        : r === "1h" || r === "2h" || r === "4h"
          ? 730 * DAY
          : Infinity,
  kraken: (r) => 720 * RESOLUTIONS[r === "3m" ? "1m" : r === "2h" ? "1h" : r === "1w" ? "1d" : r],
  nasdaq: (r) => (r === "1d" || r === "1w" ? 10 * 365 * DAY : 0),
};

/**
 * The finest candle size, from `wanted` up, that a source still keeps for a trade opened at
 * `opened` (with a day to spare), or null when none does.
 */
export function servableResolution(
  provider: PublicCandidate["provider"],
  wanted: Resolution,
  opened: number,
  now = Date.now(),
): Resolution | null {
  const sizes = Object.keys(RESOLUTIONS) as Resolution[];
  for (const size of sizes.slice(sizes.indexOf(wanted)))
    if (size !== "1w" && now - opened + DAY <= KEPT[provider](size)) return size;
  return null;
}
