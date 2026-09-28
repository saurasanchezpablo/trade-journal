import type { DrawingsDocument, StoredDrawing } from "./chart-analysis";

/**
 * Which way a Fibonacci retracement measures. TradingView puts level 0 on the second point
 * (the end of the move) and 1 on the first, so a retracement drawn from a swing low to a
 * swing high reads its levels down from the high; its **Reverse** option flips that. Vela
 * measures from the first point, which is TradingView's reversed retracement.
 *
 * Retracements carry `reverse` in their props. Those saved before the journal followed
 * TradingView have none: they are marked reversed when loaded, so they stay where they were
 * drawn (switch Reverse off to measure them TradingView's way).
 */
export const REVERSE_PROP = "reverse";

const isRetracement = (drawing: Pick<StoredDrawing, "type">) => drawing.type === "fibretracement";

/** Whether a stored retracement measures from its first point (a missing flag: saved before). */
export function retracementReversed(drawing: StoredDrawing | { props?: unknown }): boolean {
  const flag = (drawing.props as Record<string, unknown> | undefined)?.[REVERSE_PROP];
  return typeof flag === "boolean" ? flag : true;
}

/** The price of a retracement level: from the second point back, or from the first reversed. */
export function retracementPrice(
  a: { price: number },
  b: { price: number },
  ratio: number,
  reversed: boolean,
): number {
  return reversed ? a.price + ratio * (b.price - a.price) : b.price + ratio * (a.price - b.price);
}

/** Mark retracements saved without a direction as reversed (how they were drawn). */
export function markLegacyFibs(doc: DrawingsDocument): DrawingsDocument {
  let changed = false;
  const drawings = doc.drawings.map((drawing) => {
    const props = (drawing.props ?? undefined) as Record<string, unknown> | undefined;
    if (!isRetracement(drawing) || typeof props?.[REVERSE_PROP] === "boolean") return drawing;
    changed = true;
    return { ...drawing, props: { ...props, [REVERSE_PROP]: true } };
  });
  return changed ? { ...doc, drawings } : doc;
}
