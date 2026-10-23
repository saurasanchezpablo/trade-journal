/**
 * Indicators the server evaluates for background alerts, computed as TradingView computes
 * them so an alert agrees with the chart.
 */

/**
 * Wilder's moving average (TradingView's `ta.rma`): the simple average of the first `length`
 * values, then `previous + (value − previous) / length`. Null until `length` values are seen.
 */
export function rma(values: readonly number[], length: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  let average: number | null = null;
  for (const [i, v] of values.entries()) {
    if (average === null) {
      sum += v;
      if (i === length - 1) average = sum / length;
    } else average += (v - average) / length;
    out.push(average);
  }
  return out;
}

/**
 * Relative Strength Index (TradingView's `ta.rsi`): the Wilder averages of the closes' rises
 * and falls, `100 − 100 / (1 + up / down)`; 100 when nothing fell, 0 when nothing rose. One
 * value per close; null until `length` changes are known (the first close has none).
 * Like TradingView's, the value converges as history grows: use several times `length`
 * closes for values that match the chart to a few hundredths.
 */
export function rsi(closes: readonly number[], length = 14): (number | null)[] {
  if (!Number.isInteger(length) || length < 1)
    throw new Error("RSI length must be a positive integer.");
  if (closes.length < 2) return closes.map(() => null);
  const changes = closes.slice(1).map((c, i) => c - closes[i]!);
  const up = rma(
    changes.map((d) => Math.max(d, 0)),
    length,
  );
  const down = rma(
    changes.map((d) => Math.max(-d, 0)),
    length,
  );
  return [
    null,
    ...up.map((u, i) => {
      const d = down[i]!;
      if (u === null || d === null) return null;
      if (d === 0) return 100;
      if (u === 0) return 0;
      return 100 - 100 / (1 + u / d);
    }),
  ];
}

export type CrossDirection = "above" | "below";

/**
 * Whether a value crossed a level from one reading to the next, as TradingView's `ta.crossover`
 * / `ta.crossunder`: above when it was at or below and is now strictly above; below the
 * reverse. Null when it did not cross (or a reading is missing).
 */
export function crossing(
  previous: number | null | undefined,
  current: number | null | undefined,
  level: number,
): CrossDirection | null {
  if (previous === null || previous === undefined || current === null || current === undefined)
    return null;
  if (previous <= level && current > level) return "above";
  if (previous >= level && current < level) return "below";
  return null;
}
