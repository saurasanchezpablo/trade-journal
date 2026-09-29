/**
 * Dashed lines clipped to what can be seen. A canvas strokes every dash of a line, even the
 * ones far off screen, and zoomed in a drawing's line can run for millions of pixels (a trend
 * line between two distant bars, a steep ray): the browser then draws millions of dashes each
 * frame. Stroking only the visible part, with the dash offset moved by the distance cut off,
 * paints the same pixels.
 */

/** A rectangle in the canvas's user space. */
export interface ClipRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A path's subpath as it was built: flat `x, y` pairs, closed or not. */
export interface Subpath {
  points: number[];
  closed: boolean;
}

/** A visible run of a subpath: flat `x, y` pairs, starting `start` pixels along its subpath. */
export interface DashPiece {
  start: number;
  points: number[];
}

/** The part of the segment a→b inside the rectangle, as `[t0, t1]` along it, or null. */
export function clipSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: ClipRect,
): [number, number] | null {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, ax - r.left],
    [dx, r.right - ax],
    [-dy, ay - r.top],
    [dy, r.bottom - ay],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [t0, t1];
}

const inside = (x: number, y: number, r: ClipRect) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/**
 * The visible runs of a path, to stroke one by one in place of the whole path, or null when
 * every point is already inside the rectangle (the path is then stroked as it is).
 */
export function clipDashedPath(subpaths: Subpath[], r: ClipRect): DashPiece[] | null {
  let all = true;
  for (const s of subpaths) {
    for (let i = 0; i + 1 < s.points.length && all; i += 2) {
      all = inside(s.points[i]!, s.points[i + 1]!, r);
    }
  }
  if (all) return null;
  const pieces: DashPiece[] = [];
  for (const s of subpaths) {
    const pts =
      s.closed && s.points.length >= 4 ? [...s.points, s.points[0]!, s.points[1]!] : s.points;
    let piece: DashPiece | null = null;
    let along = 0;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = pts[i]!;
      const ay = pts[i + 1]!;
      const bx = pts[i + 2]!;
      const by = pts[i + 3]!;
      const length = Math.hypot(bx - ax, by - ay);
      const t = clipSegment(ax, ay, bx, by, r);
      if (!t) {
        piece = null;
      } else {
        const [t0, t1] = t;
        const ex = ax + (bx - ax) * t1;
        const ey = ay + (by - ay) * t1;
        if (piece && t0 === 0) piece.points.push(ex, ey);
        else {
          piece = {
            start: along + length * t0,
            points: [ax + (bx - ax) * t0, ay + (by - ay) * t0, ex, ey],
          };
          pieces.push(piece);
        }
        if (t1 < 1) piece = null;
      }
      along += length;
    }
  }
  return pieces;
}

/** The dash offset that starts a run `start` pixels along its path in the same phase. */
export function pieceDashOffset(offset: number, start: number, dash: readonly number[]): number {
  const period = dash.reduce((sum, v) => sum + v, 0);
  if (!(period > 0)) return offset;
  return (((offset + start) % period) + period) % period;
}
