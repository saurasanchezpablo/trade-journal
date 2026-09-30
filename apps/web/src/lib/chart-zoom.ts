/**
 * How far a chart zooms in. Vela lets you zoom until two candles fill the chart (up to 1000
 * pixels a candle) and squeeze the price axis without end; that far in, a chart slows down
 * and shows nothing useful. The limits below keep at least a screenful of candles and a price
 * window no narrower than a fraction of what they span.
 */

/** Zoomed all the way in, at least this many candles fit across the chart. */
export const MIN_VISIBLE_CANDLES = 20;
/** And no candle is wider than this, in CSS pixels (on a wide screen more candles fit). */
export const MAX_CANDLE_PX = 40;
/** Dragging the price axis stops once the window is this share of the candles' range. */
export const MIN_PRICE_WINDOW = 0.2;

/** The widest bar spacing Vela may use, given the plot width and its spacing scale. */
export function maxBarSpacing(width: number, spacingScale = 1): number {
  const scale = spacingScale > 0 ? spacingScale : 1;
  return Math.min(MAX_CANDLE_PX, width / MIN_VISIBLE_CANDLES) / scale;
}

export interface PriceWindow {
  min: number;
  max: number;
  log?: boolean;
}

/** The low and high of the candles from index `from` to `to`, or null when there are none. */
export function candleRange(
  bars: ReadonlyArray<{ high: number; low: number }>,
  from: number,
  to: number,
): { low: number; high: number } | null {
  let low = Infinity;
  let high = -Infinity;
  for (let i = Math.max(0, Math.floor(from)); i <= Math.min(bars.length - 1, Math.ceil(to)); i++) {
    const bar = bars[i];
    if (!bar || !Number.isFinite(bar.low) || !Number.isFinite(bar.high)) continue;
    low = Math.min(low, bar.low);
    high = Math.max(high, bar.high);
  }
  return high > low ? { low, high } : null;
}

/**
 * The price window widened around its center to at least `MIN_PRICE_WINDOW` of the candles'
 * range (in log terms on a log scale), or the same window when it is already wide enough.
 */
export function clampPriceWindow(
  window: PriceWindow,
  candles: { low: number; high: number } | null,
): PriceWindow {
  if (!candles) return window;
  const log = window.log === true && window.min > 0 && candles.low > 0;
  const f = log ? Math.log : (v: number) => v;
  const back = log ? Math.exp : (v: number) => v;
  const lo = f(window.min);
  const hi = f(window.max);
  const floor = (f(candles.high) - f(candles.low)) * MIN_PRICE_WINDOW;
  if (!(floor > 0) || hi - lo >= floor) return window;
  const center = (lo + hi) / 2;
  return { ...window, min: back(center - floor / 2), max: back(center + floor / 2) };
}
