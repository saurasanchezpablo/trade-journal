/**
 * Where drawings sit against the candles. Vela puts a new drawing just under the candles
 * (z -0.5) so the candles read on top of it, but a drawing inside the series stack is
 * painted on its own canvas and uploaded to the GPU as a full-chart texture on every frame
 * (each pan, zoom and live tick): with a few drawings that alone cost a third of the frame
 * rate. The journal keeps drawings over the candles, as TradingView does, from
 * `DRAWING_FLOOR_Z` up; only a drawing you send to the back goes under them.
 */
export const DRAWING_FLOOR_Z = 1000;

/** Vela's default placements (-0.5 under the candles, 0 or a small mount order). */
const isDefaultDepth = (z: unknown) =>
  z === undefined || z === null || (typeof z === "number" && z >= -0.5 && z < DRAWING_FLOOR_Z / 2);

/**
 * Saved drawings at a default depth lifted over the candles, keeping their order. Drawings
 * sent to the back (below -0.5) stay there. Safe to run on every load.
 */
export function liftDrawingDepth<T extends { drawings?: unknown }>(doc: T): T {
  if (!doc || !Array.isArray(doc.drawings)) return doc;
  let changed = false;
  const drawings = (doc.drawings as { zIndex?: unknown }[]).map((d) => {
    if (!d || typeof d !== "object" || !isDefaultDepth(d.zIndex)) return d;
    changed = true;
    return { ...d, zIndex: DRAWING_FLOOR_Z + (typeof d.zIndex === "number" ? d.zIndex : 0) };
  });
  return changed ? { ...doc, drawings } : doc;
}
