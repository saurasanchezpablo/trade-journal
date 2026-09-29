import { describe, expect, it } from "vitest";
import { clipDashedPath, clipSegment, pieceDashOffset } from "../src/lib/dash-clip";
import { clipDashesOn, clipOffscreenDashes } from "../src/components/vela-dash-fix";

const screen = { left: 0, top: 0, right: 100, bottom: 50 };

describe("dashed lines are clipped to what can be seen", () => {
  it("a segment keeps only its visible part", () => {
    expect(clipSegment(10, 10, 90, 40, screen)).toEqual([0, 1]);
    const [t0, t1] = clipSegment(-100, 25, 200, 25, screen)!;
    expect(-100 + 300 * t0).toBeCloseTo(0);
    expect(-100 + 300 * t1).toBeCloseTo(100);
    expect(clipSegment(-100, -10, 200, -10, screen)).toBeNull();
    expect(clipSegment(-100, 200, 200, 300, screen)).toBeNull();
  });

  it("a path already on screen is stroked as it is", () => {
    expect(clipDashedPath([{ points: [5, 5, 95, 45, 50, 10], closed: false }], screen)).toBeNull();
  });

  it("a line running far off screen becomes its visible run, starting where it was cut", () => {
    const pieces = clipDashedPath(
      [{ points: [-1_000_000, 25, 1_000_000, 25], closed: false }],
      screen,
    )!;
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.start).toBeCloseTo(1_000_000);
    expect(pieces[0]!.points).toEqual([0, 25, 100, 25]);
  });

  it("a line entirely off screen draws nothing", () => {
    expect(clipDashedPath([{ points: [-500, -5, 500, -9], closed: false }], screen)).toEqual([]);
  });

  it("a polyline that leaves and comes back splits into runs, joins on screen kept", () => {
    const pieces = clipDashedPath(
      [{ points: [10, 10, 50, 40, 90, 10, 90, -100, 60, 20], closed: false }],
      screen,
    )!;
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.start).toBe(0);
    expect(pieces[0]!.points).toEqual([10, 10, 50, 40, 90, 10, 90, 0]);
    // Back on screen 100 of the last segment's 120 pixels down: 50 + 50 + 110 before it.
    const back = pieces[1]!;
    expect(back.points[0]).toBeCloseTo(90 - 30 * (100 / 120), 5);
    expect(back.points[1]).toBeCloseTo(0, 5);
    expect(back.start).toBeCloseTo(210 + Math.hypot(30, 120) * (100 / 120), 5);
    expect(back.points.slice(2)).toEqual([60, 20]);
  });

  it("a closed shape strokes its closing side too", () => {
    const pieces = clipDashedPath(
      [{ points: [10, 10, 500, 10, 500, 40, 10, 40], closed: true }],
      screen,
    )!;
    const last = pieces.at(-1)!;
    expect(last.points.slice(-2)).toEqual([10, 10]);
  });

  it("the dash keeps its phase across the cut", () => {
    expect(pieceDashOffset(0, 1_000_003, [6, 4])).toBeCloseTo(3);
    expect(pieceDashOffset(2, 7, [2, 3])).toBeCloseTo(4);
    expect(pieceDashOffset(-1, 0, [6, 4])).toBeCloseTo(9);
    expect(pieceDashOffset(5, 100, [])).toBe(5);
  });
});

/** A 2D context stand-in that records what reaches the canvas. */
class FakeContext {
  canvas = { width: 200, height: 100 };
  lineWidth = 1;
  lineDashOffset = 0;
  strokes: Array<{ path: number[][]; offset: number }> = [];
  fills: number[][][] = [];
  private dash: number[] = [];
  private path: number[][] = [];
  private matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  setLineDash(d: number[]) {
    this.dash = d;
  }
  getLineDash() {
    return this.dash;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.matrix = { a, b, c, d, e, f };
  }
  getTransform() {
    return { ...this.matrix } as DOMMatrix;
  }
  beginPath() {
    this.path = [];
  }
  moveTo(x: number, y: number) {
    this.path.push([x, y]);
  }
  lineTo(x: number, y: number) {
    this.path.at(-1)?.push(x, y);
  }
  closePath() {
    const s = this.path.at(-1);
    if (s) s.push(s[0]!, s[1]!);
  }
  arc() {
    this.path.push([NaN]);
  }
  stroke() {
    this.strokes.push({ path: this.path.map((s) => [...s]), offset: this.lineDashOffset });
  }
  fill() {
    this.fills.push(this.path.map((s) => [...s]));
  }
}

const patched = () => {
  const fake = new FakeContext();
  clipDashesOn(fake as unknown as CanvasRenderingContext2D);
  return { fake, ctx: fake as unknown as CanvasRenderingContext2D };
};

describe("the chart's drawing canvas", () => {
  it("strokes a far-reaching dashed line only where the canvas is, in the same phase", () => {
    const { fake, ctx } = patched();
    ctx.setTransform(2, 0, 0, 2, 0, 0); // a 100 x 50 plot at DPR 2
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(-1_000_000, 25);
    ctx.lineTo(1_000_000, 25);
    ctx.stroke();
    expect(fake.strokes).toHaveLength(1);
    const [[x0, , x1]] = fake.strokes[0]!.path as [[number, number, number]];
    expect(x0).toBeLessThan(0);
    expect(x0).toBeGreaterThan(-20);
    expect(x1).toBeGreaterThan(100);
    expect(x1).toBeLessThan(120);
    expect(fake.strokes[0]!.offset).toBeCloseTo((1_000_000 + x0) % 10, 5);
    expect(ctx.lineDashOffset).toBe(0);
  });

  it("leaves solid lines, curves and lines on screen to the browser", () => {
    const { fake, ctx } = patched();
    ctx.beginPath();
    ctx.moveTo(-1_000_000, 25);
    ctx.lineTo(1_000_000, 25);
    ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(-1_000_000, 25);
    ctx.arc(0, 0, 5, 0, 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(90, 40);
    ctx.stroke();
    expect(fake.strokes.map((s) => s.path[0]![0])).toEqual([-1_000_000, -1_000_000, 10]);
  });

  it("gives the whole path back after stroking, for a fill", () => {
    const { fake, ctx } = patched();
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(5000, 20);
    ctx.lineTo(20, 80);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    expect(fake.strokes.length).toBeGreaterThan(0);
    expect(fake.fills[0]![0]!.slice(0, 6)).toEqual([20, 20, 5000, 20, 20, 80]);
  });

  it("is patched through the chart's renderer control, once", () => {
    const seen: unknown[] = [];
    class Painter {
      paintAll(ctx: unknown) {
        seen.push(ctx);
      }
      paintGhost() {}
    }
    class Scene {
      render() {}
    }
    const native = {
      userDrawings: { painter: new Painter() },
      indicatorSlices: { drawScene: new Scene() },
    };
    clipOffscreenDashes({ renderer: native });
    clipOffscreenDashes({ renderer: native });
    clipOffscreenDashes(null);
    const fake = new FakeContext();
    native.userDrawings.painter.paintAll(fake);
    expect(seen).toEqual([fake]);
    expect(Object.hasOwn(fake, "stroke")).toBe(true);
    const original = Object.getOwnPropertyDescriptor(Painter.prototype, "paintAll")!.value;
    clipOffscreenDashes({ renderer: native });
    expect(Object.getOwnPropertyDescriptor(Painter.prototype, "paintAll")!.value).toBe(original);
  });
});
