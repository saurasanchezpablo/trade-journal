import { describe, expect, it } from "vitest";
import type { Vela } from "@luxalgo/vela";
import { DRAWING_FLOOR_Z, liftDrawingDepth } from "../src/lib/drawing-depth";
import { keepDrawingsOverSeries } from "../src/components/vela-depth-fix";

describe("drawings over the candles", () => {
  it("lift saved drawings at Vela's default depth, keeping their order", () => {
    const doc = {
      version: 1,
      drawings: [
        { id: "a", zIndex: -0.5 },
        { id: "b", zIndex: 0 },
        { id: "c", zIndex: 3 },
        { id: "d" },
      ],
    };
    expect(liftDrawingDepth(doc).drawings.map((d) => d.zIndex)).toEqual([
      DRAWING_FLOOR_Z - 0.5,
      DRAWING_FLOOR_Z,
      DRAWING_FLOOR_Z + 3,
      DRAWING_FLOOR_Z,
    ]);
  });

  it("leave drawings sent to the back under the candles, and lifted ones alone", () => {
    const doc = {
      version: 1,
      drawings: [
        { id: "back", zIndex: -1.5 },
        { id: "up", zIndex: 1004 },
      ],
    };
    expect(liftDrawingDepth(doc)).toBe(doc);
    const once = liftDrawingDepth({ drawings: [{ id: "a", zIndex: -0.5 }] });
    expect(liftDrawingDepth(once)).toBe(once);
  });

  it("start new drawings over the candles, in front of every other drawing", () => {
    class Controller {
      store = { zCounter: 1 };
      startZ(_type: string, _pane: string): number | undefined {
        return -0.5; // Vela: just under the candles
      }
    }
    const ctrl = new Controller();
    const chart = { drawings: { ctrl } } as unknown as Vela;
    keepDrawingsOverSeries(chart);
    keepDrawingsOverSeries(chart); // patching twice is harmless
    expect(ctrl.startZ("hline", "price")).toBe(DRAWING_FLOOR_Z);
    ctrl.store.zCounter = DRAWING_FLOOR_Z + 7;
    expect(ctrl.startZ("hline", "price")).toBe(DRAWING_FLOOR_Z + 7);
  });

  it("leave a renderer without shared depth as it is", () => {
    class Plain {
      store = { zCounter: 4 };
      startZ(): number | undefined {
        return undefined;
      }
    }
    const ctrl = new Plain();
    keepDrawingsOverSeries({ drawings: { ctrl } } as unknown as Vela);
    expect(ctrl.startZ()).toBeUndefined();
  });
});
