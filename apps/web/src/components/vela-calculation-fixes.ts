import type { Drawing, DrawingTypeMeta } from "@luxalgo/vela";
import {
  addBar,
  buildVolumeProfile,
  pointOfControl,
  profileTimeframe,
  valueArea,
  type ProfileBar,
  type VolumeProfile,
} from "@/lib/volume-profile";

/**
 * Vela's volume profile and anchored VWAP, computed the way TradingView does (see
 * lib/volume-profile.ts and docs/charts.md). Vela 0.7.7 counts a candle's whole volume in
 * every row its open, high, low and close land in, grows the value area past its target,
 * builds profiles from the chart's own candles only, and starts an anchored VWAP at the
 * first candle that opens after the anchor. The fixes replace the computations and keep
 * Vela's painting, settings and saved format.
 */

type DrawingInit = Parameters<DrawingTypeMeta["create"]>[0];
type RegistryApi = {
  getDrawingType(type: string): DrawingTypeMeta | undefined;
  registerDrawingType(meta: DrawingTypeMeta): void;
};

interface SeriesState {
  state: "ready" | "loading" | "unavailable";
  bars?: ProfileBar[];
}
/** What Vela hands a drawing to reach candles. */
interface Projector {
  barsInRange?(from: number, to: number): ProfileBar[] | null;
  seriesInRange?(timeframe: string, from: number, to: number): SeriesState;
}
interface Anchor {
  time: number;
  price: number;
}

const FIXED = Symbol.for("trade-journal.calculation-fix");
/** The widest candle a chart can have (a week); used to find the candle holding an anchor. */
const WIDEST_CANDLE_MS = 7 * 86_400_000;

/** The chart's candle length, from the spacing of its candles. */
export function candleMs(bars: readonly { time: number }[]): number {
  let step = Infinity;
  for (let i = 1; i < bars.length; i += 1) {
    const gap = bars[i]!.time - bars[i - 1]!.time;
    if (gap > 0 && gap < step) step = gap;
  }
  return step;
}

/**
 * The chart's candles from the one holding `from` (an anchor can sit anywhere inside a
 * candle, or come from another candle size) up to those opening by `to`.
 */
export function candlesFrom(proj: Projector, from: number, to: number): ProfileBar[] | null {
  const around = proj.barsInRange?.(from - WIDEST_CANDLE_MS, to) ?? null;
  if (!around || around.length === 0) return null;
  const step = candleMs(around);
  const out = around.filter((bar) =>
    Number.isFinite(step) ? bar.time + step > from : bar.time >= from,
  );
  return out.length ? out : null;
}

// ── Fixed range volume profile ──

interface FrvpSettings {
  rows: number;
  valueAreaPct: number;
  showDevelopingPoc: boolean;
  showDevelopingVa: boolean;
}
interface Point {
  time: number;
  price: number;
}
export interface FixedRangeResult {
  profile: VolumeProfile;
  developingPoc: Point[];
  developingVaHigh: Point[];
  developingVaLow: Point[];
}

/**
 * A fixed range profile from `bars` (the chart's candles in the range) and, when there are
 * finer candles for the range, from those, with the developing POC and value area at each
 * chart candle.
 */
export function fixedRangeProfile(
  chart: readonly ProfileBar[],
  fine: readonly ProfileBar[] | null,
  settings: FrvpSettings,
): FixedRangeResult | null {
  const source = fine && fine.length ? fine : chart;
  const share = settings.valueAreaPct / 100;
  const profile = buildVolumeProfile(source, settings.rows, share);
  if (!profile) return null;
  const developingPoc: Point[] = [];
  const developingVaHigh: Point[] = [];
  const developingVaLow: Point[] = [];
  if (settings.showDevelopingPoc || settings.showDevelopingVa) {
    const step = candleMs(chart);
    const rows = profile.rows.map((row) => ({ price: row.price, up: 0, down: 0 }));
    let next = 0;
    for (const candle of chart) {
      const end = Number.isFinite(step) ? candle.time + step : candle.time + 1;
      while (next < source.length && source[next]!.time < end)
        addBar(rows, profile.min, profile.rowH, source[next++]!);
      const poc = pointOfControl(rows);
      if (poc === null) continue;
      const { vaFrom, vaTo } = valueArea(rows, poc, share);
      developingPoc.push({ time: candle.time, price: rows[poc]!.price + profile.rowH / 2 });
      developingVaHigh.push({ time: candle.time, price: rows[vaTo]!.price + profile.rowH });
      developingVaLow.push({ time: candle.time, price: rows[vaFrom]!.price });
    }
  }
  return { profile, developingPoc, developingVaHigh, developingVaLow };
}

