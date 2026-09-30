import { candleRange, clampPriceWindow, maxBarSpacing, type PriceWindow } from "@/lib/chart-zoom";

/** The journal's own overlay indicator (trades, zones, the pending zone) is registered under
 *  a type starting with this; see `chart-overlays.ts`. */
export const JOURNAL_OVERLAYS_TYPE = "journal-overlays-";

type Viewport = { barSpacing: number; rightOffset: number };

interface NativeRendererLike {
  coords?: {
    width: number;
    spacingScale: number;
    visibleLogicalRange(): { from: number; to: number };
  };
  bars?: ReadonlyArray<{ high: number; low: number }>;
  chrome?: object;
  scaleDragHolder?: { kind?: string; manualScale?: PriceWindow | null } | null;
  clampViewport?(barSpacing: number, rightOffset: number): Viewport;
  priceScaleBy?(dyTotal: number): void;
  setManualScale?(holder: object, scale: PriceWindow): void;
  /** `chart.renderer` is a control wrapping the active renderer. */
  renderer?: NativeRendererLike;
}

type ModelLike = { native?: { type?: string } };

interface SceneLike {
  indicators: Map<string, ModelLike>;
}

const PATCHED = Symbol.for("trade-journal.view-limits");

const native = (renderer: unknown): NativeRendererLike | null => {
  const control = renderer as NativeRendererLike | null;
  return control?.coords ? control : (control?.renderer ?? null);
};

const isJournalOverlay = (m: ModelLike) =>
  m.native?.type?.startsWith(JOURNAL_OVERLAYS_TYPE) === true;

/**
 * Zoom stops before a chart slows down (see `lib/chart-zoom.ts`): the time axis at
 * `MIN_VISIBLE_CANDLES` candles or `MAX_CANDLE_PX` a candle, the price axis at
 * `MIN_PRICE_WINDOW` of the candles on screen. And the journal's overlays (zones far above
 * or below, trades) no longer widen the automatic price fit: it fits the candles and
 * indicators, as TradingView leaves drawings out of it. Patches Vela's prototypes once; a
 * renderer without these methods (canvas fallback, a future Vela) is left as it is.
 */
export function limitChartView(renderer: unknown): void {
  const r = native(renderer);
  const proto = r && (Object.getPrototypeOf(r) as NativeRendererLike & Record<symbol, boolean>);
  if (proto && !proto[PATCHED]) {
    const clamp = proto.clampViewport;
    if (typeof clamp === "function") {
      proto.clampViewport = function (this: NativeRendererLike, barSpacing, rightOffset) {
        const view = clamp.call(this, barSpacing, rightOffset);
        const width = this.coords?.width ?? 0;
        if (!(width > 0)) return view;
        const cap = maxBarSpacing(width, this.coords?.spacingScale);
        // Too few candles to fill the chart at the cap: Vela's own floor wins.
        return view.barSpacing > cap ? clamp.call(this, cap, rightOffset) : view;
      };
    }
    const scaleBy = proto.priceScaleBy;
    if (typeof scaleBy === "function") {
      proto.priceScaleBy = function (this: NativeRendererLike, dyTotal) {
        scaleBy.call(this, dyTotal);
        const holder = this.scaleDragHolder;
        const window = holder?.manualScale;
        // Only the price pane: an indicator's own scale has no candles to measure against.
        if (!holder || holder.kind !== "price" || !window || !this.coords || !this.bars) return;
        const range = this.coords.visibleLogicalRange();
        const next = clampPriceWindow(window, candleRange(this.bars, range.from, range.to));
        if (next !== window) this.setManualScale?.(holder, next);
      };
    }
    proto[PATCHED] = true;
  }
  const chrome = r?.chrome;
  const chromeProto =
    chrome &&
    (Object.getPrototypeOf(chrome) as Record<string | symbol, unknown> & {
      paneDrawingsRange?: (models: ModelLike[], scene: SceneLike, ...rest: unknown[]) => unknown;
    });
  const range = chromeProto?.paneDrawingsRange;
  if (!chromeProto || chromeProto[PATCHED] || typeof range !== "function") return;
  chromeProto.paneDrawingsRange = function (
    this: unknown,
    models: ModelLike[],
    scene: SceneLike,
    ...rest: unknown[]
  ) {
    return range.call(
      this,
      models.filter((m) => !isJournalOverlay(m)),
      withoutOverlays(scene),
      ...rest,
    );
  };
  chromeProto[PATCHED] = true;
}

/** The scene as the price fit sees it: every indicator but the journal's overlays. */
function withoutOverlays(scene: SceneLike): SceneLike {
  const all = scene.indicators;
  if (![...all.values()].some(isJournalOverlay)) return scene;
  const kept = new Map([...all].filter(([, m]) => !isJournalOverlay(m)));
  return new Proxy(scene, {
    get(target, prop) {
      if (prop === "indicators") return kept;
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
