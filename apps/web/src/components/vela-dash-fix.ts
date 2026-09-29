import { clipDashedPath, pieceDashOffset, type ClipRect, type Subpath } from "@/lib/dash-clip";

const CLIPPED = Symbol.for("trade-journal.dash-clip");

type Ctx = CanvasRenderingContext2D & { [CLIPPED]?: true };

const CURVES = [
  "arc",
  "arcTo",
  "bezierCurveTo",
  "quadraticCurveTo",
  "ellipse",
  "rect",
  "roundRect",
] as const;

const sameMatrix = (a: DOMMatrix, b: DOMMatrix) =>
  a.a === b.a && a.b === b.b && a.c === b.c && a.d === b.d && a.e === b.e && a.f === b.f;

/**
 * Makes this context stroke a dashed path of straight lines only where it can be seen (see
 * `lib/dash-clip.ts`). Records the path as it is built; anything else (curves, a Path2D, a
 * rotated transform, a solid line) is stroked by the browser as before. Idempotent.
 */
export function clipDashesOn(ctx: CanvasRenderingContext2D): void {
  const c = ctx as Ctx;
  if (c[CLIPPED] || typeof c.getLineDash !== "function") return;
  c[CLIPPED] = true;
  const proto = Object.getPrototypeOf(ctx) as CanvasRenderingContext2D;
  const { beginPath, moveTo, lineTo, closePath } = proto;
  const stroke = proto.stroke as (this: CanvasRenderingContext2D, ...args: unknown[]) => void;
  let subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let straight = true;
  let matrix: DOMMatrix | null = null;
  const start = (self: CanvasRenderingContext2D, x: number, y: number) => {
    if (!matrix) matrix = self.getTransform();
    current = { points: [x, y], closed: false };
    subpaths.push(current);
  };
  c.beginPath = function () {
    subpaths = [];
    current = null;
    straight = true;
    matrix = null;
    beginPath.call(this);
  };
  c.moveTo = function (x: number, y: number) {
    if (Number.isFinite(x) && Number.isFinite(y)) start(this, x, y);
    moveTo.call(this, x, y);
  };
  c.lineTo = function (x: number, y: number) {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (current) current.points.push(x, y);
      else start(this, x, y);
    }
    lineTo.call(this, x, y);
  };
  c.closePath = function () {
    if (current && current.points.length >= 2) {
      current.closed = true;
      current = { points: current.points.slice(0, 2), closed: false };
      subpaths.push(current);
    }
    closePath.call(this);
  };
  for (const name of CURVES) {
    const original = proto[name] as ((...args: unknown[]) => void) | undefined;
    if (typeof original !== "function") continue;
    (c as unknown as Record<string, unknown>)[name] = function (
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) {
      straight = false;
      original.apply(this, args);
    };
  }
  c.stroke = function (this: CanvasRenderingContext2D, ...args: [] | [Path2D]) {
    const pieces = args.length === 0 && straight ? visiblePieces(this, subpaths, matrix) : null;
    if (!pieces) {
      stroke.apply(this, args);
      return;
    }
    const dash = this.getLineDash();
    const offset = this.lineDashOffset;
    for (const piece of pieces) {
      beginPath.call(this);
      moveTo.call(this, piece.points[0]!, piece.points[1]!);
      for (let i = 2; i + 1 < piece.points.length; i += 2) {
        lineTo.call(this, piece.points[i]!, piece.points[i + 1]!);
      }
      this.lineDashOffset = pieceDashOffset(offset, piece.start, dash);
      stroke.call(this);
    }
    this.lineDashOffset = offset;
    // Put the whole path back, for a fill or another stroke after this one.
    beginPath.call(this);
    for (const s of subpaths) {
      if (s.points.length < 2) continue;
      moveTo.call(this, s.points[0]!, s.points[1]!);
      for (let i = 2; i + 1 < s.points.length; i += 2) {
        lineTo.call(this, s.points[i]!, s.points[i + 1]!);
      }
      if (s.closed) closePath.call(this);
    }
  };
}

/** The visible runs of a dashed path, or null to stroke it as it is. */
function visiblePieces(
  ctx: CanvasRenderingContext2D,
  subpaths: Subpath[],
  built: DOMMatrix | null,
): ReturnType<typeof clipDashedPath> {
  if (subpaths.length === 0 || !built || ctx.getLineDash().length === 0) return null;
  const m = ctx.getTransform();
  // A path built under another transform, or a rotated one: leave it to the browser.
  if (!sameMatrix(m, built) || m.b !== 0 || m.c !== 0 || m.a === 0 || m.d === 0) return null;
  const { width, height } = ctx.canvas;
  const x0 = -m.e / m.a;
  const x1 = (width - m.e) / m.a;
  const y0 = -m.f / m.d;
  const y1 = (height - m.f) / m.d;
  // Cut ends and joins stay just outside the canvas, where they cannot be seen.
  const margin = Math.max(ctx.lineWidth, 1) * 2 + 4;
  const rect: ClipRect = {
    left: Math.min(x0, x1) - margin,
    right: Math.max(x0, x1) + margin,
    top: Math.min(y0, y1) - margin,
    bottom: Math.max(y0, y1) + margin,
  };
  return clipDashedPath(subpaths, rect);
}

interface PainterHost {
  userDrawings?: { painter?: object } | null;
  indicatorSlices?: { drawScene?: object } | null;
  /** `chart.renderer` is a control wrapping the active renderer. */
  renderer?: PainterHost | null;
}

/** Wraps a prototype method whose first argument is the context it paints on. */
function paintsOn(target: object | null | undefined, method: string): void {
  const proto = target && (Object.getPrototypeOf(target) as Record<string | symbol, unknown>);
  const key = Symbol.for(`trade-journal.dash-clip.${method}`);
  if (!proto || proto[key]) return;
  const original = proto[method];
  if (typeof original !== "function") return;
  proto[method] = function (this: unknown, ctx: unknown, ...rest: unknown[]) {
    if (ctx && typeof ctx === "object" && "getLineDash" in ctx) {
      clipDashesOn(ctx as CanvasRenderingContext2D);
    }
    return (original as (...args: unknown[]) => unknown).call(this, ctx, ...rest);
  };
  proto[key] = true;
}

/**
 * Zoomed in, a dashed drawing whose ends are far off screen made every frame slow (the browser
 * draws each of its dashes). Vela's user-drawing painter and its indicator-drawing renderer now
 * stroke only the visible part. Patches their prototypes once; a renderer without them (canvas
 * fallback, a future Vela) is left as it is.
 */
export function clipOffscreenDashes(renderer: unknown): void {
  const control = renderer as PainterHost | null;
  const r = control?.userDrawings || control?.indicatorSlices ? control : control?.renderer;
  paintsOn(r?.userDrawings?.painter, "paintAll");
  paintsOn(r?.userDrawings?.painter, "paintGhost");
  paintsOn(r?.indicatorSlices?.drawScene, "render");
}