interface FrvpInstance {
  anchors: Anchor[];
  frvp: FrvpSettings;
  cachedRange: { min: number; max: number } | null;
}
type FrvpClass = new (init: DrawingInit) => FrvpInstance;

/** The chart's candles for a profile's range, and the finer ones TradingView would use. */
function rangeCandles(proj: Projector, anchors: Anchor[]) {
  const [a, b] = anchors;
  if (!a || !b) return null;
  const from = Math.min(a.time, b.time);
  const to = Math.max(a.time, b.time);
  const chart = candlesFrom(proj, from, to);
  if (!chart) return null;
  const step = candleMs(chart);
  const start = chart[0]!.time;
  const end = chart.at(-1)!.time + (Number.isFinite(step) ? step : 0);
  const size = profileTimeframe(start, end, Number.isFinite(step) ? step : Infinity);
  let fine: ProfileBar[] | null = null;
  if (size && proj.seriesInRange) {
    const res = proj.seriesInRange(size.id, start, end - 1);
    // Partial finer candles would draw a lopsided profile: the chart's stand in until ready.
    if (res.state === "ready" && res.bars?.length)
      fine = res.bars.filter((bar) => bar.time >= start && bar.time < end);
  }
  return { chart, fine };
}

function fixFixedRange(api: RegistryApi) {
  const meta = api.getDrawingType("fixedrangevp");
  if (!meta || (meta as unknown as Record<symbol, boolean>)[FIXED]) return;
  const Base = meta.create({ paneId: "price" }).constructor as FrvpClass;
  class TradingViewProfile extends Base {
    declare memoKey?: string;
    declare memo?: FixedRangeResult | null;
    barsInSpan(proj: Projector) {
      return rangeCandles(proj, this.anchors)?.chart ?? null;
    }
    compute(proj: Projector) {
      const candles = rangeCandles(proj, this.anchors);
      if (!candles) return null;
      const s = this.frvp;
      const { chart, fine } = candles;
      const source = fine ?? chart;
      const last = source.at(-1)!;
      const key = [
        chart[0]!.time,
        chart.length,
        fine ? "fine" : "chart",
        source.length,
        last.time,
        last.high,
        last.low,
        last.close,
        last.volume ?? 0,
        s.rows,
        s.valueAreaPct,
        s.showDevelopingPoc,
        s.showDevelopingVa,
      ].join("|");
      if (key !== this.memoKey) {
        this.memoKey = key;
        this.memo = fixedRangeProfile(chart, fine, s);
      }
      const result = this.memo ?? null;
      if (result)
        this.cachedRange = {
          min: result.profile.min,
          max: result.profile.min + result.profile.rowH * result.profile.rows.length,
        };
      return result;
    }
  }
  api.registerDrawingType({
    ...meta,
    create: (init) => new TradingViewProfile(init) as unknown as Drawing,
    [FIXED]: true,
  } as DrawingTypeMeta);
}

// ── Anchored VWAP ──

interface VwapSample {
  time: number;
  mid: number;
  upper: number;
  lower: number;
}
interface VwapInstance {
  anchors: Anchor[];
  vwap: { multiplier: number };
  cachedRange: { min: number; max: number } | null;
  cachedExtent: { min: number; max: number } | null;
}
type VwapClass = new (init: DrawingInit) => VwapInstance;

