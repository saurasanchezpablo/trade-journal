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
import { FOREX_SESSION, VWAP_SESSION_ZONES } from "@/lib/market-sessions";
import { REVERSE_PROP, retracementPrice } from "@/lib/fib-direction";
import { formatSpan, levelPrice, signedPrice } from "@/lib/price-format";

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

// ── Fibonacci retracement: TradingView's direction, with its Reverse option ──

interface FibLevel {
  ratio: number;
  enabled: boolean;
  color: string;
  label?: string;
}
interface FibInstance {
  anchors: Anchor[];
  levels: FibLevel[];
  paneId: string;
  readProps(props: Record<string, unknown>): void;
  writeProps(): Record<string, unknown> | undefined;
  schema(): { fields: Record<string, unknown>[] };
}
type FibClass = new (init: DrawingInit) => FibInstance;
interface PixelProjector {
  xOf(time: number): number;
  yOf(price: number, paneId: string): number | null;
}

interface LevelLine {
  ratio: number;
  color: string;
  label?: string;
  price: number;
  x1: number;
  x2: number;
  y: number;
}
/** The label rows of a Fibonacci tool's levels, prices with the instrument's decimals. */
function levelEntries(lines: LevelLine[] | null) {
  if (!lines) return null;
  return lines.map((l) => ({
    color: l.color,
    label: l.label,
    x1: l.x1,
    y1: l.y,
    x2: l.x2,
    y2: l.y,
    numberText: `${l.ratio} (${levelPrice(l.price)})`,
    numberX: l.x1 + 4,
    numberY: l.y - 7,
    numberAlign: "left",
    labelX: (l.x1 + l.x2) / 2,
    labelY: l.y - 7,
  }));
}

function fixFibRetracement(api: RegistryApi) {
  const meta = api.getDrawingType("fibretracement");
  if (!meta || (meta as unknown as Record<symbol, boolean>)[FIXED]) return;
  const Base = meta.create({ paneId: "price" }).constructor as FibClass;
  class TradingViewRetracement extends Base {
    /** Measure from the first point (TradingView's Reverse); saved drawings may set it. */
    declare reverse?: boolean;
    levelLines(proj: PixelProjector) {
      const [a, b] = this.anchors;
      if (!a || !b) return null;
      const xa = proj.xOf(a.time);
      const xb = proj.xOf(b.time);
      const x1 = Math.min(xa, xb);
      const x2 = Math.max(xa, xb);
      const out = [];
      for (const level of this.levels) {
        if (!level.enabled) continue;
        const price = retracementPrice(a, b, level.ratio, this.reverse === true);
        const y = proj.yOf(price, this.paneId);
        if (y == null) continue;
        out.push({ ratio: level.ratio, color: level.color, label: level.label, price, x1, x2, y });
      }
      return out;
    }
    entryLines(proj: PixelProjector) {
      return levelEntries(this.levelLines(proj));
    }
    priceRange() {
      const [a, b] = this.anchors;
      if (!a || !b) return null;
      const prices = this.levels
        .filter((level) => level.enabled)
        .map((level) => retracementPrice(a, b, level.ratio, this.reverse === true));
      return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
    }
    readProps(props: Record<string, unknown>) {
      super.readProps(props);
      if (typeof props[REVERSE_PROP] === "boolean") this.reverse = props[REVERSE_PROP];
    }
    writeProps() {
      return { ...super.writeProps(), [REVERSE_PROP]: this.reverse === true };
    }
    schema() {
      const base = super.schema();
      return {
        ...base,
        fields: [
          ...base.fields,
          { path: REVERSE_PROP, label: "Reverse", kind: "boolean", group: "behavior" },
        ],
      };
    }
  }
  api.registerDrawingType({
    ...meta,
    create: (init) => new TradingViewRetracement(init) as unknown as Drawing,
    [FIXED]: true,
  } as DrawingTypeMeta);
}

// ── Price labels with the instrument's decimals ──

interface EntryRow {
  numberText?: string;
  [key: string]: unknown;
}
interface LabelledFib {
  anchors: Anchor[];
  entryLines(proj: unknown): EntryRow[] | null;
  levelLines?(proj: unknown): LevelLine[] | null;
}
interface PositionInstance {
  showPrices?: boolean;
  prices(): { entry: number; stop: number; target: number } | null;
  rewardPct(): number;
  riskPct(): number;
}

