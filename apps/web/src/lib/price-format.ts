/**
 * A price in a drawing's label with enough decimals for the instrument: at least 2 and
 * enough for six significant digits, at most 8 (83665.16 for bitcoin, 1.08250 for EUR/USD,
 * 150.123 for USD/JPY). Vela labels every price with 2 decimals, which reads "1.08" for
 * every level of a EUR/USD retracement. Drawings don't know the symbol's tick size, so the
 * decimals come from the price's own size.
 */
export function levelPrice(price: number): string {
  if (!Number.isFinite(price)) return "0";
  const abs = Math.abs(price);
  if (abs === 0) return "0.00";
  const integerDigits = Math.floor(Math.log10(abs)) + 1;
  const decimals = Math.min(8, Math.max(2, 6 - integerDigits));
  return price.toFixed(decimals);
}
