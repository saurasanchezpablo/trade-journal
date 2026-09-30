"use client";

import { useEffect, useRef, useState } from "react";
import type { BarRange, DataProvider, IndicatorHandle, OHLCV, Vela } from "@luxalgo/vela";
import { VELA_TIMEFRAME } from "@/lib/chart-analysis";
import { formingBar } from "@/lib/trade-replay";
import { liftDrawingDepth } from "@/lib/drawing-depth";
import { libraryIndicator } from "@/lib/indicator-library";
import { FallbackPineEngine } from "@/lib/pine-fallback-engine";
import { viewBars, viewForming, type ChartLevel, type ChartMark } from "@/lib/backtest-replay";
import type { MarketBar, Resolution } from "@/lib/market-data";
import { randomId } from "@/lib/random-id";
import { keepDrawingsOverSeries } from "../vela-depth-fix";
import { clipOffscreenDashes } from "../vela-dash-fix";
import { limitChartView } from "../vela-view-limits";

/** Forming-candle updates pushed a second, at most. */
const FRAME_MS = 33;

export interface BacktestChartApi {
  /** Draw the revealed candles again (a jump, a new timeframe). */
  redraw(): Promise<void>;
  /** Draw `bar` forming over `durationMs`; true once it is complete, false if stopped. */
  playCandle(bar: MarketBar, durationMs: number): Promise<boolean>;
  /** Stop a candle being drawn. */
  stop(): void;
}

const LEVEL_COLORS: Record<ChartLevel["kind"], string> = {
  entry: "#2962ff",
  stop: "#e53935",
  target: "#1e9e4a",
  order: "#f59e0b",
};

/**
 * The replay backtest's chart: a live chart on a "replay" source that only ever serves the
 * revealed candles (at the chosen timeframe, built from the session's candles). Your drawings
 * and indicators are kept; the position, its stop and target, pending orders and fills are
 * drawn over the candles.
 */
