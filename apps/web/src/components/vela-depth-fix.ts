import type { Vela } from "@luxalgo/vela";
import { DRAWING_FLOOR_Z } from "@/lib/drawing-depth";

const PATCHED = Symbol.for("trade-journal.drawing-depth");

interface DepthController {
  startZ(type: string, paneId: string): number | undefined;
  store?: { zCounter?: number };
}

/**
 * New drawings start over the candles (see `lib/drawing-depth.ts`), in front of every other
 * drawing, instead of Vela's "just under the candles". Patches the drawing controller's
 * prototype once; a renderer without a shared depth (canvas fallback) is left as it is.
 */
export function keepDrawingsOverSeries(chart: Vela): void {
  const ctrl = (chart.drawings as unknown as { ctrl?: DepthController }).ctrl;
  const proto = ctrl && (Object.getPrototypeOf(ctrl) as DepthController & Record<symbol, boolean>);
  if (!proto || proto[PATCHED] || typeof proto.startZ !== "function") return;
  const original = proto.startZ;
  proto.startZ = function (this: DepthController, type: string, paneId: string) {
    const base = original.call(this, type, paneId);
    if (base === undefined) return base;
    const counter = this.store?.zCounter;
    // Ties paint in insertion order, so the store's counter keeps the newest in front.
    return Math.max(
      DRAWING_FLOOR_Z,
      typeof counter === "number" && Number.isFinite(counter) ? counter : 0,
    );
  };
  proto[PATCHED] = true;
}
