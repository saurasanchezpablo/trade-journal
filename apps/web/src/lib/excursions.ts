import { RESOLUTIONS, type ExcursionEstimate, type MarketHistory } from "./market-data";

interface Fill {
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executedAt: string;
}
interface Trade {
  direction: string;
  openedAt: string;
  closedAt?: string | null;
  assetClass?: string | null;
  contractMultiplier?: number | null;
}

/** Gross position-equity excursions: realized cash flows + value of the remaining position.
 * Uses complete candles only while the position is constant; never invents an intrabar path.
 * Fees and FX conversion are excluded. Fill facts are not modified or persisted.
 */
export function estimateExcursions(
  trade: Trade,
  fills: Fill[],
  history: MarketHistory,
  basisConfirmed: boolean,
): ExcursionEstimate {
  const warnings: string[] = [];
  const empty = (reason: string): ExcursionEstimate => ({
    mae: null,
    mfe: null,
    sampledBars: 0,
    excludedBars: 0,
    warnings: [reason],
  });
  const candleDuration = RESOLUTIONS[history.resolution];
  // A coarse sanity check, not proof that currencies, contracts or adjustments match.
  // Reject a conspicuous mismatch even if the user checked the confirmation box.
  for (const fill of fills) {
    const time = Date.parse(fill.executedAt);
    let lo = 0,
      hi = history.bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (history.bars[mid]!.time <= time) lo = mid + 1;
      else hi = mid;
    }
    const candidate = history.bars[lo - 1];
    const bar = candidate && candidate.time + candleDuration > time ? candidate : undefined;
    if (!bar || !Number.isFinite(fill.price)) continue;
    const distance = Math.max(bar.low - fill.price, fill.price - bar.high, 0);
    if (distance > 0.2 * Math.max(Math.abs(bar.close), Math.abs(fill.price), 1e-9)) {
      return {
        ...empty(
          "Recorded fills differ by more than 20% from matching market candles. Check for demo trades, a different instrument, quote currency or price adjustment basis. MAE/MFE estimates and fill labels are unavailable until the prices are reconciled.",
        ),
        priceBasisMismatch: true,
      };
    }
  }
  if (!basisConfirmed)
    return empty(
      "Monetary estimates need candles quoted in the account's currency. The price move is shown instead.",
    );
  if (!trade.closedAt) return empty("Estimates are available for closed trades only.");
  if (history.truncated)
    return empty("History is truncated. Load a coarser resolution for estimates.");
  const multiplier =
    trade.contractMultiplier ?? (["equity", "crypto"].includes(trade.assetClass ?? "") ? 1 : null);
  if (multiplier === null || !Number.isFinite(multiplier) || multiplier <= 0)
    return empty(
      "Set this symbol's contract multiplier in Settings before calculating monetary estimates.",
    );
  const open = Date.parse(trade.openedAt),
    close = Date.parse(trade.closedAt);
  const step = RESOLUTIONS[history.resolution];
  const sorted = fills
    .map((fill) => ({ ...fill, time: Date.parse(fill.executedAt) }))
    .sort((a, b) => a.time - b.time);
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(close) ||
    close <= open ||
    sorted.length < 2 ||
    sorted.some(
      (f) =>
        !Number.isFinite(f.time) ||
        !Number.isFinite(f.price) ||
        !Number.isFinite(f.quantity) ||
        f.quantity <= 0 ||
        f.time < open ||
        f.time > close,
    ) ||
    sorted[0]!.time !== open ||
    sorted.at(-1)!.time !== close
  )
    return empty("Execution timestamps or quantities do not describe a complete position cycle.");
  const bars = history.bars.filter((bar) => bar.time < close && bar.time + step > open);
  if (!bars.length || bars[0]!.time > open || bars.at(-1)!.time + step < close)
    return empty("Market history does not cover both entry and exit. Estimates are unavailable.");
  if (bars.some((bar, index) => index > 0 && bar.time - bars[index - 1]!.time > step))
    warnings.push(
      "History contains gaps, which may be closed sessions or missing data. Estimates use observed candles only.",
    );
  let position = 0,
    cash = 0,
    minimum = 0,
    maximum = 0,
    index = 0,
    sampledBars = 0,
    excludedBars = 0;
  const direction = trade.direction === "long" ? 1 : -1;
  const epsilon = sorted.reduce((largest, fill) => Math.max(largest, fill.quantity), 1) * 1e-8;
  const mark = (price: number) => {
    const value = (cash + position * price) * multiplier;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  };
  const apply = (fill: (typeof sorted)[number]) => {
    mark(fill.price);
    const quantity = fill.side === "buy" ? fill.quantity : -fill.quantity;
    cash -= quantity * fill.price;
    position += quantity;
    mark(fill.price);
    return position * direction >= -epsilon;
  };
  for (const bar of bars) {
    while (index < sorted.length && sorted[index]!.time <= bar.time) {
      if (!apply(sorted[index++]!))
        return empty(
          "A reversing execution spans multiple trades. Excursion estimates are unavailable for this cycle.",
        );
    }
    const nextFill = sorted[index]?.time ?? Infinity;
    if (
      bar.time < open ||
      bar.time + step > close ||
      nextFill < bar.time + step ||
      Math.abs(position) <= epsilon
    ) {
      excludedBars++;
      continue;
    }
    mark(bar.high);
    mark(bar.low);
    sampledBars++;
  }
  while (index < sorted.length)
    if (!apply(sorted[index++]!))
      return empty(
        "A reversing execution spans multiple trades. Excursion estimates are unavailable for this cycle.",
      );
  if (Math.abs(position) > epsilon)
    return empty(
      "The recorded fills do not return this position to flat. Estimates are unavailable.",
    );
  if (!sampledBars)
    return empty(
      "No complete candle falls between fills. Choose a finer resolution; fill prices alone cannot estimate excursions.",
    );
  if (excludedBars)
    warnings.push(
      `${excludedBars} candles straddle a fill or trade boundary and were excluded; excursions may be understated.`,
    );
  warnings.push(
    "Estimated gross position P&L, including realized partial exits and remaining exposure. Fees and currency conversion are excluded; the order of highs and lows within a candle is unknown.",
  );
  if (![minimum, maximum].every(Number.isFinite))
    return empty("The position values exceed the supported numeric range.");
  return { mae: Math.abs(minimum), mfe: maximum, sampledBars, excludedBars, warnings };
}
