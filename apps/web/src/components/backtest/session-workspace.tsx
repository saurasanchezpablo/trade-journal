"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BacktestError,
  backtestReport,
  cancelOrder,
  closePosition,
  modifyPosition,
  newBacktest,
  placeOrder,
  stepBar,
  type BacktestEvent,
  type BacktestOrderType,
  type BacktestSide,
  type BacktestState,
  type BacktestTrade,
} from "@luxalgo/journal-core";
import { ArrowLeft, FastForward, Pause, Play, SkipForward } from "lucide-react";
import { useFilters } from "@/components/filter-bar";
import { useI18n, useT } from "@/components/i18n";
import { Pnl } from "@/components/pnl";
import { MonetaryValue } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INDICATOR_LIBRARY } from "@/lib/indicator-library";
import {
  chartOverlays,
  fmtAmount,
  localInput,
  viewResolutions,
  zonedTime,
} from "@/lib/backtest-replay";
import {
  settingsProblem,
  type BacktestSession,
  type SessionSettings,
} from "@/lib/backtest-session";
import { maxSpanMs } from "@/lib/chart-analysis";
import {
  RESOLUTIONS,
  type MarketBar,
  type MarketHistory,
  type Resolution,
} from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import { NOT_A_NUMBER, parseDecimalInput } from "@/lib/number-input";
import { formatTimestamp } from "@/lib/timezone";
import { postJson } from "@/lib/use-api";
import { fmtNumber } from "@/lib/utils";
import { BacktestChart, type BacktestChartApi } from "./backtest-chart";
import { BacktestReportView } from "./backtest-report";
import { OrderTicket, type TicketOrder } from "./order-ticket";
import { TradesTable } from "./trades-table";

/** Candles shown before the start, and loaded ahead of the replay at a time. */
const CONTEXT = 300;
const AHEAD = 1500;
const SPEEDS = ["0.5", "1", "2", "4", "8", "16"];

interface ChartDocument {
  vela: unknown;
  indicators: string[];
}
const readChartDocument = (value: unknown): ChartDocument => {
  const doc = value && typeof value === "object" ? (value as Partial<ChartDocument>) : {};
  return {
    vela: doc.vela ?? null,
    indicators: Array.isArray(doc.indicators)
      ? doc.indicators.filter((key): key is string => typeof key === "string").slice(0, 10)
      : [],
  };
};

type Translate = (text: string, vars?: Record<string, string | number>) => string;

const CLOSED_BY: Record<BacktestTrade["exitReason"], string> = {
  stop: "{id} closed by stop at {price}",
  target: "{id} closed by target at {price}",
  manual: "{id} closed by hand at {price}",
  end: "{id} closed by end at {price}",
};

/** A pending order's line: side and order type in one sentence each. */
const ORDER_LINES: Record<BacktestSide, Record<BacktestOrderType, string>> = {
  long: {
    market: "Buy market {qty} at {price}",
    limit: "Buy limit {qty} at {price}",
    stop: "Buy stop {qty} at {price}",
  },
  short: {
    market: "Sell market {qty} at {price}",
    limit: "Sell limit {qty} at {price}",
    stop: "Sell stop {qty} at {price}",
  },
};

interface LogLine {
  text: string;
  /** A closed trade's result, shown apart so privacy mode can hide it. */
  pnl: number | null;
}
const logLine = (event: BacktestEvent, t: Translate): LogLine =>
  event.kind === "filled"
    ? {
        text: t(event.side === "long" ? "Bought at {price}" : "Sold at {price}", {
          price: fmtNumber(event.price, 6),
        }),
        pnl: null,
      }
    : event.kind === "closed"
      ? {
          text: t(
            event.trade.ambiguous
              ? `${CLOSED_BY[event.trade.exitReason]} (same-candle rule)`
              : CLOSED_BY[event.trade.exitReason],
            { id: event.trade.id, price: fmtNumber(event.trade.exitPrice, 6) },
          ),
          pnl: event.trade.netPnl,
        }
      : {
          text: t("Order {id} cancelled: {reason}", {
            id: event.orderId,
            reason: t(event.reason),
          }),
          pnl: null,
        };

