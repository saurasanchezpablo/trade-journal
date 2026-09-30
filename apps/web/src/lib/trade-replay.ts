import { RESOLUTIONS, type MarketHistory } from "./market-data";

/** Only revealed candles and fills are passed to the renderer. */
export function replayFrame<T extends { executedAt: string }>(
  history: MarketHistory,
  fills: T[],
  count: number,
) {
  const visible = history.bars.slice(
    0,
    Math.max(0, Math.min(history.bars.length, Math.floor(count))),
  );
  const through = visible.length
    ? visible.at(-1)!.time + RESOLUTIONS[history.resolution]
    : -Infinity;
  return {
    bars: visible,
    through,
    fills: fills.filter((fill) => Date.parse(fill.executedAt) <= through),
  };
}

type Bar = MarketHistory["bars"][number];

/**
 * A candle as it forms, `progress` (0 to 1) of the way through its time, for the replay's
 * animation. The order of the high and the low inside a candle is not known, so the path is
 * drawn the usual way: open, then the low and the high (the high first for a down candle),
 * then the close, each leg taking its share of the distance travelled. The wicks grow as the
 * path reaches them, the volume fills in, and at 1 it is exactly the candle.
 */
export function formingBar(bar: Bar, progress: number): Bar {
  if (progress >= 1) return bar;
  const p = Math.max(0, progress);
  const up = bar.close >= bar.open;
  const path = up
    ? [bar.open, bar.low, bar.high, bar.close]
    : [bar.open, bar.high, bar.low, bar.close];
  const legs = path.slice(1).map((price, i) => Math.abs(price - path[i]!));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  let price = bar.open;
  let high = bar.open;
  let low = bar.open;
  if (total > 0) {
    let left = p * total;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      const from = path[i]!;
      const to = path[i + 1]!;
      if (left >= leg) {
        price = to;
        left -= leg;
      } else {
        price = from + (to - from) * (leg === 0 ? 0 : left / leg);
        left = 0;
      }
      high = Math.max(high, price);
      low = Math.min(low, price);
      if (left === 0) break;
    }
  }
  return { time: bar.time, open: bar.open, high, low, close: price, volume: bar.volume * p };
}