function fixFibLabels(api: RegistryApi, type: string) {
  const meta = api.getDrawingType(type);
  if (!meta || (meta as unknown as Record<symbol, boolean>)[FIXED]) return;
  const Base = meta.create({ paneId: "price" }).constructor as new (
    init: DrawingInit,
  ) => LabelledFib;
  class Labelled extends Base {
    entryLines(proj: unknown) {
      if (typeof this.levelLines === "function") return levelEntries(this.levelLines(proj));
      // The trend-based extension builds its rows directly: re-price them from the ratio.
      const rows = super.entryLines(proj);
      const [a, b, c] = this.anchors;
      if (!rows || !a || !b || !c) return rows;
      return rows.map((row) => {
        const ratio = Number(row.numberText?.split(" (")[0]);
        return Number.isFinite(ratio)
          ? {
              ...row,
              numberText: `${ratio} (${levelPrice(c.price + ratio * (b.price - a.price))})`,
            }
          : row;
      });
    }
  }
  api.registerDrawingType({
    ...meta,
    create: (init) => new Labelled(init) as unknown as Drawing,
    [FIXED]: true,
  } as DrawingTypeMeta);
}

function fixPositionLabels(api: RegistryApi, type: string) {
  const meta = api.getDrawingType(type);
  if (!meta || (meta as unknown as Record<symbol, boolean>)[FIXED]) return;
  const Base = meta.create({ paneId: "price" }).constructor as new (
    init: DrawingInit,
  ) => PositionInstance;
  if (typeof Base.prototype.prices !== "function") return;
  class Labelled extends Base {
    targetLabel() {
      const p = this.prices();
      const at = this.showPrices && p ? `  @ ${levelPrice(p.target)}` : "";
      return `Target +${this.rewardPct().toFixed(2)}%${at}`;
    }
    stopLabel() {
      const p = this.prices();
      const at = this.showPrices && p ? `  @ ${levelPrice(p.stop)}` : "";
      return `Stop \u2212${this.riskPct().toFixed(2)}%${at}`;
    }
  }
  api.registerDrawingType({
    ...meta,
    create: (init) => new Labelled(init) as unknown as Drawing,
    [FIXED]: true,
  } as DrawingTypeMeta);
}

interface RangeInstance {
  anchors: Anchor[];
}
interface BarCounter {
  barsBetween?(t1: number, t2: number): number;
}

function fixRangeLabels(api: RegistryApi, type: string) {
  const meta = api.getDrawingType(type);
  if (!meta || (meta as unknown as Record<symbol, boolean>)[FIXED]) return;
  const Base = meta.create({ paneId: "price" }).constructor as new (
    init: DrawingInit,
  ) => RangeInstance;
  if (typeof (Base.prototype as { priceLabel?: unknown }).priceLabel !== "function") return;
  class Labelled extends Base {
    /** `Δprice (Δ%)`, the change in the instrument's decimals. */
    priceLabel() {
      const [a, b] = this.anchors;
      if (!a || !b) return "";
      const delta = b.price - a.price;
      const percent = a.price !== 0 ? (delta / a.price) * 100 : 0;
      return `${signedPrice(delta, a.price)} (${percent >= 0 ? "+" : ""}${percent.toFixed(2)}%)`;
    }
    /** `N bars, duration`: negative bars when measured back in time. */
    timeLabel(proj: BarCounter) {
      const [a, b] = this.anchors;
      if (!a || !b) return "";
      const span = formatSpan(b.time - a.time);
      if (!proj.barsBetween) return span;
      const bars = Math.round(proj.barsBetween(a.time, b.time)) * (b.time < a.time ? -1 : 1);
      return `${bars} bars, ${span}`;
    }
  }
  api.registerDrawingType({
    ...meta,
    create: (init) => new Labelled(init) as unknown as Drawing,
    [FIXED]: true,
  } as DrawingTypeMeta);
}

