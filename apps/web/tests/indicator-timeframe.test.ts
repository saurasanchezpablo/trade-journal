import { describe, expect, it, vi } from "vitest";
import type {
  ExecutionHandlers,
  ExecutionRequest,
  ExecutionSession,
  IndicatorModel,
  OHLCV,
  PreparedScript,
  ScriptingEngine,
} from "@luxalgo/vela";
import {
  alignment,
  declaredTimeframe,
  effectiveResolution,
  GAPS_INPUT,
  offersTimeframe,
  projectModel,
  TIMEFRAME_INPUT,
  timeframeResolution,
  withFormingCandle,
} from "../src/lib/indicator-timeframe";
import { TimeframePineEngine } from "../src/lib/timeframe-engine";

const H = 3_600_000;
const D = 24 * H;
const T0 = Date.parse("2026-10-05T00:00:00Z");
const bar = (time: number, close = 100): OHLCV => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 10,
});
/** Two days of 4h candles and their two daily candles. */
const fourHours = Array.from({ length: 12 }, (_, i) => bar(T0 + i * 4 * H, 100 + i));
const days = [bar(T0, 1), bar(T0 + D, 2)];

const model = (overrides: Partial<IndicatorModel> = {}): IndicatorModel => ({
  id: "ind",
  title: "EMA 20",
  overlay: true,
  paneHint: "price",
  anchorTime: T0,
  series: [
    {
      id: "ema",
      title: "EMA",
      paneId: "price",
      kind: "line",
      points: [
        { time: T0, value: 10 },
        { time: T0 + D, value: 20 },
      ],
      style: { color: "#f00", width: 1, lineStyle: "solid" },
    },
  ],
  fills: [],
  backgrounds: [],
  priceLines: [],
  inputs: [],
  inputValues: {},
  ...overrides,
});
const project = (m: IndicatorModel, waitForClose: boolean) =>
  projectModel(m, {
    chart: fourHours,
    higher: days,
    chartMs: 4 * H,
    higherMs: D,
    waitForClose,
    label: "1D",
  });

describe("an indicator's timeframe setting", () => {
  it("reads TradingView's timeframe strings as the journal's candle sizes", () => {
    expect(timeframeResolution("D")).toBe("1d");
    expect(timeframeResolution("1D")).toBe("1d");
    expect(timeframeResolution("240")).toBe("4h");
    expect(timeframeResolution("60")).toBe("1h");
    expect(timeframeResolution("W")).toBe("1w");
    expect(timeframeResolution("4h")).toBe("4h");
    expect(timeframeResolution("Chart")).toBeNull();
    expect(timeframeResolution("")).toBeNull();
    // A size no source serves stays on the chart's candles.
    expect(timeframeResolution("45")).toBeNull();
    expect(timeframeResolution("M")).toBeNull();
  });

  it("starts from the timeframe a script declares, as on TradingView", () => {
    expect(
      declaredTimeframe(
        `//@version=5\nindicator("Daily EMA", overlay=true, timeframe="D", timeframe_gaps=false)\nplot(ta.ema(close, 20))`,
      ),
    ).toEqual({ timeframe: "1D", gaps: false });
    expect(declaredTimeframe(`indicator("EMA")\nplot(close)`)).toEqual({
      timeframe: "Chart",
      gaps: true,
    });
  });

  it("is offered on indicators but not on strategies or scripts that follow the view", () => {
    expect(offersTimeframe(`indicator("EMA")`, false)).toBe(true);
    expect(offersTimeframe(`strategy("Cross")`, false)).toBe(false);
    expect(offersTimeframe(`indicator("Visible range")`, true)).toBe(false);
  });

  it("computes on another size only when it is larger than the chart's", () => {
    expect(effectiveResolution("1D", "240")).toBe("1d");
    expect(effectiveResolution("4h", "240")).toBeNull();
    expect(effectiveResolution("1h", "240")).toBeNull();
    expect(effectiveResolution("Chart", "240")).toBeNull();
  });
});

