import type {
  ContextSelect,
  EngineContextSnapshot,
  ExecutionHandlers,
  ExecutionRequest,
  ExecutionSession,
  IndicatorModel,
  InputSchema,
  OHLCV,
  PreparedScript,
  ScriptingEngine,
  VisibleBarRange,
} from "@luxalgo/vela";
import { tr } from "./i18n";
import {
  choiceFor,
  effectiveResolution,
  GAPS_INPUT,
  higherBarsNeeded,
  offersTimeframe,
  projectModel,
  splitInputs,
  timeframeInputs,
  velaTimeframe,
  withFormingCandle,
  withTimeframeInputs,
} from "./indicator-timeframe";
import { resolutionForTimeframe } from "./live-market";
import { RESOLUTIONS, type Resolution } from "./market-data";

type Values = Parameters<ExecutionSession["update"]>[0];

/** Re-runs of a script on a forming higher candle, at most this often. */
const RERUN_MS = 1000;

/**
 * Gives every Pine indicator TradingView's "Timeframe" and "Wait for timeframe closes"
 * settings. With a larger candle size chosen, the script runs on those candles (fetched
 * through the chart's own cache-backed feed, as `request.security` is) and its plots,
 * markers and drawings are placed on the chart's candles (`projectModel`). "Chart" runs it
 * as before. Wraps the journal's Pine engine; strategies and viewport scripts pass through.
 */
export class TimeframePineEngine implements ScriptingEngine {
  readonly language = "pine";
  readonly capabilities: ScriptingEngine["capabilities"];
  /** What the wrapped engine prepared, and the settings added to it. */
  private readonly wrapped = new WeakMap<
    PreparedScript,
    { prepared: PreparedScript; schema: InputSchema[] }
  >();

  constructor(private readonly inner: ScriptingEngine & { terminate?: () => void }) {
    this.capabilities = inner.capabilities;
  }

  /** Ends the wrapped engine's worker (the chart is closing). */
  terminate() {
    this.inner.terminate?.();
  }

  async prepare(source: string, id: string): Promise<PreparedScript> {
    const prepared = await this.inner.prepare(source, id);
    if (!offersTimeframe(source, prepared.reactsToViewport)) return prepared;
    const schema = timeframeInputs(source);
    const own = new Set(schema.map((input) => input.key));
    const result: PreparedScript = {
      ...prepared,
      inputs: [...prepared.inputs.filter((input) => !own.has(input.key)), ...schema],
    };
    this.wrapped.set(result, { prepared, schema });
    return result;
  }

  execute(req: ExecutionRequest, handlers: ExecutionHandlers): ExecutionSession {
    const entry = this.wrapped.get(req.prepared);
    if (!entry) return this.inner.execute(req, handlers);
    return new TimeframeSession(
      this.inner,
      { ...req, prepared: entry.prepared },
      entry.schema,
      handlers,
    );
  }
}

/**
 * One indicator's run. On "Chart" (or a size not above the chart's) it is the wrapped
 * engine's session with the two settings kept out of the script's inputs; otherwise the
 * script runs on the higher candles and every model is projected onto the chart's.
 */
