import type {
  Background,
  DrawingBox,
  DrawingLabel,
  DrawingLine,
  DrawingPolyline,
  Fill,
  IndicatorModel,
  InputSchema,
  InputValue,
  MarkerPoint,
  OHLCV,
  SeriesSpec,
} from "@luxalgo/vela";
import { VELA_TIMEFRAME } from "./chart-analysis";
import { tr } from "./i18n";
import { resolutionForTimeframe } from "./live-market";
import { RESOLUTIONS, type Resolution } from "./market-data";

/**
 * An indicator computed on another candle size, as TradingView's "Timeframe" setting does:
 * the script runs on the higher candles and each chart candle shows the value of the higher
 * candle it belongs to. With "Wait for timeframe closes" (the default) a chart candle shows
 * the last higher candle that had closed by its own close, so history never repaints.
 *
 * Pure helpers; `timeframe-engine.ts` runs the scripts.
 */

/** Input keys (an `@` keeps them apart from any script's own input ids). */
export const TIMEFRAME_INPUT = "@timeframe";
export const GAPS_INPUT = "@timeframe_gaps";

/** "Chart" keeps the chart's own candles. */
export const CHART_TIMEFRAME = "Chart";

/** The candle sizes the journal's sources serve, as the dialog lists them. */
export const TIMEFRAME_CHOICES: Readonly<Record<string, Resolution>> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "1D": "1d",
  "1W": "1w",
};

/**
 * A Pine timeframe string (`"D"`, `"1D"`, `"240"`, `"60"`, `"W"`) or a choice label (`"4h"`)
 * as a candle size; null for "the chart's" or one the journal cannot load.
 */
export function timeframeResolution(value: unknown): Resolution | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === CHART_TIMEFRAME) return null;
  if (Object.hasOwn(TIMEFRAME_CHOICES, text)) return TIMEFRAME_CHOICES[text]!;
  const pine = text.toUpperCase();
  if (pine === "D" || pine === "1D") return "1d";
  if (pine === "W" || pine === "1W") return "1w";
  if (/^\d+$/.test(pine)) return resolutionForTimeframe(String(Number(pine)));
  return null;
}

/** The dialog's label for a candle size. */
export const choiceFor = (resolution: Resolution): string =>
  Object.entries(TIMEFRAME_CHOICES).find(([, r]) => r === resolution)?.[0] ?? CHART_TIMEFRAME;

/**
 * The timeframe a script declares in `indicator(..., timeframe="D", timeframe_gaps=false)`,
 * which becomes the setting's default (as on TradingView).
 */