describe("a daily indicator on a 4h chart", () => {
  it("waiting for closes, shows a day's value from the candle that closes it, so history never repaints", () => {
    expect(alignment(fourHours, days, 4 * H, D, true)).toEqual([
      -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 1,
    ]);
    const points = (project(model(), true).series[0] as { points: { value: number | null }[] })
      .points;
    expect(points.map((p) => p.value)).toEqual([
      null,
      null,
      null,
      null,
      null,
      10,
      10,
      10,
      10,
      10,
      10,
      20,
    ]);
  });

  it("not waiting, shows the day each candle belongs to", () => {
    expect(alignment(fourHours, days, 4 * H, D, false)).toEqual([
      0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("gives every chart candle one point, aligned from the chart's first candle", () => {
    const projected = project(model(), false);
    const points = (projected.series[0] as { points: { time: number }[] }).points;
    expect(points.map((p) => p.time)).toEqual(fourHours.map((b) => b.time));
    expect(projected.anchorTime).toBe(T0);
    expect(projected.shorttitle).toBe("EMA 20 1D");
  });

  it("puts a day's marker, background and drawing where that day's value first shows", () => {
    const projected = project(
      model({
        series: [
          {
            id: "signal",
            title: "Signal",
            paneId: "price",
            kind: "markers",
            markers: [{ time: T0, position: "aboveBar", shape: "circle", color: "#0f0" }],
          },
        ],
        backgrounds: [{ id: "bg", paneId: "price", from: T0, to: T0 + D, color: "#00f" }],
        labels: [
          {
            id: "l",
            paneId: "price",
            xloc: "bar_index",
            x: 1,
            y: 5,
            yloc: "price",
            style: "label_down",
            size: "normal",
            textAlign: "center",
            fontFamily: "default",
          },
        ],
      }),
      true,
    );
    const markers = (projected.series[0] as { markers: { time: number }[] }).markers;
    expect(markers.map((m) => m.time)).toEqual([fourHours[5]!.time]);
    expect(projected.backgrounds).toEqual([
      expect.objectContaining({ from: fourHours[5]!.time, to: fourHours[11]!.time }),
    ]);
    expect(projected.labels?.[0]).toEqual(
      expect.objectContaining({ xloc: "bar_time", x: fourHours[11]!.time }),
    );
  });

  it("brings the forming day up to the chart's newest candles", () => {
    const chart = [...fourHours, bar(T0 + 2 * D, 50), bar(T0 + 2 * D + 4 * H, 60)];
    const higher = [...days, { ...bar(T0 + 2 * D, 50), high: 51, low: 49, close: 50 }];
    const next = withFormingCandle(higher, chart, D);
    expect(next.at(-1)).toEqual(expect.objectContaining({ close: 60, high: 61, low: 49 }));
    expect(next.slice(0, 2)).toEqual(days);
  });
});

/** A Pine engine that records what it is asked to run and answers one model per run. */
function fakeEngine() {
  const runs: ExecutionRequest[] = [];
  const updates: unknown[] = [];
  let handlers: ExecutionHandlers | null = null;
  const engine: ScriptingEngine = {
    language: "pine",
    capabilities: { streaming: true, visibleRange: true, inputs: true, props: true },
    prepare: async (source, id) =>
      ({
        language: "pine",
        inputs: [{ key: "len", title: "Length", type: "int", defval: 20 }],
        meta: { title: "EMA", overlay: true },
        reactsToViewport: false,
        token: { source, id },
      }) as PreparedScript,
    execute: (req, h) => {
      runs.push(req);
      handlers = h;
      const session: ExecutionSession = {
        stop: vi.fn(),
        update: (inputs) => updates.push(inputs),
        setVisibleRange: vi.fn(),
        notifyBars: vi.fn(),
      };
      return session;
    },
  };
  return { engine, runs, updates, answer: (m: IndicatorModel) => handlers!.onModel(m) };
}

const request = (
  prepared: PreparedScript,
  inputs: Record<string, string | number | boolean>,
  fetchSeries = vi.fn(async () => days),
): ExecutionRequest => ({
  prepared,
  market: { symbol: "binance:BTCUSDT", timeframe: "240" },
  bars: fourHours,
  getBars: () => fourHours,
  fetchSeries,
  inputs,
  mode: "live",
});

describe("the timeframe engine", () => {
  it("adds the two settings to an indicator and keeps them out of the script's inputs", async () => {
    const fake = fakeEngine();
    const engine = new TimeframePineEngine(fake.engine);
    const prepared = await engine.prepare(`indicator("EMA")\nplot(close)`, "a");
    expect(prepared.inputs.map((i) => i.key)).toEqual(["len", TIMEFRAME_INPUT, GAPS_INPUT]);
    const onModel = vi.fn();
    engine.execute(request(prepared, { len: 20, [TIMEFRAME_INPUT]: "Chart" }), { onModel });
    expect(fake.runs[0]!.inputs).toEqual({ len: 20 });
    expect(fake.runs[0]!.market.timeframe).toBe("240");
    fake.answer(model());
    expect(onModel.mock.calls[0]![0].inputValues).toEqual(
      expect.objectContaining({ [TIMEFRAME_INPUT]: "Chart", [GAPS_INPUT]: true }),
    );
  });

  it("runs the script on the chosen larger candles and shows it on the chart's", async () => {
    const fake = fakeEngine();
    const engine = new TimeframePineEngine(fake.engine);
    const prepared = await engine.prepare(`indicator("EMA")\nplot(close)`, "a");
    const fetchSeries = vi.fn(async () => days);
    const onModel = vi.fn();
    const session = engine.execute(
      request(prepared, { len: 20, [TIMEFRAME_INPUT]: "1D" }, fetchSeries),
      { onModel },
    );
    await vi.waitFor(() => expect(fake.runs).toHaveLength(1));
    expect(fetchSeries).toHaveBeenCalledWith(
      "binance:BTCUSDT",
      "1D",
      expect.objectContaining({ limit: expect.any(Number) }),
    );
    const run = fake.runs[0]!;
    expect(run.market.timeframe).toBe("1D");
    expect(run.mode).toBe("static");
    // The closed day as loaded; the forming day brought up to the chart's newest 4h candle.
    const higher = run.getBars!();
    expect(higher.map((b) => b.time)).toEqual(days.map((b) => b.time));
    expect(higher[0]).toEqual(days[0]);
    expect(higher[1]!.close).toBe(fourHours.at(-1)!.close);
    expect(run.inputs).toEqual({ len: 20 });

    fake.answer(model());
    const shown = onModel.mock.calls.at(-1)![0] as IndicatorModel;
    expect((shown.series[0] as { points: unknown[] }).points).toHaveLength(fourHours.length);

    // Not waiting for closes only moves values between candles: no new run.
    session.update({ [GAPS_INPUT]: false });
    expect(fake.runs).toHaveLength(1);
    const moved = onModel.mock.calls.at(-1)![0] as IndicatorModel;
    expect((moved.series[0] as { points: { value: number | null }[] }).points[0]!.value).toBe(10);

    // Back to the chart's candles: a fresh run on them.
    session.update({ [TIMEFRAME_INPUT]: "Chart" });
    expect(fake.runs).toHaveLength(2);
    expect(fake.runs[1]!.market.timeframe).toBe("240");
  });

  it("keeps a smaller or equal timeframe on the chart's candles", async () => {
    const fake = fakeEngine();
    const engine = new TimeframePineEngine(fake.engine);
    const prepared = await engine.prepare(`indicator("EMA")\nplot(close)`, "a");
    const fetchSeries = vi.fn(async () => days);
    engine.execute(request(prepared, { [TIMEFRAME_INPUT]: "1h" }, fetchSeries), {
      onModel: vi.fn(),
    });
    expect(fetchSeries).not.toHaveBeenCalled();
    expect(fake.runs[0]!.market.timeframe).toBe("240");
  });

  it("reports when the larger candles cannot be loaded", async () => {
    const fake = fakeEngine();
    const engine = new TimeframePineEngine(fake.engine);
    const prepared = await engine.prepare(`indicator("EMA")\nplot(close)`, "a");
    const onError = vi.fn();
    engine.execute(
      request(
        prepared,
        { [TIMEFRAME_INPUT]: "1W" },
        vi.fn(async () => []),
      ),
      { onModel: vi.fn(), onError },
    );
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]![0].message).toMatch(/No 1W candles/);
    expect(fake.runs).toHaveLength(0);
  });

  it("leaves strategies as they are", async () => {
    const fake = fakeEngine();
    const engine = new TimeframePineEngine(fake.engine);
    const prepared = await engine.prepare(`strategy("Cross")`, "a");
    expect(prepared.inputs.map((i) => i.key)).toEqual(["len"]);
  });
});