/**
 * VWAP from the first candle: hlc3 weighted by volume, with bands `mult` volume-weighted
 * standard deviations away (TradingView's `ta.vwap`). Without any volume, candles count
 * equally.
 */
export function anchoredVwap(bars: readonly ProfileBar[], mult: number): VwapSample[] {
  const useVolume = bars.some((bar) => (bar.volume ?? 0) > 0);
  let w = 0;
  let pv = 0;
  let p2v = 0;
  return bars.map((bar) => {
    const tp = (bar.high + bar.low + bar.close) / 3;
    const weight = useVolume ? Math.max(0, bar.volume ?? 0) : 1;
    w += weight;
    pv += tp * weight;
    p2v += tp * tp * weight;
    const mid = w > 0 ? pv / w : tp;
    const dev = w > 0 ? Math.sqrt(Math.max(0, p2v / w - mid * mid)) * mult : 0;
    return { time: bar.time, mid, upper: mid + dev, lower: mid - dev };
  });
}

function fixAnchoredVwap(api: RegistryApi) {
  const meta = api.getDrawingType("anchoredvwap");
  if (!meta || (meta as unknown as Record<symbol, boolean>)[FIXED]) return;
  const Base = meta.create({ paneId: "price" }).constructor as VwapClass;
  class AnchoredAtCandle extends Base {
    series(proj: Projector) {
      const a = this.anchors[0];
      if (!a) return null;
      const bars = candlesFrom(proj, a.time, Number.POSITIVE_INFINITY);
      if (!bars) return null;
      const pts = anchoredVwap(bars, this.vwap.multiplier);
      let min = Infinity;
      let max = -Infinity;
      for (const p of pts) {
        if (p.lower < min) min = p.lower;
        if (p.upper > max) max = p.upper;
      }
      this.cachedRange = { min, max };
      this.cachedExtent = { min: pts[0]!.time, max: pts.at(-1)!.time };
      return pts;
    }
  }
  api.registerDrawingType({
    ...meta,
    create: (init) => new AnchoredAtCandle(init) as unknown as Drawing,
    [FIXED]: true,
  } as DrawingTypeMeta);
}

/** Replace the drawing computations; run before a chart is created, safe to repeat. */
export function applyCalculationFixes(api: RegistryApi): void {
  fixFixedRange(api);
  fixAnchoredVwap(api);
}

// ── Visible range volume profile (a renderer layer, patched per chart) ──

interface VpvrData {
  rows: number;
  widthFrac: number;
  upColor: string;
  downColor: string;
  showPoc: boolean;
  valueAreaFrac: number;
}
interface VpvrRenderArgs {
  bars: ProfileBar[];
  data: VpvrData | null;
  visible: boolean;
  coords: {
    dpr: number;
    width: number;
    visibleLogicalRange(): { from: number; to: number };
    priceToY(price: number, scale: unknown, bounds: unknown): number;
  };
  scale: unknown;
  bounds: { top: number; height: number };
  theme: { textColor: string };
}
interface VpvrRendererLike {
  ctx: CanvasRenderingContext2D | null;
  canvas: HTMLCanvasElement | null;
  render(args: VpvrRenderArgs): void;
}
interface RendererLike {
  vpvrRenderer?: VpvrRendererLike;
  userDrawings?: { seriesGateway?: { seriesInRange: Projector["seriesInRange"] } };
}

const VA_ALPHA = 0.62;
const OUTSIDE_ALPHA = 0.28;
const POC_ALPHA = 0.9;