/** A replay backtest: the chart, its replay controls, orders, the position and the results. */
export function SessionWorkspace({ initial }: { initial: BacktestSession }) {
  const { t } = useI18n();
  const { timeZone } = useFilters();
  const [session, setSession] = useState(initial);
  const settings = session.settings;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const step = RESOLUTIONS[session.resolution];
  const bars = useRef<MarketBar[]>([]);
  const cursor = useRef(-1);
  const loadedTo = useRef(0);
  const reachedEnd = useRef(false);
  const [engine, setEngineState] = useState<BacktestState>(initial.state);
  const engineRef = useRef(engine);
  const setEngine = (state: BacktestState) => {
    engineRef.current = state;
    setEngineState(state);
  };
  const [, setTick] = useState(0);
  const rerender = () => setTick((n) => n + 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("2");
  const [view, setView] = useState<Resolution>(initial.resolution);
  const [pauseOnFill, setPauseOnFill] = useState(true);
  const pauseRef = useRef(pauseOnFill);
  pauseRef.current = pauseOnFill;
  const [log, setLog] = useState<LogLine[]>([]);
  const chartDoc = useRef(readChartDocument(initial.drawings));
  const [indicators, setIndicators] = useState(chartDoc.current.indicators);
  const api = useRef<BacktestChartApi | null>(null);

  // ── Saving: changes are gathered and sent a moment later, and on leaving ──
  const pending = useRef<Record<string, unknown>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const url = `/api/backtests/${encodeURIComponent(initial.id)}`;
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const body = pending.current;
    pending.current = {};
    if (!Object.keys(body).length) return;
    try {
      await postJson(url, body, "PATCH");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The session could not be saved.");
    }
  }, [url]);
  const save = useCallback(
    (patch: Record<string, unknown>) => {
      Object.assign(pending.current, patch);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );
  useEffect(() => {
    const leave = () => {
      const body = pending.current;
      if (!Object.keys(body).length) return;
      pending.current = {};
      void fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      void flush();
    };
  }, [flush, url]);

  // ── Candles: loaded around the start, and ahead as the replay moves on ──
  const fetchWindow = useCallback(
    async (from: number, to: number) => {
      const out: MarketBar[] = [];
      const span = maxSpanMs(initial.resolution);
      for (let start = from; start < to; start += span) {
        const history = await postJson<MarketHistory>("/api/market-data/history", {
          provider: initial.provider,
          symbol: initial.symbol,
          dataset: initial.dataset,
          resolution: initial.resolution,
          from: start,
          to: Math.min(to, start + span),
        });
        out.push(...history.bars);
      }
      // Only finished candles: the one still forming now would reveal a changing price.
      const now = Date.now();
      return out.filter((bar) => bar.time + step <= now);
    },
    [initial, step],
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const to = Math.min(Date.now(), initial.cursorAt + AHEAD * step);
        const loaded = await fetchWindow(initial.cursorAt - CONTEXT * step, to);
        if (cancelled) return;
        if (!loaded.length) {
          setError(
            "No candles for this symbol around the start date. Check the source and symbol.",
          );
          setLoading(false);
          return;
        }
        bars.current = loaded;
        loadedTo.current = to;
        let index = 0;
        while (index + 1 < loaded.length && loaded[index + 1]!.time <= initial.cursorAt) index += 1;
        cursor.current = index;
        setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "The candles could not be loaded.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWindow, initial, step]);

  const ensureAhead = useCallback(async () => {
    if (reachedEnd.current || bars.current.length - 1 - cursor.current > 50) return;
    let from = loadedTo.current;
    for (let attempt = 0; attempt < 6 && from < Date.now(); attempt++) {
      const to = Math.min(Date.now(), from + AHEAD * step);
      const last = bars.current.at(-1)?.time ?? 0;
      const got = (await fetchWindow(from, to)).filter((bar) => bar.time > last);
      loadedTo.current = to;
      from = to;
      if (got.length) {
        bars.current = [...bars.current, ...got];
        return;
      }
    }
    if (from >= Date.now()) reachedEnd.current = true;
  }, [fetchWindow, step]);

  const revealedCache = useRef<{ n: number; bars: MarketBar[] }>({ n: -1, bars: [] });
  const revealed = useCallback(() => {
    const n = cursor.current + 1;
    if (revealedCache.current.n !== n || revealedCache.current.bars.length !== n)
      revealedCache.current = { n, bars: bars.current.slice(0, n) };
    return revealedCache.current.bars;
  }, []);
  const current = bars.current[cursor.current] ?? null;

  // ── The engine, one candle at a time ──
  const record = (events: BacktestEvent[]) => {
    if (!events.length) return;
    setLog((lines) => [...events.map((event) => logLine(event, t)), ...lines].slice(0, 30));
  };
  /** Reveal the next candle; false when it filled or closed something and play should stop. */
  const advanceOne = (): boolean | null => {
    const next = bars.current[cursor.current + 1];
    if (!next) return null;
    const { state, events } = stepBar(engineRef.current, next, settingsRef.current);
    cursor.current += 1;
    setEngine(state);
    rerender();
    record(events);
    save({ cursorAt: next.time, state });
    return !(pauseRef.current && events.length > 0);
  };

  const playToken = useRef(0);
  useEffect(() => {
    if (!playing) {
      api.current?.stop();
      return;
    }
    const token = ++playToken.current;
    void (async () => {
      while (token === playToken.current) {
        await ensureAhead();
        const next = bars.current[cursor.current + 1];
        if (!next) {
          setPlaying(false);
          setNotice(
            reachedEnd.current
              ? "The replay reached the latest candles."
              : "No more candles to replay.",
          );
          return;
        }
        const done = await api.current?.playCandle(next, 1000 / Number(speed));
        if (!done || token !== playToken.current) return;
        if (advanceOne() !== true) {
          setPlaying(false);
          return;
        }
      }
    })();
    return () => {
      playToken.current += 1;
      api.current?.stop();
    };
  }, [playing, speed, ensureAhead]);

  const stepOnce = async () => {
    setPlaying(false);
    setNotice("");
    await ensureAhead();
    const next = bars.current[cursor.current + 1];
    if (!next) return setNotice("No more candles to replay.");
    await api.current?.playCandle(next, 0);
    advanceOne();
  };
  const skip = async (count: number | null, until?: number) => {
    setPlaying(false);
    setNotice("");
    for (let i = 0; count === null || i < count; i++) {
      await ensureAhead();
      const next = bars.current[cursor.current + 1];
      if (!next || (until !== undefined && next.time > until)) break;
      if (advanceOne() === false) break;
      if (i > 20_000) break;
    }
    await api.current?.redraw();
  };

  // ── Orders and the position ──
  const act = (change: () => { state: BacktestState; events?: BacktestEvent[] }): string | null => {
    try {
      const { state, events = [] } = change();
      setEngine(state);
      record(events);
      save({ state });
      return null;
    } catch (cause) {
      if (cause instanceof BacktestError) return cause.message;
      throw cause;
    }
  };
  const place = (order: TicketOrder) =>
    current
      ? act(() => placeOrder(engineRef.current, order, current, settings))
      : "Wait for the candles.";
  const position = engine.position;
  const price = current?.close ?? null;
  const openPnl =
    position && price !== null
      ? (price - position.entryPrice) *
          (position.side === "long" ? 1 : -1) *
          position.qty *
          settings.multiplier -
        position.entryFees
      : null;
  const equity = engine.balance + (openPnl ?? 0);

  const report = useMemo(
    () => backtestReport(engine.trades, settings.initialBalance),
    [engine.trades, settings.initialBalance],
  );
  const overlays = useMemo(
    () => chartOverlays(engine, current ? current.time + step : 0),
    [engine, current, step],
  );

  // Space plays and pauses, the right arrow reveals one candle.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=combobox]"))
        return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.key === "ArrowRight" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        void stepOnce();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const when = (time: number) =>
    formatTimestamp(new Date(time).toISOString(), timeZone).slice(0, 16);
  const views = viewResolutions(initial.resolution);
  const [jumpTo, setJumpTo] = useState("");

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/backtest"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
          >
            <ArrowLeft className="size-3" /> {t("All backtests")}
          </Link>
          <h2 className="truncate text-lg font-semibold">{session.name}</h2>
          <p className="text-xs text-muted-foreground">
            {initial.symbol} · {providerInfo(initial.provider)?.name ?? initial.provider} ·{" "}
            {t("{resolution} candles", { resolution: initial.resolution })}
            {current
              ? ` · ${t("replaying {time} ({timeZone})", { time: when(current.time), timeZone })}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("Balance")}</p>
            <p className="tnum font-medium">
              <MonetaryValue>{fmtAmount(engine.balance, settings.currency)}</MonetaryValue>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("Equity")}</p>
            <p className="tnum font-medium">
              <MonetaryValue>{fmtAmount(equity, settings.currency)}</MonetaryValue>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("Net result")}</p>
            <Pnl
              value={engine.balance - settings.initialBalance}
              currency={settings.currency}
              className="font-medium"
            />
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <Card>
            <CardContent className="space-y-3 pt-4">
              {loading ? (
                <div className="flex h-[520px] items-center justify-center text-sm text-muted-foreground">
                  {t("Loading candles…")}
                </div>
              ) : bars.current.length ? (
                <BacktestChart
                  symbol={initial.symbol}
                  view={view}
                  revealed={revealed}
                  levels={overlays.levels}
                  marks={overlays.marks}
                  drawings={chartDoc.current.vela}
                  indicators={indicators}
                  onDrawings={(vela) => {
                    chartDoc.current = { ...chartDoc.current, vela };
                    save({ drawings: chartDoc.current });
                  }}
                  onReady={(ready) => {
                    api.current = ready;
                  }}
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => setPlaying((value) => !value)}
                  disabled={loading || !current}
                >
                  {playing ? <Pause /> : <Play />}
                  {playing ? t("Pause") : t("Play")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void stepOnce()}
                  disabled={loading || !current}
                >
                  <SkipForward />
                  {t("Next candle")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void skip(10)}
                  disabled={loading || !current}
                >
                  <FastForward />
                  +10
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void skip(100)}
                  disabled={loading || !current}
                >
                  +100
                </Button>
                <OptionSelect
                  aria-label={t("Replay speed")}
                  className="w-24"
                  value={speed}
                  onValueChange={setSpeed}
                >
                  {SPEEDS.map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </OptionSelect>
                <OptionSelect
                  aria-label={t("Chart timeframe")}
                  className="w-24"
                  value={view}
                  onValueChange={(value) => setView(value as Resolution)}
                >
                  {views.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </OptionSelect>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={pauseOnFill}
                    onChange={(event) => setPauseOnFill(event.target.checked)}
                  />
                  {t("Pause on fills and exits")}
                </label>
              </div>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const until = zonedTime(jumpTo, timeZone);
                  if (until === null) return setNotice("Choose a date and time to skip to.");
                  if (current && until <= current.time)
                    return setNotice("The replay only moves forward: choose a later time.");
                  void skip(null, until);
                }}
              >
                <div>
                  <label htmlFor="backtest-skip" className="text-xs text-muted-foreground">
                    {t("Skip to ({timeZone})", { timeZone })}
                  </label>
                  <Input
                    id="backtest-skip"
                    type="datetime-local"
                    className="w-56"
                    value={jumpTo || (current ? localInput(current.time, timeZone) : "")}
                    onChange={(event) => setJumpTo(event.target.value)}
                  />
                </div>
                <Button type="submit" variant="outline" disabled={loading || !current}>
                  {t("Skip")}
                </Button>
                <p className="pb-2 text-xs text-muted-foreground">
                  {t(
                    "Space plays or pauses; the right arrow reveals one candle. Skipping stops at a fill or exit while pausing on them is on.",
                  )}
                </p>
              </form>
              {notice && (
                <p role="status" className="text-xs text-muted-foreground">
                  {t(notice)}
                </p>
              )}
            </CardContent>
          </Card>
          <Tabs defaultValue="trades">
            <TabsList>
              <TabsTrigger value="trades">
                {t("Trades ({count})", { count: engine.trades.length })}
              </TabsTrigger>
              <TabsTrigger value="report">{t("Report")}</TabsTrigger>
              <TabsTrigger value="notes">{t("Notes")}</TabsTrigger>
              <TabsTrigger value="settings">{t("Settings")}</TabsTrigger>
            </TabsList>
            <TabsContent value="trades">
              <Card>
                <CardContent className="pt-4">
                  <TradesTable
                    trades={engine.trades}
                    currency={settings.currency}
                    timeZone={timeZone}
                    onNote={(id, note) =>
                      act(() => ({
                        state: {
                          ...engineRef.current,
                          trades: engineRef.current.trades.map((trade) =>
                            trade.id === id ? { ...trade, note } : trade,
                          ),
                        },
                      }))
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="report">
              <Card>
                <CardContent className="pt-4">
                  <BacktestReportView
                    report={report}
                    currency={settings.currency}
                    initialBalance={settings.initialBalance}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="notes">
              <Card>
                <CardContent className="space-y-2 pt-4">
                  <label htmlFor="backtest-notes" className="text-xs text-muted-foreground">
                    {t("What you are testing, and what you learn")}
                  </label>
                  <textarea
                    id="backtest-notes"
                    className="min-h-40 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    defaultValue={session.notes}
                    onChange={(event) => save({ notes: event.target.value })}
                  />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="settings">
              <SettingsCard
                settings={settings}
                indicators={indicators}
                onIndicators={(next) => {
                  setIndicators(next);
                  chartDoc.current = { ...chartDoc.current, indicators: next };
                  save({ drawings: chartDoc.current });
                }}
                onSave={(next) => {
                  const balance =
                    next.initialBalance +
                    engineRef.current.trades.reduce((sum, trade) => sum + trade.netPnl, 0);
                  setSession((s) => ({ ...s, settings: next }));
                  setEngine({ ...engineRef.current, balance });
                  save({ settings: next, state: engineRef.current });
                }}
                onRestart={() => {
                  if (!confirm(t("Start this session over? Its trades and orders are removed.")))
                    return;
                  setPlaying(false);
                  const fresh = newBacktest(settings);
                  let index = 0;
                  while (
                    index + 1 < bars.current.length &&
                    bars.current[index + 1]!.time <= initial.startAt
                  )
                    index += 1;
                  cursor.current = index;
                  setEngine(fresh);
                  setLog([]);
                  rerender();
                  save({ state: fresh, cursorAt: bars.current[index]?.time ?? initial.startAt });
                  void api.current?.redraw();
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("Order")}</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTicket
                price={price}
                settings={settings}
                balance={engine.balance}
                disabled={position ? t("Close the open position before entering again.") : null}
                onPlace={place}
              />
            </CardContent>
          </Card>
          {position && price !== null && (
            <PositionCard
              key={`${position.id}-${position.stop}-${position.target}`}
              position={position}
              price={price}
              openPnl={openPnl ?? 0}
              currency={settings.currency}
              timeZone={timeZone}
              onModify={(levels) =>
                act(() => ({ state: modifyPosition(engineRef.current, levels, price) }))
              }
              onClose={() =>
                current && act(() => closePosition(engineRef.current, current, settings))
              }
            />
          )}
          {engine.orders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("Pending orders")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {engine.orders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-2">
                    <span>
                      {t(ORDER_LINES[order.side][order.type], {
                        qty: fmtNumber(order.qty, 6),
                        price: fmtNumber(order.price, 6),
                      })}
                      {order.stop !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {t("stop {price}", { price: fmtNumber(order.stop, 6) })}
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        act(() => ({ state: cancelOrder(engineRef.current, order.id) }))
                      }
                    >
                      {t("Cancel")}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t("Activity")}</CardTitle>
            </CardHeader>
            <CardContent>
              {log.length ? (
                <ul className="space-y-1 text-xs" aria-live="polite">
                  {log.map((line, i) => (
                    <li key={i}>
                      {line.text}
                      {line.pnl !== null && (
                        <>
                          : <Pnl value={line.pnl} currency={settings.currency} />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {settings.sameCandle === "stop-first"
                    ? t(
                        "Fills and exits appear here as the replay reaches them. Orders fill from each new candle's prices; a candle that reaches both your stop and target counts the stop.",
                      )
                    : t(
                        "Fills and exits appear here as the replay reaches them. Orders fill from each new candle's prices; a candle that reaches both your stop and target counts the target.",
                      )}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PositionCard({
  position,
  price,
  openPnl,
  currency,
  timeZone,
  onModify,
  onClose,
}: {
  position: NonNullable<BacktestState["position"]>;
  price: number;
  openPnl: number;
  currency: string;
  timeZone: string;
  onModify: (levels: { stop: number | null; target: number | null }) => string | null;
  onClose: () => void;
}) {
  const { t, tn } = useI18n();
  const [stop, setStop] = useState(position.stop === null ? "" : String(position.stop));
  const [target, setTarget] = useState(position.target === null ? "" : String(position.target));
  const [error, setError] = useState("");
  const r = position.risk ? openPnl / position.risk : null;
  const apply = (levels: { stop: number | null; target: number | null }) => {
    const problem = onModify(levels);
    setError(problem ?? "");
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Open position")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className={position.side === "long" ? "text-profit" : "text-loss"}>
            {t(position.side === "long" ? "Long" : "Short")}
          </span>{" "}
          {t("{qty} from {price}", {
            qty: fmtNumber(position.qty, 6),
            price: fmtNumber(position.entryPrice, 6),
          })}
          <span className="block text-xs text-muted-foreground">
            {tn(
              position.bars,
              "since {time} · {count} candle · now {price}",
              "since {time} · {count} candles · now {price}",
              {
                time: formatTimestamp(new Date(position.entryTime).toISOString(), timeZone).slice(
                  0,
                  16,
                ),
                price: fmtNumber(price, 6),
              },
            )}
          </span>
        </p>
        <p>
          {t("Open result")} <Pnl value={openPnl} currency={currency} className="font-medium" />
          {r !== null && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({r > 0 ? "+" : ""}
              {fmtNumber(r)} R)
            </span>
          )}
        </p>
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const s = parseDecimalInput(stop);
            const tp = parseDecimalInput(target);
            if (s === undefined || tp === undefined) return setError(NOT_A_NUMBER);
            apply({ stop: s, target: tp });
          }}
        >
          <div>
            <label htmlFor="position-stop" className="text-xs text-muted-foreground">
              {t("Stop loss")}
            </label>
            <Input
              id="position-stop"
              inputMode="decimal"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="position-target" className="text-xs text-muted-foreground">
              {t("Take profit")}
            </label>
            <Input
              id="position-target"
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            {t("Update levels")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => apply({ stop: position.entryPrice, target: position.target })}
          >
            {t("Stop to breakeven")}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {t(error)}
          </p>
        )}
        <Button className="w-full" variant="secondary" onClick={onClose}>
          {t("Close at market")}
        </Button>
      </CardContent>
    </Card>
  );
}

function SettingsCard({
  settings,
  indicators,
  onIndicators,
  onSave,
  onRestart,
}: {
  settings: SessionSettings;
  indicators: string[];
  onIndicators: (keys: string[]) => void;
  onSave: (settings: SessionSettings) => void;
  onRestart: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(() => ({
    initialBalance: String(settings.initialBalance),
    currency: settings.currency,
    riskMode: settings.riskMode,
    riskValue: String(settings.riskValue),
    commissionPerFill: String(settings.commissionPerFill),
    commissionPct: String(settings.commissionRate * 100),
    slippage: String(settings.slippage),
    multiplier: String(settings.multiplier),
    lotStep: String(settings.lotStep),
    sameCandle: settings.sameCandle,
  }));
  const [message, setMessage] = useState("");
  const set = (key: keyof typeof draft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const numberField = (key: keyof typeof draft, label: string) => (
    <div>
      <label htmlFor={`bt-${key}`} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={`bt-${key}`}
        inputMode="decimal"
        value={draft[key]}
        onChange={(e) => set(key)(e.target.value)}
      />
    </div>
  );
  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <form
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            const n = (text: string) => parseDecimalInput(text);
            const values = [
              draft.initialBalance,
              draft.riskValue,
              draft.commissionPerFill,
              draft.commissionPct,
              draft.slippage,
              draft.multiplier,
              draft.lotStep,
            ].map(n);
            if (values.some((v) => v === undefined || v === null)) return setMessage(NOT_A_NUMBER);
            const [
              initialBalance,
              riskValue,
              commissionPerFill,
              commissionPct,
              slippage,
              multiplier,
              lotStep,
            ] = values as number[];
            const next: SessionSettings = {
              initialBalance: initialBalance!,
              currency: draft.currency.trim().toUpperCase(),
              riskMode: draft.riskMode,
              riskValue: riskValue!,
              commissionPerFill: commissionPerFill!,
              commissionRate: commissionPct! / 100,
              slippage: slippage!,
              multiplier: multiplier!,
              lotStep: lotStep!,
              sameCandle: draft.sameCandle,
            };
            const problem = settingsProblem(next);
            if (problem) return setMessage(problem);
            onSave(next);
            setMessage("Saved. Commission and slippage apply to fills from now on.");
          }}
        >
          {numberField("initialBalance", t("Starting balance"))}
          <div>
            <label htmlFor="bt-currency" className="text-xs text-muted-foreground">
              {t("Currency")}
            </label>
            <Input
              id="bt-currency"
              value={draft.currency}
              maxLength={3}
              onChange={(e) => set("currency")(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="bt-riskMode" className="text-xs text-muted-foreground">
              {t("Risk per trade as")}
            </label>
            <OptionSelect
              id="bt-riskMode"
              aria-label={t("Risk per trade as")}
              value={draft.riskMode}
              onValueChange={(v) => set("riskMode")(v)}
            >
              <option value="percent">{t("% of the balance")}</option>
              <option value="amount">{t("An amount")}</option>
            </OptionSelect>
          </div>
          {numberField(
            "riskValue",
            draft.riskMode === "percent" ? t("Risk (%)") : t("Risk (amount)"),
          )}
          {numberField("commissionPerFill", t("Commission per fill"))}
          {numberField("commissionPct", t("Commission (% of each fill)"))}
          {numberField("slippage", t("Slippage (price, on market and stop fills)"))}
          {numberField("multiplier", t("Contract multiplier"))}
          {numberField("lotStep", t("Lot size (0 for exact)"))}
          <div className="col-span-2 sm:col-span-3">
            <label htmlFor="bt-sameCandle" className="text-xs text-muted-foreground">
              {t("When one candle reaches both the stop and the target")}
            </label>
            <OptionSelect
              id="bt-sameCandle"
              aria-label={t("Same candle rule")}
              value={draft.sameCandle}
              onValueChange={(v) => set("sameCandle")(v)}
            >
              <option value="stop-first">{t("Count the stop (careful)")}</option>
              <option value="target-first">{t("Count the target")}</option>
            </OptionSelect>
          </div>
          <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
            <Button type="submit">{t("Save settings")}</Button>
            {message && (
              <p role="status" className="text-xs text-muted-foreground">
                {t(message)}
              </p>
            )}
          </div>
        </form>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t("Indicators on the chart (built in; up to 10)")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INDICATOR_LIBRARY.map((item) => {
              const on = indicators.includes(item.key);
              return (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant={on ? "secondary" : "outline"}
                  aria-pressed={on}
                  className="h-7 px-2 text-xs"
                  disabled={!on && indicators.length >= 10}
                  onClick={() =>
                    onIndicators(
                      on ? indicators.filter((k) => k !== item.key) : [...indicators, item.key],
                    )
                  }
                >
                  {t(item.name)}
                </Button>
              );
            })}
          </div>
        </div>
        <Button type="button" variant="outline" className="text-destructive" onClick={onRestart}>
          {t("Start the session over")}
        </Button>
      </CardContent>
    </Card>
  );
}
