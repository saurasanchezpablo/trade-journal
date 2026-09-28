/**
 * Volume profiles as TradingView computes them (Volume profile indicators: basic concepts,
 * and the Fixed Range Volume Profile help page):
 *
 * - Rows split the profile's price range (lowest low to highest high) into equal steps.
 * - A candle's volume is up volume when it closes at or above its open, down volume otherwise,
 *   and is spread over the rows its high-low range covers, in proportion to the overlap (a
 *   candle with no range puts it all in its row).
 * - The profile is built from lower-timeframe candles: the first of 1, 5, 15, 30, 60, 240
 *   minutes and 1 day that fits the range in fewer than 5000 candles.
 * - The value area starts at the point of control (the row with the most volume) and grows
 *   one row at a time: of the next row above and the next row below, the one with more
 *   volume (on a tie, the one closer to the point of control, then the one above) is added
 *   unless it would take the value area past its target share of the volume. The first row
 *   that would not fit ends it.
 */

export interface ProfileBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ProfileRow {
  /** The row's low price; it spans `[price, price + rowH)`. */
  price: number;
  up: number;
  down: number;
}

export interface VolumeProfile {
  rows: ProfileRow[];
  rowH: number;
  min: number;
  /** Total volume of the point-of-control row. */
  maxTotal: number;
  /** Row indices, low to high. */
  poc: number;
  vaFrom: number;
  vaTo: number;
}

const total = (row: ProfileRow) => row.up + row.down;
const clamp = (k: number, n: number) => (k < 0 ? 0 : k >= n ? n - 1 : k);
const hasVolume = (bar: ProfileBar) =>
  typeof bar.volume === "number" && Number.isFinite(bar.volume) && bar.volume > 0;

/** Empty rows over the range of the candles that traded. Null when none did. */
export function profileRows(bars: readonly ProfileBar[], rowCount: number) {
  let min = Infinity;
  let max = -Infinity;
  for (const bar of bars) {
    if (!hasVolume(bar)) continue;
    if (bar.low < min) min = bar.low;
    if (bar.high > max) max = bar.high;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const n = max > min ? Math.max(1, Math.round(rowCount)) : 1;
  const rowH = max > min ? (max - min) / n : 1;
  const rows: ProfileRow[] = Array.from({ length: n }, (_, k) => ({
    price: min + k * rowH,
    up: 0,
    down: 0,
  }));
  return { rows, min, rowH };
}

/** Add one candle's volume to the rows its range covers, in proportion to the overlap. */
export function addBar(rows: ProfileRow[], min: number, rowH: number, bar: ProfileBar) {
  if (!hasVolume(bar)) return;
  const volume = bar.volume!;
  const side = bar.close >= bar.open ? "up" : "down";
  const n = rows.length;
  const span = bar.high - bar.low;
  if (!(span > 0)) {
    rows[clamp(Math.floor((bar.low - min) / rowH), n)]![side] += volume;
    return;
  }
  const first = clamp(Math.floor((bar.low - min) / rowH), n);
  const last = clamp(Math.floor((bar.high - min) / rowH - 1e-9), n);
  if (first === last) {
    rows[first]![side] += volume;
    return;
  }
  for (let k = first; k <= last; k += 1) {
    const bottom = k === 0 ? -Infinity : min + k * rowH;
    const top = k === n - 1 ? Infinity : min + (k + 1) * rowH;
    const overlap = Math.min(bar.high, top) - Math.max(bar.low, bottom);
    if (overlap > 0) rows[k]![side] += (volume * overlap) / span;
  }
}

/** The row with the most volume (the lowest such row on a tie, as Vela draws it). */
export function pointOfControl(rows: readonly ProfileRow[]): number | null {
  let best = -1;
  let bestVolume = 0;
  for (let k = 0; k < rows.length; k += 1) {
    const volume = total(rows[k]!);
    if (volume > bestVolume) {
      best = k;
      bestVolume = volume;
    }
  }
  return bestVolume > 0 ? best : null;
}

/** TradingView's value area around `poc`: the rows from `vaFrom` to `vaTo`, inclusive. */
export function valueArea(rows: readonly ProfileRow[], poc: number, share: number) {
  const n = rows.length;
  let sum = 0;
  for (const row of rows) sum += total(row);
  let remaining = sum * Math.min(1, Math.max(0, share)) - total(rows[poc]!);
  let vaFrom = poc;
  let vaTo = poc;
  while (remaining > 0 && (vaFrom > 0 || vaTo < n - 1)) {
    const above = vaTo < n - 1 ? total(rows[vaTo + 1]!) : -1;
    const below = vaFrom > 0 ? total(rows[vaFrom - 1]!) : -1;
    let goUp: boolean;
    if (above !== below) goUp = above > below;
    else {
      // Equal volumes: the row closer to the point of control, then the one above.
      const upDistance = vaTo + 1 - poc;
      const downDistance = poc - (vaFrom - 1);
      goUp = upDistance <= downDistance;
    }
    const volume = goUp ? above : below;
    if (volume > remaining) break;
    remaining -= volume;
    if (goUp) vaTo += 1;
    else vaFrom -= 1;
  }
  return { vaFrom, vaTo };
}

export function buildVolumeProfile(
  bars: readonly ProfileBar[],
  rowCount: number,
  valueAreaShare: number,
  /** Price range to split into rows; default: the candles' own. */
  frame?: { min: number; rowH: number; rows: number },
): VolumeProfile | null {
  const grid = frame
    ? {
        min: frame.min,
        rowH: frame.rowH,
        rows: Array.from({ length: frame.rows }, (_, k) => ({
          price: frame.min + k * frame.rowH,
          up: 0,
          down: 0,
        })),
      }
    : profileRows(bars, rowCount);
  if (!grid) return null;
  for (const bar of bars) addBar(grid.rows, grid.min, grid.rowH, bar);
  const poc = pointOfControl(grid.rows);
  if (poc === null) return null;
  const { vaFrom, vaTo } = valueArea(grid.rows, poc, valueAreaShare);
  return {
    rows: grid.rows,
    rowH: grid.rowH,
    min: grid.min,
    maxTotal: total(grid.rows[poc]!),
    poc,
    vaFrom,
    vaTo,
  };
}

/** Vela's timeframe ids, finest first, as TradingView tries them for a profile. */
const PROFILE_STEPS: { id: string; ms: number }[] = [
  { id: "1", ms: 60_000 },
  { id: "5", ms: 300_000 },
  { id: "15", ms: 900_000 },
  { id: "30", ms: 1_800_000 },
  { id: "60", ms: 3_600_000 },
  { id: "240", ms: 14_400_000 },
  { id: "1D", ms: 86_400_000 },
];
export const MAX_PROFILE_BARS = 5000;

/**
 * The candle size TradingView builds a profile over `[from, to)` from: the finest that fits
 * it in fewer than 5000 candles. Null when that is not finer than the chart's own candles
 * (use the chart's candles then).
 */
export function profileTimeframe(
  from: number,
  to: number,
  chartMs: number,
): { id: string; ms: number } | null {
  const span = Math.abs(to - from);
  for (const step of PROFILE_STEPS) {
    if (span / step.ms < MAX_PROFILE_BARS) return step.ms < chartMs ? step : null;
  }
  return null;
}