function paintProfile(
  ctx: CanvasRenderingContext2D,
  profile: VolumeProfile,
  geom: { rightX: number; maxW: number; yOf: (price: number) => number },
  style: { upColor: string; downColor: string; showPoc: boolean; pocColor: string },
) {
  const { rows, rowH, maxTotal, poc, vaFrom, vaTo } = profile;
  if (maxTotal <= 0 || geom.maxW <= 0) return;
  rows.forEach((row, k) => {
    const total = row.up + row.down;
    if (total <= 0) return;
    const yTop = geom.yOf(row.price + rowH);
    const h = Math.max(1, geom.yOf(row.price) - yTop - 1);
    const w = (total / maxTotal) * geom.maxW;
    const upW = (row.up / total) * w;
    ctx.globalAlpha = k >= vaFrom && k <= vaTo ? VA_ALPHA : OUTSIDE_ALPHA;
    if (upW > 0) {
      ctx.fillStyle = style.upColor;
      ctx.fillRect(geom.rightX - w, yTop, upW, h);
    }
    if (w - upW > 0) {
      ctx.fillStyle = style.downColor;
      ctx.fillRect(geom.rightX - w + upW, yTop, w - upW, h);
    }
  });
  if (style.showPoc) {
    const row = rows[poc]!;
    const yTop = geom.yOf(row.price + rowH);
    const h = Math.max(1, geom.yOf(row.price) - yTop - 1);
    ctx.globalAlpha = POC_ALPHA;
    ctx.strokeStyle = style.pocColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(geom.rightX - geom.maxW + 0.5, yTop + 0.5, geom.maxW - 1, h);
  }
  ctx.globalAlpha = 1;
}

/**
 * Give a chart's visible range volume profile TradingView's value area and lower-timeframe
 * candles. Vela 0.7.7 keeps this layer internal; when its shape is not the expected one the
 * chart keeps Vela's own.
 */
export function patchVisibleRangeProfile(renderer: unknown): boolean {
  const r = renderer as RendererLike | null;
  const layer = r?.vpvrRenderer;
  if (!layer || typeof layer.render !== "function" || !("ctx" in layer)) return false;
  let memoKey = "";
  let memo: VolumeProfile | null = null;
  layer.render = function render(args: VpvrRenderArgs) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const { bars, data, visible, coords, scale, bounds, theme } = args;
    ctx.setTransform(coords.dpr, 0, 0, coords.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / coords.dpr, canvas.height / coords.dpr);
    if (!data || !visible || bars.length === 0 || bounds.height <= 0) return;
    const range = coords.visibleLogicalRange();
    const i0 = Math.max(0, Math.floor(range.from));
    const i1 = Math.min(bars.length - 1, Math.ceil(range.to));
    if (i0 > i1) return;
    const shown = bars.slice(i0, i1 + 1);
    const step = candleMs(bars.slice(Math.max(0, i0 - 1), i1 + 1));
    const start = shown[0]!.time;
    const end = shown.at(-1)!.time + (Number.isFinite(step) ? step : 0);
    const size = profileTimeframe(start, end, Number.isFinite(step) ? step : Infinity);
    const gateway = r?.userDrawings?.seriesGateway;
    let fine: ProfileBar[] | null = null;
    if (size && gateway?.seriesInRange) {
      const res = gateway.seriesInRange(size.id, start, end - 1);
      if (res.state === "ready" && res.bars?.length)
        fine = res.bars.filter((bar) => bar.time >= start && bar.time < end);
    }
    const source = fine ?? shown;
    const last = source.at(-1)!;
    const key = [
      start,
      end,
      fine ? "fine" : "chart",
      source.length,
      last.high,
      last.low,
      last.close,
      last.volume ?? 0,
      data.rows,
      data.valueAreaFrac,
    ].join("|");
    if (key !== memoKey) {
      memoKey = key;
      memo = buildVolumeProfile(source, data.rows, data.valueAreaFrac);
    }
    if (!memo) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bounds.top, coords.width, bounds.height);
    ctx.clip();
    paintProfile(
      ctx,
      memo,
      {
        rightX: coords.width,
        maxW: coords.width * data.widthFrac,
        yOf: (price) => coords.priceToY(price, scale, bounds),
      },
      {
        upColor: data.upColor,
        downColor: data.downColor,
        showPoc: data.showPoc,
        pocColor: theme.textColor,
      },
    );
    ctx.restore();
  };
  return true;
}