export function BacktestChart({
  symbol,
  view,
  revealed,
  levels,
  marks,
  drawings,
  indicators,
  onDrawings,
  onReady,
}: {
  symbol: string;
  view: Resolution;
  /** The candles revealed so far, at the session's candle size. */
  revealed: () => readonly MarketBar[];
  levels: ChartLevel[];
  marks: ChartMark[];
  drawings: unknown;
  /** Keys of built-in indicators (lib/indicator-library) shown on the chart. */
  indicators: string[];
  onDrawings: (document: unknown) => void;
  onReady: (api: BacktestChartApi | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const props = useRef({ revealed, levels, marks, onDrawings, onReady, view, drawings });
  props.current = { revealed, levels, marks, onDrawings, onReady, view, drawings };
  const chart = useRef<Vela | null>(null);
  const emitOverlays = useRef<(() => void) | null>(null);
  const handles = useRef(new Map<string, IndicatorHandle>());
  const reload = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let disposed = false;
    const teardown: (() => void)[] = [];
    setError("");
    void (async () => {
      const [vela, { PineEngine, PineWorkerEngine }] = await Promise.all([
        import("@luxalgo/vela"),
        import("@luxalgo/vela-pinets"),
      ]);
      if (disposed || !host.current) return;
      const { Vela, registerNativeIndicator, unregisterNativeIndicator } = vela;
      let generation = 0;
      const ticker = () => `replay:${symbol}${generation ? `.${generation}` : ""}`;
      let push: ((bar: OHLCV) => void) | null = null;
      let run = 0;
      let frame = 0;

      const type = `backtest-overlays-${randomId()}`;
      registerNativeIndicator({
        type,
        title: "Backtest",
        paneHint: "price",
        overlay: true,
        legend: false,
        inputsSchema: () => [],
        defaultInputs: () => ({}),
        create: () => ({
          start(ctx) {
            emitOverlays.current = () => {
              const { levels, marks } = props.current;
              const last = props.current.revealed().at(-1)?.time ?? 0;
              ctx.emit({
                lines: levels.map((level) => ({
                  id: `level-${level.id}`,
                  paneId: "price",
                  xloc: "bar_time" as const,
                  x1: level.from,
                  y1: level.price,
                  x2: Math.max(level.from + 1, last),
                  y2: level.price,
                  extend: "right" as const,
                  color: LEVEL_COLORS[level.kind],
                  width: level.kind === "entry" ? 2 : 1,
                  style: level.kind === "order" ? ("dashed" as const) : ("solid" as const),
                  invisible: false,
                  arrowLeft: false,
                  arrowRight: false,
                  overlay: true,
                })),
                labels: [
                  ...levels.map((level) => ({
                    id: `level-label-${level.id}`,
                    paneId: "price",
                    xloc: "bar_time" as const,
                    x: Math.max(level.from, last),
                    y: level.price,
                    yloc: "price" as const,
                    text: `${level.text} ${level.price}`,
                    style: "label_left" as const,
                    color: LEVEL_COLORS[level.kind],
                    textColor: "#ffffff",
                    size: "small" as const,
                    textAlign: "center" as const,
                    fontFamily: "default" as const,
                    overlay: true,
                  })),
                  ...marks.map((mark) => ({
                    id: `mark-${mark.id}`,
                    paneId: "price",
                    xloc: "bar_time" as const,
                    x: mark.time,
                    y: mark.price,
                    yloc: "price" as const,
                    text: mark.text,
                    style:
                      (mark.side === "long") !== mark.exit
                        ? ("label_up" as const)
                        : ("label_down" as const),
                    color: mark.exit ? "#6b7280" : mark.side === "long" ? "#087f23" : "#bd2626",
                    textColor: "#ffffff",
                    size: "small" as const,
                    textAlign: "center" as const,
                    fontFamily: "default" as const,
                    overlay: true,
                  })),
                ],
              });
            };
            emitOverlays.current();
            ctx.setStatus("idle");
          },
          onBars() {},
          onViewport() {},
          setInputs() {},
          suspend() {},
          resume() {},
          stop() {
            emitOverlays.current = null;
          },
        }),
      });
      teardown.push(() => unregisterNativeIndicator(type));

      const feed: DataProvider = {
        info: () => ({
          name: "replay",
          capabilities: { enumerate: false, stream: true, symbolInfo: false },
        }),
        async getBars(_ticker: string, _timeframe: string, range: BarRange) {
          return viewBars(props.current.revealed(), props.current.view).filter(
            (bar) =>
              (range.from == null || bar.time >= range.from) &&
              (range.to == null || bar.time <= range.to),
          );
        },
        subscribe(_ticker: string, _timeframe: string, onBar: (bar: OHLCV) => void) {
          push = onBar;
          return () => {
            if (push === onBar) push = null;
          };
        },
      };
      const dark = () => document.documentElement.classList.contains("dark");
      const instance = new Vela(host.current, {
        symbol: ticker(),
        timeframe: VELA_TIMEFRAME[props.current.view],
        live: true,
        theme: dark() ? "dark" : "light",
        priceStyle: "candles",
        volume: true,
        drawings: true,
        animations: { liveBar: 60 },
      });
      teardown.push(() => instance.destroy());
      instance.data.registerProvider("replay", feed);
      keepDrawingsOverSeries(instance);
      clipOffscreenDashes(instance.renderer);
      limitChartView(instance.renderer);
      const engine = new FallbackPineEngine(
        new PineWorkerEngine({ props: "strategy" }),
        () => new PineEngine({ props: "strategy" }),
      );
      teardown.push(() => engine.terminate());
      instance.registerEngine("pine", engine);
      instance.addNativeIndicator(type);
      const saved = props.current.drawings;
      if (saved && typeof saved === "object")
        try {
          instance.drawings.fromJSON(liftDrawingDepth(saved as never));
        } catch {
          // An unreadable drawings document starts the chart without drawings.
        }
      let drawingTimer: ReturnType<typeof setTimeout> | undefined;
      const drawingsChanged = () => {
        clearTimeout(drawingTimer);
        drawingTimer = setTimeout(() => props.current.onDrawings(instance.drawings.toJSON()), 600);
      };
      for (const event of ["drawing:created", "drawing:edited", "drawing:removed"] as const)
        teardown.push(instance.on(event, drawingsChanged));
      teardown.push(() => {
        clearTimeout(drawingTimer);
      });
      chart.current = instance;

      const stop = () => {
        run += 1;
        cancelAnimationFrame(frame);
      };
      const redraw = async () => {
        stop();
        generation += 1;
        push = null;
        await instance.setMarket({
          symbol: ticker(),
          timeframe: VELA_TIMEFRAME[props.current.view],
        });
        emitOverlays.current?.();
      };
      reload.current = redraw;
      const playCandle = async (bar: MarketBar, durationMs: number) => {
        const token = ++run;
        for (let wait = 0; !push && wait < 60 && token === run && !disposed; wait++)
          await new Promise((resolve) => setTimeout(resolve, 50));
        if (token !== run || disposed || !push) return false;
        return new Promise<boolean>((resolve) => {
          const start = performance.now();
          let pushed = 0;
          const tick = (now: number) => {
            if (token !== run || disposed) return resolve(false);
            const progress = durationMs > 0 ? Math.min(1, (now - start) / durationMs) : 1;
            if (progress >= 1 || now - pushed >= FRAME_MS) {
              const forming = formingBar(bar, progress);
              push?.(viewForming(props.current.revealed(), forming, props.current.view));
              pushed = now;
            }
            if (progress >= 1) return resolve(true);
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        });
      };
      teardown.push(stop);
      props.current.onReady({ redraw, playCandle, stop });
      teardown.push(() => props.current.onReady(null));

      const observer = new MutationObserver(() => instance.setTheme(dark() ? "dark" : "light"));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      teardown.push(() => observer.disconnect());
    })().catch(() => {
      if (!disposed) setError("The backtest chart could not be rendered.");
    });
    return () => {
      disposed = true;
      chart.current = null;
      handles.current.clear();
      reload.current = null;
      for (const undo of teardown.reverse()) undo();
    };
  }, [symbol]);

  // Levels and fills follow the engine.
  useEffect(() => {
    emitOverlays.current?.();
  }, [levels, marks]);

  // A new timeframe draws the revealed candles again at that size.
  useEffect(() => {
    void reload.current?.();
  }, [view]);

  // Indicators on the chart follow the chosen list.
  useEffect(() => {
    const instance = chart.current;
    if (!instance) return;
    const current = handles.current;
    for (const [key, handle] of current)
      if (!indicators.includes(key)) {
        handle.remove();
        current.delete(key);
      }
    for (const key of indicators) {
      if (current.has(key)) continue;
      const item = libraryIndicator(key);
      if (!item) continue;
      try {
        current.set(key, instance.addIndicator(item.source));
      } catch {
        // An indicator that fails to start is left off.
      }
    }
  });

  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div ref={host} className="h-[520px] overflow-hidden rounded-lg border" />
    </>
  );
}
