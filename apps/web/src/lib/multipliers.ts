/** Contract multipliers as the Settings page edits them: one `SYMBOL=multiplier` per line. */

export const formatMultipliers = (multipliers: Record<string, number>): string =>
  Object.entries(multipliers)
    .map(([symbol, multiplier]) => `${symbol}=${multiplier}`)
    .join("\n");

/**
 * Read the lines back. Blank lines are skipped; a line that is not exactly `SYMBOL=number`
 * with a positive number (for example "ES: 50" or "ES=50,0") is reported, never dropped.
 */
export function parseMultipliers(text: string): {
  multipliers: Record<string, number>;
  invalid: string[];
} {
  const multipliers: Record<string, number> = {};
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("=").map((part) => part.trim());
    const [symbol, value] = parts;
    const number =
      value && /^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value) ? Number(value) : NaN;
    if (parts.length !== 2 || !symbol || !Number.isFinite(number) || number <= 0) {
      invalid.push(line);
      continue;
    }
    multipliers[symbol.toUpperCase()] = number;
  }
  return { multipliers, invalid };
}

/** Whether two multiplier maps hold the same symbols and values. */
export function sameMultipliers(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && b[key] === a[key])
  );
}