export function declaredTimeframe(source: string): { timeframe: string; gaps: boolean } {
  const declaration = /^\s*indicator\s*\(([\s\S]*?)\)\s*$/m.exec(source)?.[1] ?? "";
  const tf = /\btimeframe\s*=\s*(["'])(.*?)\1/.exec(declaration)?.[2];
  const resolution = timeframeResolution(tf);
  const gaps = /\btimeframe_gaps\s*=\s*(true|false)\b/.exec(declaration)?.[1];
  return {
    timeframe: resolution ? choiceFor(resolution) : CHART_TIMEFRAME,
    gaps: gaps !== "false",
  };
}

/** Strategies keep the chart's candles (their fills belong to it), as do viewport scripts. */
export const offersTimeframe = (source: string, reactsToViewport: boolean): boolean =>
  !reactsToViewport && !/^\s*strategy\s*\(/m.test(source);

/** The two settings, appended to a script's inputs. */
export function timeframeInputs(source: string): InputSchema[] {
  const declared = declaredTimeframe(source);
  const choices = [CHART_TIMEFRAME, ...Object.keys(TIMEFRAME_CHOICES)];
  return [
    {
      key: TIMEFRAME_INPUT,
      title: tr("Timeframe"),
      type: "string",
      defval: declared.timeframe,
      options: choices,
      tooltip: tr(
        "Compute the indicator on these candles. Each chart candle shows the value of the larger candle it belongs to.",
      ),
    },
    {
      key: GAPS_INPUT,
      title: tr("Wait for timeframe closes"),
      type: "bool",
      defval: declared.gaps,
      when: { key: TIMEFRAME_INPUT, anyOf: Object.keys(TIMEFRAME_CHOICES) },
      tooltip: tr(
        "On: a value appears once its candle has closed, so history never changes. Off: the forming candle's value shows and changes until it closes.",
      ),
    },
  ];
}

/** The timeframe settings apart from the script's own inputs. */
export function splitInputs(inputs: Record<string, InputValue> | undefined): {
  script: Record<string, InputValue>;
  timeframe: string;
  gaps: boolean | undefined;
} {
  const { [TIMEFRAME_INPUT]: tf, [GAPS_INPUT]: gaps, ...script } = inputs ?? {};
  return {
    script,
    timeframe: typeof tf === "string" ? tf : CHART_TIMEFRAME,
    gaps: typeof gaps === "boolean" ? gaps : undefined,
  };
}

/** The candle size to compute on: only one larger than the chart's, else none (the chart's). */
export function effectiveResolution(choice: string, chartTimeframe: string): Resolution | null {
  const target = timeframeResolution(choice);
  const chart = resolutionForTimeframe(chartTimeframe);
  if (!target || !chart) return null;
  return RESOLUTIONS[target] > RESOLUTIONS[chart] ? target : null;
}

export const velaTimeframe = (resolution: Resolution) => VELA_TIMEFRAME[resolution];

/** Higher candles to load: the chart's span plus room for long averages to settle. */
export const WARMUP_BARS = 500;
export const MAX_HIGHER_BARS = 5000;
export function higherBarsNeeded(chartFrom: number, now: number, resolution: Resolution): number {
  const span = Math.max(0, Math.ceil((now - chartFrom) / RESOLUTIONS[resolution]));
  return Math.min(MAX_HIGHER_BARS, span + WARMUP_BARS);
}

/**
 * Which higher candle each chart candle shows (an index into `higher`, or -1 for none):
 * - waiting for closes: the last higher candle closed by the chart candle's close;
 * - otherwise: the higher candle the chart candle opens in.
 * A candle closes at the next one's open or after its full length, whichever is first.
 */
export function alignment(
  chart: readonly { time: number }[],
  higher: readonly { time: number }[],
  chartMs: number,
  higherMs: number,
  waitForClose: boolean,
): number[] {
  const out: number[] = [];
  let j = -1;
  for (let i = 0; i < chart.length; i++) {
    const open = chart[i]!.time;
    const close = Math.min(chart[i + 1]?.time ?? Infinity, open + chartMs);
    if (waitForClose) {
      const closed = (k: number) =>
        Math.min(higher[k + 1]?.time ?? Infinity, higher[k]!.time + higherMs) <= close;
      while (j + 1 < higher.length && closed(j + 1)) j++;
    } else {
      while (j + 1 < higher.length && higher[j + 1]!.time <= open) j++;
    }
    out.push(j);
  }
  return out;
}

/** The chart candle where each higher candle first shows (undefined: never on the chart). */
export function firstShown(align: readonly number[], higherCount: number): (number | undefined)[] {
  const first: (number | undefined)[] = new Array(higherCount).fill(undefined);
  for (let i = 0; i < align.length; i++) {
    const j = align[i]!;
    if (j >= 0 && first[j] === undefined) first[j] = i;
  }
  return first;
}

/** Index of the higher candle containing `time` (-1 before the first). */
function higherIndexOf(higher: readonly { time: number }[], time: number): number {
  let lo = 0;
  let hi = higher.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (higher[mid]!.time <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export interface Projection {
  chart: readonly OHLCV[];
  higher: readonly OHLCV[];
  chartMs: number;
  higherMs: number;
  waitForClose: boolean;
  /** Shown after the title in the legend, such as "1D". */
  label: string;
}

/**
 * The indicator computed on the higher candles, as the chart's candles show it: one value
 * per chart candle for plots and fills, markers and drawings where their candle first shows.
 */
export function projectModel(model: IndicatorModel, p: Projection): IndicatorModel {
  const { chart, higher } = p;
  const align = alignment(chart, higher, p.chartMs, p.higherMs, p.waitForClose);
  const first = firstShown(align, higher.length);
  /** Index-aligned payloads count from the model's first bar. */
  const base = model.anchorTime != null ? Math.max(0, higherIndexOf(higher, model.anchorTime)) : 0;
  const chartTime = (i: number | undefined) => (i === undefined ? undefined : chart[i]!.time);
  /** Where something at a higher time appears on the chart. */
  const shownAt = (time: number) => {
    const j = higherIndexOf(higher, time);
    return j < 0 ? undefined : chartTime(first[j]);
  };
  const lastClose = chart.length ? chart.at(-1)!.time + p.chartMs : 0;

  const series = model.series.map((spec): SeriesSpec => {
    if (spec.kind === "markers") {
      const markers: MarkerPoint[] = [];
      for (const marker of spec.markers) {
        const time = shownAt(marker.time);
        if (time !== undefined) markers.push({ ...marker, time });
      }
      return { ...spec, markers };
    }
    if (!("points" in spec)) {
      const at = (i: number) => (align[i]! >= base ? align[i]! - base : -1);
      return {
        ...spec,
        bars: chart.map((bar, i) => {
          const source = spec.bars[at(i)];
          return source
            ? { ...source, time: bar.time }
            : { time: bar.time, open: NaN, high: NaN, low: NaN, close: NaN };
        }),
        ...(spec.barColors
          ? { barColors: chart.map((_, i) => spec.barColors![at(i)] ?? null) }
          : {}),
      };
    }
    const byTime = new Map(spec.points.map((point) => [point.time, point]));
    return {
      ...spec,
      points: chart.map((bar, i) => {
        const source = align[i]! >= 0 ? byTime.get(higher[align[i]!]!.time) : undefined;
        return source ? { ...source, time: bar.time } : { time: bar.time, value: null as null };
      }),
    };
  });

  const fills = model.fills.map((fill): Fill => {
    const at = (i: number) => (align[i]! >= base ? align[i]! - base : -1);
    return {
      ...fill,
      ...(fill.colors ? { colors: chart.map((_, i) => fill.colors![at(i)] ?? null) } : {}),
      ...(fill.gradient ? { gradient: chart.map((_, i) => fill.gradient![at(i)] ?? null) } : {}),
    };
  });

  const backgrounds: Background[] = [];
  for (const bg of model.backgrounds) {
    const from = shownAt(bg.from);
    if (from === undefined) continue;
    const next = higherIndexOf(higher, bg.to - 1) + 1;
    const to = next < higher.length ? (chartTime(first[next]) ?? lastClose) : lastClose;
    if (to > from) backgrounds.push({ ...bg, from, to });
  }

  /** A drawing's x on the chart: its candle's first chart candle; ahead of the data, kept. */
  const newest = higher.at(-1);
  const x = (value: number, xloc: "bar_index" | "bar_time"): number => {
    if (xloc === "bar_time") {
      if (newest && value >= newest.time + p.higherMs) return value;
      const index = higherIndexOf(higher, value);
      return index < 0 ? value : (chartTime(first[index]) ?? lastClose);
    }
    const index = base + value;
    if (index >= 0 && index < higher.length) return chartTime(first[index]) ?? lastClose;
    // Ahead of (or before) the loaded candles: at its own time, one candle length apart.
    return (newest?.time ?? 0) + (index - higher.length + 1) * p.higherMs;
  };
  const lines = model.lines?.map((line): DrawingLine => ({
    ...line,
    x1: x(line.x1, line.xloc),
    x2: x(line.x2, line.xloc),
    xloc: "bar_time",
  }));
  const boxes = model.boxes?.map((box): DrawingBox => ({
    ...box,
    left: x(box.left, box.xloc),
    right: x(box.right, box.xloc),
    xloc: "bar_time",
  }));
  const labels = model.labels?.map((label): DrawingLabel => ({
    ...label,
    x: x(label.x, label.xloc),
    xloc: "bar_time",
  }));
  const polylines = model.polylines?.map((polyline): DrawingPolyline => ({
    ...polyline,
    points: polyline.points.map((point) => ({
      ...point,
      x: x(point.x, point.xloc),
      xloc: "bar_time",
    })),
  }));

  let barColors = model.barColors;
  if (barColors?.length) {
    const colorOf = new Map(barColors.map((c) => [c.time, c.color]));
    barColors = [];
    for (let i = 0; i < chart.length; i++) {
      const color = align[i]! >= 0 ? colorOf.get(higher[align[i]!]!.time) : undefined;
      if (color) barColors.push({ time: chart[i]!.time, color });
    }
  }

  return {
    ...model,
    shorttitle: `${model.shorttitle ?? model.title} ${p.label}`,
    ...(chart.length ? { anchorTime: chart[0]!.time } : {}),
    series,
    fills,
    backgrounds,
    ...(lines ? { lines } : {}),
    ...(boxes ? { boxes } : {}),
    ...(labels ? { labels } : {}),
    ...(polylines ? { polylines } : {}),
    ...(barColors ? { barColors } : {}),
  };
}

/** The model with the timeframe settings shown and filled in. */
export function withTimeframeInputs(
  model: IndicatorModel,
  schema: readonly InputSchema[],
  values: { timeframe: string; gaps: boolean },
): IndicatorModel {
  const own = new Set(schema.map((input) => input.key));
  return {
    ...model,
    inputs: [...model.inputs.filter((input) => !own.has(input.key)), ...schema],
    inputValues: {
      ...model.inputValues,
      [TIMEFRAME_INPUT]: values.timeframe,
      [GAPS_INPUT]: values.gaps,
    },
  };
}

/**
 * The forming higher candle brought up to the chart's latest candles (they are newer than
 * the last load). Closed candles stay as the source gave them.
 */
export function withFormingCandle(
  higher: readonly OHLCV[],
  chart: readonly OHLCV[],
  higherMs: number,
): OHLCV[] {
  const last = higher.at(-1);
  if (!last) return [...higher];
  const end = last.time + higherMs;
  let { high, low, close } = last;
  let changed = false;
  for (let i = chart.length - 1; i >= 0; i--) {
    const bar = chart[i]!;
    if (bar.time < last.time) break;
    if (bar.time >= end) continue;
    if (!changed) close = bar.close;
    changed = true;
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
  }
  return changed && (high !== last.high || low !== last.low || close !== last.close)
    ? [...higher.slice(0, -1), { ...last, high, low, close }]
    : [...higher];
}