/** Replace the drawing computations; run before a chart is created, safe to repeat. */
export function applyCalculationFixes(api: RegistryApi): void {
  fixRangeLabels(api, "datepricerange");
  fixFixedRange(api);
  fixAnchoredVwap(api);
  fixFibRetracement(api);
  fixFibLabels(api, "fibextension");
  fixFibLabels(api, "fibextensiontrend");
  fixPositionLabels(api, "position");
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
  /** `chart.renderer` is a control wrapping the active renderer. */
  renderer?: RendererLike;
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
  const control = renderer as RendererLike | null;
  const r = control?.vpvrRenderer ? control : control?.renderer;
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

// ── Native VWAP: sessions in the market's time zone ──

interface NativeInput {
  key: string;
  title: string;
  type: string;
  defval: unknown;
  options?: readonly string[];
  tooltip?: string;
  [key: string]: unknown;
}
interface ClassicSpec {
  inputs: NativeInput[];
  compute(bars: ProfileBar[], inputs: Record<string, unknown>): unknown;
  [key: string]: unknown;
}
interface NativeDescriptor {
  type: string;
  inputsSchema(): NativeInput[];
  defaultInputs(): Record<string, unknown>;
  create(): unknown;
  [key: string | symbol]: unknown;
}
type NativeApi = {
  getNativeIndicator?(type: string): NativeDescriptor | undefined;
  registerNativeIndicator?(descriptor: NativeDescriptor): void;
};

const HOUR = 3_600_000;
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();
const offsets = new Map<string, number>();

/** How far `zone`'s wall clock is ahead of UTC at `time`, in ms (cached per hour). */
function zoneOffset(time: number, zone: string): number {
  const key = `${zone}|${Math.floor(time / HOUR)}`;
  const hit = offsets.get(key);
  if (hit !== undefined) return hit;
  let f = zoneFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    zoneFormatters.set(zone, f);
  }
  const at = Math.floor(time / HOUR) * HOUR;
  const p = Object.fromEntries(f.formatToParts(at).map((part) => [part.type, part.value]));
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!);
  const offset = wall - at;
  if (offsets.size > 100_000) offsets.clear();
  offsets.set(key, offset);
  return offset;
}

/**
 * Candles with their times moved to the session zone's wall clock, so periods counted in
 * UTC (Vela's) fall on the zone's midnights, weeks and months. Forex days start at 17:00 New
 * York, seven hours before its midnight.
 */
export function inSessionZone<T extends { time: number }>(
  bars: readonly T[],
  session: unknown,
): T[] {
  if (
    typeof session !== "string" ||
    session === "UTC" ||
    !VWAP_SESSION_ZONES.includes(session as never)
  )
    return bars as T[];
  const forex = session === FOREX_SESSION;
  const zone = forex ? "America/New_York" : session;
  const shift = forex ? 7 * HOUR : 0;
  return bars.map((bar) => ({ ...bar, time: bar.time + zoneOffset(bar.time, zone) + shift }));
}

/**
 * Give Vela's native VWAP a session time zone (UTC by default, TradingView's for crypto).
 * Vela registers its natives again whenever a chart is created, so run this after each
 * `new Vela(...)`.
 */
export function patchNativeVwap(vela: unknown): boolean {
  const api = vela as NativeApi;
  const descriptor = api.getNativeIndicator?.("vwap");
  if (!descriptor || descriptor[FIXED] || !api.registerNativeIndicator) return false;
  const sample = descriptor.create() as { spec?: ClassicSpec } | null;
  const spec = sample?.spec;
  if (!spec || typeof spec.compute !== "function" || !Array.isArray(spec.inputs)) return false;
  const Classic = (sample as object).constructor as new (spec: ClassicSpec) => unknown;
  const session: NativeInput = {
    key: "session",
    title: "Session time zone",
    type: "string",
    defval: "UTC",
    options: VWAP_SESSION_ZONES,
    tooltip:
      "Where each day starts: UTC for crypto, the exchange's time zone for stocks, 17:00 New York for forex",
  };
  const inputs: NativeInput[] = [];
  for (const input of spec.inputs) {
    inputs.push(
      input.key === "anchor"
        ? { ...input, tooltip: "Where the accumulation resets, in the session time zone" }
        : input,
    );
    if (input.key === "anchor") inputs.push(session);
  }
  if (!inputs.includes(session)) inputs.push(session);
  const fixed: ClassicSpec = {
    ...spec,
    inputs,
    compute: (bars, values) => spec.compute(inSessionZone(bars, values.session), values),
  };
  api.registerNativeIndicator({
    ...descriptor,
    inputsSchema: () => inputs,
    defaultInputs: () => ({ ...descriptor.defaultInputs(), session: "UTC" }),
    create: () => new Classic(fixed),
    [FIXED]: true,
  });
  return true;
}
