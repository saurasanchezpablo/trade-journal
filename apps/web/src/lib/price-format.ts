/**
 * A price in a drawing's label with enough decimals for the instrument: at least 2 and
 * enough for six significant digits, at most 8 (83665.16 for bitcoin, 1.08250 for EUR/USD,
 * 150.123 for USD/JPY). Vela labels every price with 2 decimals, which reads "1.08" for
 * every level of a EUR/USD retracement. Drawings don't know the symbol's tick size, so the
 * decimals come from the price's own size.
 */
export function levelPrice(price: number, reference = price): string {
  if (!Number.isFinite(price)) return "0";
  const abs = Math.abs(Number.isFinite(reference) && reference !== 0 ? reference : price);
  if (abs === 0) return "0.00";
  const integerDigits = Math.floor(Math.log10(abs)) + 1;
  const decimals = Math.min(8, Math.max(2, 6 - integerDigits));
  return price.toFixed(decimals);
}

/** A price change with its sign, in the decimals of the price it moved from (`+0.00350`). */
export const signedPrice = (delta: number, reference: number) =>
  `${delta >= 0 ? "+" : ""}${levelPrice(delta, reference)}`;

/**
 * A time span as the measuring tools show it (`2d 3h`, `5h 20m`, `45m`, `30s`), rounded to
 * its smaller unit before splitting, so it never reads `1d 24h` or `1h 60m`.
 */
export function formatSpan(ms: number): string {
  const m = Math.abs(ms);
  const MIN = 60_000;
  const HOUR = 3_600_000;
  if (m < MIN) {
    const s = Math.round(m / 1000);
    return s >= 60 ? "1m" : `${s}s`;
  }
  if (m < HOUR) {
    const minutes = Math.round(m / MIN);
    return minutes >= 60 ? "1h" : `${minutes}m`;
  }
  if (m < 24 * HOUR) {
    const minutes = Math.round(m / MIN);
    const h = Math.floor(minutes / 60);
    const mn = minutes % 60;
    if (h >= 24) return "1d";
    return mn ? `${h}h ${mn}m` : `${h}h`;
  }
  const hours = Math.round(m / HOUR);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}