class TimeframeSession implements ExecutionSession {
  private inputs: Values;
  private props: Values | undefined;
  private range: VisibleBarRange | undefined;
  private current: ExecutionSession | null = null;
  private stopped = false;
  /** Bumped on every (re)start: answers for an older run are dropped. */
  private generation = 0;
  private resolution: Resolution | null = null;
  private higher: OHLCV[] = [];
  private model: IndicatorModel | null = null;
  /** The chart candles the last projection used, to skip re-projecting an unchanged view. */
  private projected = "";
  private loading: Promise<boolean> | null = null;
  private rerun: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly engine: ScriptingEngine,
    private readonly req: ExecutionRequest,
    private readonly schema: InputSchema[],
    private readonly handlers: ExecutionHandlers,
  ) {
    this.inputs = { ...req.inputs };
    this.props = req.props;
    this.range = req.visibleRange;
    this.start();
  }

  private settings() {
    const { script, timeframe, gaps } = splitInputs(this.inputs);
    const declared = this.schema.find((input) => input.key === GAPS_INPUT)?.defval;
    return { script, timeframe, gaps: gaps ?? declared !== false };
  }

  private chart(): OHLCV[] {
    return this.req.getBars?.() ?? this.req.bars;
  }

  private chartMs(): number {
    const resolution = resolutionForTimeframe(this.req.market.timeframe);
    return resolution ? RESOLUTIONS[resolution] : 60_000;
  }

  private decorate(model: IndicatorModel): IndicatorModel {
    const { timeframe, gaps } = this.settings();
    return withTimeframeInputs(model, this.schema, { timeframe, gaps });
  }

  private start() {
    this.current?.stop();
    this.current = null;
    this.model = null;
    this.projected = "";
    this.higher = [];
    this.loading = null;
    this.clearRerun();
    const generation = ++this.generation;
    const { script, timeframe } = this.settings();
    const resolution = effectiveResolution(timeframe, this.req.market.timeframe);
    this.resolution = resolution;
    if (!resolution) {
      this.current = this.engine.execute(
        { ...this.req, inputs: script, props: this.props, visibleRange: this.range },
        {
          ...this.handlers,
          onModel: (model) => {
            if (generation === this.generation) this.handlers.onModel(this.decorate(model));
          },
        },
      );
      return;
    }
    void this.load(generation).then((ok) => {
      if (!ok || generation !== this.generation || this.stopped) return;
      this.current = this.engine.execute(
        {
          ...this.req,
          mode: "static",
          bars: this.higher,
          getBars: () => this.higher,
          market: { ...this.req.market, timeframe: velaTimeframe(resolution) },
          inputs: this.settings().script,
          props: this.props,
          visibleRange: undefined,
          historyState: "complete",
        },
        {
          ...this.handlers,
          onModel: (model) => {
            if (generation !== this.generation) return;
            this.model = model;
            this.projected = "";
            this.emit();
          },
          onAlert: (alert) => generation === this.generation && this.handlers.onAlert?.(alert),
          onWarning: (warning) =>
            generation === this.generation && this.handlers.onWarning?.(warning),
          onError: (error) => generation === this.generation && this.handlers.onError?.(error),
          onDone: () => generation === this.generation && this.handlers.onDone?.(),
        },
      );
    });
  }

  /** Load the higher candles covering the chart's candles (true when there are some). */
  private load(generation: number): Promise<boolean> {
    if (this.loading) return this.loading;
    const resolution = this.resolution!;
    const label = choiceFor(resolution);
    const run = (async () => {
      const fetchSeries = this.req.fetchSeries;
      if (!fetchSeries) throw new Error(tr("This chart cannot load other candle sizes."));
      const chart = this.chart();
      const { symbol, chartStyle } = this.req.market;
      const ticker = chartStyle === "heikinashi" ? `${symbol};heikinashi` : symbol;
      const bars = await fetchSeries(ticker, velaTimeframe(resolution), {
        limit: higherBarsNeeded(chart[0]?.time ?? Date.now(), Date.now(), resolution),
      });
      if (generation !== this.generation) return false;
      // Never ahead of the chart: its newest candle is the newest price it shows.
      const newest = chart.at(-1)?.time ?? Infinity;
      const known = bars.filter((bar) => bar.time <= newest);
      if (!known.length)
        throw new Error(
          tr("No {timeframe} candles are available for this symbol.", { timeframe: label }),
        );
      this.higher = withFormingCandle(known, chart, RESOLUTIONS[resolution]);
      return true;
    })().catch((error: unknown) => {
      if (generation === this.generation && !this.stopped)
        this.handlers.onError?.(
          error instanceof Error && error.message
            ? error
            : new Error(
                tr("Could not load the {timeframe} candles for this indicator.", {
                  timeframe: label,
                }),
              ),
        );
      return false;
    });
    this.loading = run;
    void run.finally(() => {
      if (this.loading === run) this.loading = null;
    });
    return run;
  }

  /** The last model, on the chart's current candles (skipped when nothing changed). */
  private emit(force = false) {
    if (!this.model || !this.resolution || this.stopped) return;
    const chart = this.chart();
    const key = `${chart.length}|${chart[0]?.time}|${chart.at(-1)?.time}|${this.higher.length}`;
    if (!force && key === this.projected) return;
    this.projected = key;
    const { gaps } = this.settings();
    this.handlers.onModel(
      this.decorate(
        projectModel(this.model, {
          chart,
          higher: this.higher,
          chartMs: this.chartMs(),
          higherMs: RESOLUTIONS[this.resolution],
          waitForClose: gaps,
          label: choiceFor(this.resolution),
        }),
      ),
    );
  }

  private clearRerun() {
    if (this.rerun) clearTimeout(this.rerun);
    this.rerun = null;
  }

  private scheduleRerun() {
    if (this.rerun) return;
    this.rerun = setTimeout(() => {
      this.rerun = null;
      this.current?.notifyBars();
    }, RERUN_MS);
  }

  /** Load the higher candles again (a higher candle closed, or the chart reaches further back). */
  private reload() {
    const generation = this.generation;
    void this.load(generation).then((ok) => {
      if (ok && generation === this.generation) this.current?.notifyBars();
    });
  }

  getContext(select?: ContextSelect): Promise<EngineContextSnapshot | null> {
    return this.current?.getContext?.(select) ?? Promise.resolve(null);
  }

  stop() {
    this.stopped = true;
    this.generation++;
    this.clearRerun();
    this.current?.stop();
  }

  update(inputs: Values, props?: Values) {
    const before = this.settings();
    this.inputs = { ...this.inputs, ...inputs };
    if (props) this.props = { ...this.props, ...props };
    const after = this.settings();
    if (after.timeframe !== before.timeframe) return this.start();
    if (this.resolution) {
      // Waiting for closes only moves values between candles: no new run.
      if (after.gaps !== before.gaps) this.emit(true);
      if (JSON.stringify(after.script) !== JSON.stringify(before.script) || props)
        this.current?.update(after.script, props);
      return;
    }
    this.current?.update(after.script, props);
  }

  setVisibleRange(range: VisibleBarRange) {
    this.range = range;
    if (!this.resolution) this.current?.setVisibleRange(range);
  }

  notifyBars(reason?: Parameters<ExecutionSession["notifyBars"]>[0]) {
    if (!this.resolution) return this.current?.notifyBars(reason);
    if (reason === "backfill" || !this.current) return;
    const chart = this.chart();
    const higherMs = RESOLUTIONS[this.resolution];
    const forming = this.higher.at(-1);
    if (reason === "complete") {
      // The chart reaches back before the loaded higher candles: load more of them.
      if (chart[0] && forming && chart[0].time < this.higher[0]!.time) return this.reload();
      return this.emit();
    }
    // A higher candle closed: load the closed one and the new forming one.
    if (forming && (chart.at(-1)?.time ?? 0) >= forming.time + higherMs) return this.reload();
    const next = withFormingCandle(this.higher, chart, higherMs);
    if (next.at(-1) !== this.higher.at(-1)) {
      this.higher = next;
      // A forming candle's values show only when not waiting for closes.
      if (!this.settings().gaps) this.scheduleRerun();
    }
    this.emit();
  }
}
