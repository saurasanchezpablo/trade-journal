/**
 * The trade page's candle chart, for an AI critique to look at: the market replay chart
 * registers how to take its picture while it is shown, and the critique asks for it. Only
 * a chart on screen can be sent; nothing is kept.
 */
const shooters = new Map<string, () => string | null>();

export function registerTradeSnapshot(tradeKey: string, shoot: () => string | null) {
  shooters.set(tradeKey, shoot);
  return () => {
    if (shooters.get(tradeKey) === shoot) shooters.delete(tradeKey);
  };
}

/** A PNG data URL of the trade's chart, or null when none is shown. */
export function tradeSnapshot(tradeKey: string): string | null {
  try {
    const url = shooters.get(tradeKey)?.() ?? null;
    return url?.startsWith("data:image/png;base64,") ? url : null;
  } catch {
    return null;
  }
}
