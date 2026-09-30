"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BarRange, DataProvider, OHLCV, Vela } from "@luxalgo/vela";
import {
  RESOLUTIONS,
  type MarketConnection,
  type ExcursionEstimate,
  type Resolution,
  type TradeMarketResult,
} from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import type { MarketCsvDataset } from "@/lib/market-csv";
import { formingBar, replayFrame } from "@/lib/trade-replay";
import { VELA_TIMEFRAME } from "@/lib/chart-analysis";
import { useApi } from "@/lib/use-api";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";
import { TradeChart, type ChartExecution, type ChartTrade } from "./trade-chart";
import { registerTradeSnapshot } from "@/lib/trade-snapshot";
import { usePrivacy } from "./privacy";
import { clipOffscreenDashes } from "./vela-dash-fix";
import { limitChartView } from "./vela-view-limits";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";
import { randomId } from "@/lib/random-id";

export function TradeMarketData({
  trade,
  executions,
}: {
  trade: ChartTrade & { currency: string };
  executions: ChartExecution[];
}) {
  const privacy = usePrivacy();
  const { data: saved, refresh: refreshSaved } = useApi<{
    saved: { estimate: ExcursionEstimate } | null;
  }>(`/api/trades/${encodeURIComponent(trade.key)}/market-data`);
  const { data: connections, error: connectionError } = useApi<{ connections: MarketConnection[] }>(
    "/api/market-data/connections",
  );
  const available = connections?.connections.filter((connection) => connection.configured) ?? [];
  const [provider, setProvider] = useState("");
  const [symbol, setSymbol] = useState(trade.symbol);
  const [dataset, setDataset] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1m");
  const info = providerInfo(provider);
  const { data: csv } = useApi<{ datasets: MarketCsvDataset[] }>(
    info?.mode === "csv" ? "/api/market-data/csv" : null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<TradeMarketResult | null>(null);
  // Candles loaded stay loaded: this only switches the chart between candles and fills alone.
  const [showCandles, setShowCandles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const invalidate = () => {
    controller.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
  };
  type Selection = { provider: string; symbol: string; dataset: string; resolution: Resolution };
  // Candles chosen for you when the page opens (see `server/trade-market-source.ts`).
  const [auto, setAuto] = useState<{ note: string } | { reason: string } | null>(null);
  const load = async (
    selection: Selection = { provider, symbol, dataset, resolution },
    checked = { available: true },
  ) => {
    if (
      checked.available &&
      (!available.some((item) => item.id === selection.provider) ||
        (providerInfo(selection.provider)?.datasets && !selection.dataset))
    )
      return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`/api/trades/${encodeURIComponent(trade.key)}/market-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selection.provider,
          symbol: selection.symbol,
          dataset: selection.dataset,
          resolution: selection.resolution,
          basisConfirmed: confirmed,
        }),
        signal: request.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "History request failed.");
      if (!request.signal.aborted) {
        setResult(body);
        refreshSaved();
      }
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : "History request failed.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  // Open with the trade's candles when a source is known or an enabled exchange lists it.
  // Once per trade: the cleanup aborts the lookup, so React Strict Mode's second mount (in
  // development) starts it again instead of finding it already spent.
  useEffect(() => {
    const request = new AbortController();
    fetch(`/api/trades/${encodeURIComponent(trade.key)}/market-source`, { signal: request.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          body: {
            source: {
              provider: string;
              providerName: string;
              symbol: string;
              dataset: string | null;
              resolution: Resolution;
              via: "replay" | "chart" | "exchange";
            } | null;
            reason?: string;
          } | null,
        ) => {
          if (!body || request.signal.aborted) return;
          if (!body.source) {
            if (body.reason) setAuto({ reason: body.reason });
            return;
          }
          const chosen = {
            provider: body.source.provider,
            symbol: body.source.symbol,
            dataset: body.source.dataset ?? "",
            resolution: body.source.resolution,
          };
          setProvider(chosen.provider);
          setSymbol(chosen.symbol);
          setDataset(chosen.dataset);
          setResolution(chosen.resolution);
          setAuto({
            note: `${body.source.symbol} ${body.source.resolution} candles from ${body.source.providerName}, ${
              body.source.via === "replay"
                ? "as loaded for this trade before"
                : body.source.via === "chart"
                  ? "the source of your chart of this symbol"
                  : "chosen for this symbol"
            }. Change the source below if it is not the right one.`,
          });
          void load(chosen, { available: false });
        },
      )
      .catch(() => {
        // Without an automatic source the page works as before: choose one below.
      });
    return () => request.abort();
    // Runs once per trade (the source it finds becomes the selection).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.key]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Market data & replay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The market around this trade, its replay, and how far price went against you (MAE) and
            in your favour (MFE) while it was open.
          </p>
          {connectionError && (
            <p role="alert" className="text-sm text-destructive">
              {connectionError}
            </p>
          )}
          {auto && "note" in auto && (
            <p role="status" className="text-xs text-muted-foreground">
              {auto.note}
            </p>
          )}
          {auto && "reason" in auto && available.length > 0 && (
            <p role="status" className="text-xs text-muted-foreground">
              {auto.reason}
            </p>
          )}
          {!available.length && (
            <p className="text-sm text-muted-foreground">
              <a className="underline" href="/settings#market-data">
                Connect a market data provider in Settings
              </a>{" "}
              to see this trade&apos;s candles, replay it and estimate MAE/MFE. Binance, Bybit and
              Coinbase need no key.
            </p>
          )}
          {!trade.closedAt && (
            <p className="text-xs text-muted-foreground">
              Open trade: candles up to now. Estimates are available once it closes.
            </p>
          )}
          {available.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="market-provider">Data provider</Label>
                  <OptionSelect
                    id="market-provider"
                    value={provider}
                    onValueChange={(value) => {
                      invalidate();
                      setProvider(value);
                      setDataset("");
                      setConfirmed(false);
                    }}
                  >
                    <option value="" disabled>
                      Choose a data source
                    </option>
                    {available.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </OptionSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="market-symbol">Provider symbol</Label>
                  <Input
                    id="market-symbol"
                    value={symbol}
                    onChange={(event) => {
                      invalidate();
                      setSymbol(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="market-resolution">Candle resolution</Label>
                  <OptionSelect
                    id="market-resolution"
                    value={resolution}
                    onValueChange={(value) => {
                      invalidate();
                      setResolution(value as Resolution);
                    }}
                  >
                    {Object.keys(RESOLUTIONS).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </OptionSelect>
                </div>
                {(info?.datasets ||
                  info?.mode === "csv" ||
                  info?.id === "london-strategic-edge") && (
                  <div className="space-y-1">
                    <Label htmlFor="market-dataset">Data feed / dataset</Label>
                    {info?.datasets || info?.mode === "csv" ? (
                      <OptionSelect
                        id="market-dataset"
                        value={dataset}
                        onValueChange={(value) => {
                          invalidate();
                          setDataset(value);
                          setConfirmed(false);
                        }}
                      >
                        {(
                          info.datasets ?? [
                            { value: "", label: "Automatic matching file" },
                            ...(csv?.datasets ?? []).map((item) => ({
                              value: item.id,
                              label: `${item.name} · ${item.symbol} · ${item.resolution}`,
                            })),
                          ]
                        ).map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </OptionSelect>
                    ) : (
                      <Input
                        id="market-dataset"
                        value={dataset}
                        placeholder="Leave blank for automatic selection"
                        onChange={(event) => {
                          invalidate();
                          setDataset(event.target.value);
                          setConfirmed(false);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {info?.description} {info?.symbolHint} Option contract history is not supported yet.
              </p>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={confirmed}
                  className="mt-0.5"
                  onChange={(event) => {
                    invalidate();
                    setConfirmed(event.target.checked);
                  }}
                />
                <span>
                  Save the MAE/MFE estimate for Reports. I confirm that this instrument, price
                  adjustments and quote currency match my fills and account ({trade.currency}).
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                MAE and MFE are worked out whenever candles load. Checked: they are also saved for
                Reports. Missing or mismatched data stays unavailable.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    busy ||
                    !symbol.trim() ||
                    !available.some((item) => item.id === provider) ||
                    Boolean(info?.datasets && !dataset)
                  }
                  onClick={() => void load()}
                >
                  {busy
                    ? "Loading history…"
                    : confirmed
                      ? "Load candles & save estimates"
                      : "Load candles & replay"}
                </Button>
                {busy && (
                  <Button variant="outline" onClick={invalidate}>
                    Cancel
                  </Button>
                )}
                {result && result.bars.length > 0 && (
                  <Button variant="outline" onClick={() => setShowCandles((v) => !v)}>
                    {showCandles ? "Show fills only" : "Show candles"}
                  </Button>
                )}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      {!result && saved?.saved && (
        <p className="text-xs text-muted-foreground">
          Previously saved MAE/MFE estimates are shown below. Loading candles without the checkbox
          keeps those saved estimates; it does not calculate new ones.
        </p>
      )}
      {result && result.bars.length > 0 && showCandles ? (
        <HistoricalReplay
          savedBefore={Boolean(saved?.saved)}
          history={result}
          trade={trade}
          executions={executions}
          privacy={privacy}
        />
      ) : (
        <>
          <div
            className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3"
            aria-label="Market data feature status"
          >
            <div>
              <p className="text-xs text-muted-foreground">Estimated MAE</p>
              <p className="text-sm">
                {busy ? (
                  "Loading candles…"
                ) : error ? (
                  "Data request failed"
                ) : result?.bars.length ? (
                  <Excursion
                    savedBefore={Boolean(saved?.saved)}
                    estimate={result.estimate}
                    side="adverse"
                    currency={trade.currency}
                    privacy={privacy}
                  />
                ) : saved?.saved ? (
                  privacy ? (
                    "••••"
                  ) : (
                    fmtMoney(saved.saved.estimate.mae!, trade.currency)
                  )
                ) : (
                  "Load market data to calculate"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated MFE</p>
              <p className="text-sm">
                {busy ? (
                  "Loading candles…"
                ) : error ? (
                  "Data request failed"
                ) : result?.bars.length ? (
                  <Excursion
                    savedBefore={Boolean(saved?.saved)}
                    estimate={result.estimate}
                    side="favorable"
                    currency={trade.currency}
                    privacy={privacy}
                  />
                ) : saved?.saved ? (
                  privacy ? (
                    "••••"
                  ) : (
                    fmtMoney(saved.saved.estimate.mfe!, trade.currency)
                  )
                ) : (
                  "Load market data to calculate"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trade replay</p>
              <p className="text-sm">
                {busy
                  ? "Loading candles…"
                  : result?.bars.length
                    ? "Loaded: show candles to replay"
                    : "Available after candles load"}
              </p>
            </div>
          </div>
          {result && result.bars.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              No candles were returned for this instrument and trade period. Check the symbol,
              dataset and plan coverage.
            </p>
          )}
          <TradeChart trade={trade} executions={executions} />
        </>
      )}
    </div>
  );
}

/**
 * One excursion: the money amount when the estimate has one (with whether it is saved for
 * Reports), else the price move from the candles, else why neither is known.
 */
function Excursion({
  estimate,
  side,
  currency,
  privacy,
  savedBefore = false,
}: {
  estimate: ExcursionEstimate;
  side: "adverse" | "favorable";
  currency: string;
  privacy: boolean;
  /** An estimate for this trade was saved for Reports on an earlier load. */
  savedBefore?: boolean;
}) {
  if (privacy) return <>••••</>;
  const money = side === "adverse" ? estimate.mae : estimate.mfe;
  const move = estimate.priceMove;
  const moveText = move
    ? `${fmtNumber(side === "adverse" ? move.adverse : move.favorable)} in price (${fmtPercent(
        side === "adverse" ? move.adversePct : move.favorablePct,
        2,
      )})`
    : null;
  if (money !== null)
    return (
      <span>
        {fmtMoney(money, currency).replace(/^\+/, "")}
        {moveText && (
          <span className="block text-xs font-normal text-muted-foreground">{moveText}</span>
        )}
        <span className="block text-xs font-normal text-muted-foreground">
          {estimate.saved || savedBefore ? "Saved for Reports" : "Not saved for Reports"}
        </span>
      </span>
    );
  if (moveText)
    return (
      <span>
        {moveText}
        <span className="block text-xs font-normal text-muted-foreground">
          No money amount: see the limits below
        </span>
      </span>
    );
  return <>Unavailable</>;
}

function HistoricalReplay({
  savedBefore,
  history,
  trade,
  executions,
  privacy,
}: {
  savedBefore: boolean;
  history: TradeMarketResult;
  trade: ChartTrade & { currency: string };
  executions: ChartExecution[];
  privacy: boolean;
}) {
  const [count, setCount] = useState(history.bars.length);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("4");
  useEffect(() => {
    setCount(history.bars.length);
    setPlaying(false);
  }, [history]);
  useEffect(() => {
    if (count >= history.bars.length || privacy) setPlaying(false);
  }, [count, privacy, history.bars.length]);
  const complete = count === history.bars.length;
  const frame = useMemo(
    () => replayFrame(history, history.estimate.priceBasisMismatch ? [] : executions, count),
    [history, executions, count],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical candles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {history.provider} · {history.symbol} · {history.resolution} ·{" "}
          {history.bars.length.toLocaleString()} candles · Retrieved{" "}
          {new Date(history.fetchedAt).toLocaleString()}
        </p>
        {privacy ? (
          <p className="text-sm text-muted-foreground">
            Historical prices and excursion amounts are hidden in privacy mode.
          </p>
        ) : (
          <>
            {history.estimate.priceBasisMismatch && (
              <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
                The market candles and recorded fill prices do not match. Replay shows market
                prices; fill labels and MAE/MFE estimates are withheld. See the data limits below.
              </p>
            )}
            <ReplayChart
              history={history}
              fills={history.estimate.priceBasisMismatch ? [] : executions}
              count={count}
              playing={playing && !privacy}
              speed={Number(speed)}
              onAdvance={setCount}
              tradeKey={trade.key}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPlaying(false);
                  setCount(1);
                }}
              >
                Restart
              </Button>
              <Button
                onClick={() => {
                  if (complete) setCount(1);
                  setPlaying(!playing);
                }}
              >
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                variant="outline"
                disabled={complete}
                onClick={() => {
                  setPlaying(false);
                  setCount((current) => Math.min(current + 1, history.bars.length));
                }}
              >
                Next candle
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPlaying(false);
                  setCount(history.bars.length);
                }}
              >
                Show all
              </Button>
              <OptionSelect
                aria-label="Replay speed"
                className="w-24"
                value={speed}
                onValueChange={setSpeed}
              >
                <option value="0.5">0.5×</option>
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
                <option value="8">8×</option>
              </OptionSelect>
            </div>
            <input
              aria-label="Replay position"
              type="range"
              min={1}
              max={history.bars.length}
              value={count}
              className="w-full accent-primary"
              onChange={(event) => {
                setPlaying(false);
                setCount(Number(event.target.value));
              }}
            />
            <p className="text-xs text-muted-foreground">
              {count} / {history.bars.length} candles · Through{" "}
              {new Date(frame.through).toISOString()} (UTC). While playing, each candle is drawn
              forming from open to close (through its low then high, or high then low for a down
              candle); the real order inside a candle is not known, so this is not a tick-by-tick
              simulation.
            </p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
          <div>
            <p className="text-xs text-muted-foreground">Estimated MAE · adverse</p>
            <p className="font-medium">
              {!complete && !privacy ? (
                "Hidden during replay"
              ) : (
                <Excursion
                  savedBefore={savedBefore}
                  estimate={history.estimate}
                  side="adverse"
                  currency={trade.currency}
                  privacy={privacy}
                />
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estimated MFE · favorable</p>
            <p className="font-medium">
              {!complete && !privacy ? (
                "Hidden during replay"
              ) : (
                <Excursion
                  savedBefore={savedBefore}
                  estimate={history.estimate}
                  side="favorable"
                  currency={trade.currency}
                  privacy={privacy}
                />
              )}
            </p>
          </div>
        </div>
        <details className="text-xs text-muted-foreground" open>
          <summary className="cursor-pointer">Data coverage & estimate limits</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {[...history.warnings, ...history.estimate.warnings].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

/** Complete candles pushed a frame, at most: smooth enough, and light on the chart. */
const FRAME_MS = 33;

/**
 * The replay's chart. While playing it runs as a live chart on a small "replay" source: each
 * candle forms over its share of time (`formingBar`), so Vela glides the forming candle and
 * scrolls along as candles appear. A jump (the slider, Restart, Next candle, Show all) redraws
 * the revealed candles at once. Only revealed candles and fills ever reach the chart.
 */
function ReplayChart({
  history,
  fills,
  count,
  playing,
  speed,
  onAdvance,
  tradeKey,
}: {
  history: TradeMarketResult;
  fills: ChartExecution[];
  /** Complete candles revealed. */
  count: number;
  playing: boolean;
  /** Candles a second. */
  speed: number;
  /** The animation finished a candle: this many are now revealed. */
  onAdvance: (count: number) => void;
  /** The chart's picture goes with an AI critique of this trade while it is shown. */
  tradeKey: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const wanted = useRef({ count, playing, speed });
  wanted.current = { count, playing, speed };
  const fillsRef = useRef(fills);
  fillsRef.current = fills;
  const advance = useRef(onAdvance);
  advance.current = onAdvance;
  /** The count the chart itself last reached, so its own progress is not taken for a jump. */
  const reached = useRef(count);
  const controls = useRef<{ jump(count: number): void; sync(): void } | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    setError("");
    void (async () => {
      const { Vela, registerNativeIndicator, unregisterNativeIndicator } =
        await import("@luxalgo/vela");
      if (disposed || !host.current) return;
      const bars = history.bars;
      const step = RESOLUTIONS[history.resolution];
      // Each redraw loads the replay source again under a new name: Vela takes the same
      // symbol for no change and would neither reload nor subscribe again.
      let generation = 0;
      const symbol = () => `replay:${history.symbol}${generation ? `.${generation}` : ""}`;
      let shown = wanted.current.count;
      /** A candle part-formed when play paused, so resuming carries on from there. */
      let partial: { index: number; progress: number } | null = null;
      let push: ((bar: OHLCV) => void) | null = null;
      let run = 0;
      let frame = 0;
      const through = () => {
        const last = bars[shown - 1];
        return last ? last.time + step : -Infinity;
      };

      let emitted = NaN;
      let emitFills: (() => void) | null = null;
      const type = `replay-fills-${randomId()}`;
      registerNativeIndicator({
        type,
        title: "Recorded fills",
        paneHint: "price",
        overlay: true,
        inputsSchema: () => [],
        defaultInputs: () => ({}),
        create: () => ({
          start(ctx) {
            emitFills = () => {
              emitted = through();
              ctx.emit({
                labels: fillsRef.current
                  .filter((fill) => Date.parse(fill.executedAt) <= emitted)
                  .map((fill, index) => ({
                    id: `fill-${index}`,
                    paneId: "price",
                    xloc: "bar_time" as const,
                    x: Date.parse(fill.executedAt),
                    y: fill.price,
                    yloc: "price" as const,
                    text: `${fill.side.toUpperCase()} ${fill.quantity}`,
                    style: "label_left" as const,
                    color: fill.side === "buy" ? "#087f23" : "#bd2626",
                    textColor: "#ffffff",
                    size: "small" as const,
                    textAlign: "center" as const,
                    fontFamily: "default" as const,
                    overlay: true,
                  })),
              });
            };
            emitFills();
            ctx.setStatus("idle");
          },
          onBars() {
            // Fills follow the revealed time, not every forming tick.
            if (emitted !== through()) emitFills?.();
          },
          onViewport() {},
          setInputs() {},
          suspend() {},
          resume() {},
          stop() {
            emitFills = null;
          },
        }),
      });

      const feed: DataProvider = {
        info: () => ({
          name: "replay",
          capabilities: { enumerate: false, stream: true, symbolInfo: false },
        }),
        async getBars(_ticker: string, _timeframe: string, range: BarRange) {
          return bars
            .slice(0, shown)
            .filter(
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
        symbol: symbol(),
        timeframe: VELA_TIMEFRAME[history.resolution],
        live: true,
        height: 420,
        theme: dark() ? "dark" : "light",
        priceStyle: "candles",
        volume: true,
        drawings: false,
        // The forming candle glides toward each step instead of snapping.
        animations: { liveBar: 60 },
      });
      instance.data.registerProvider("replay", feed);
      clipOffscreenDashes(instance.renderer);
      limitChartView(instance.renderer);
      const unregister = registerTradeSnapshot(tradeKey, () => instance.renderer.screenshot());
      instance.addNativeIndicator(type);

      const stop = () => {
        run += 1;
        cancelAnimationFrame(frame);
      };
      // Coalesce rapid scrubbing instead of queuing chart reloads.
      let reloading = false;
      let target = shown;
      const jump = (count: number) => {
        stop();
        partial = null;
        shown = count;
        target = count;
        if (reloading) return;
        reloading = true;
        void (async () => {
          try {
            do {
              const next = target;
              generation += 1;
              push = null;
              await instance.setMarket({ symbol: symbol() });
              emitFills?.();
              if (next === target) break;
            } while (!disposed);
          } catch {
            if (!disposed) setError("The replay chart could not be updated.");
          } finally {
            reloading = false;
            if (!disposed) sync();
          }
        })();
      };
      const play = async (candlesPerSecond: number) => {
        const token = ++run;
        // Just after a redraw the source may not be subscribed yet.
        for (let wait = 0; !push && wait < 60 && token === run && !disposed; wait++)
          await new Promise((resolve) => setTimeout(resolve, 50));
        if (token !== run || disposed || !push) return;
        const duration = 1000 / candlesPerSecond;
        let index = shown;
        let start =
          performance.now() - (partial?.index === index ? partial.progress : 0) * duration;
        let previous = performance.now();
        let pushed = 0;
        const tick = (now: number) => {
          if (token !== run || disposed) return;
          // Back from a hidden tab: carry on where it was rather than rushing to catch up.
          if (now - previous > 250) start += now - previous - FRAME_MS;
          previous = now;
          const bar = bars[index];
          if (!bar) return;
          const progress = Math.min(1, (now - start) / duration);
          if (progress >= 1 || now - pushed >= FRAME_MS) {
            push?.(formingBar(bar, progress));
            pushed = now;
          }
          partial = { index, progress };
          if (progress >= 1) {
            index += 1;
            shown = index;
            partial = null;
            reached.current = index;
            emitFills?.();
            advance.current(index);
            if (index >= bars.length) return;
            start = now;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      };
      const sync = () => {
        if (reloading) return;
        stop();
        const { playing, speed } = wanted.current;
        if (playing && shown < bars.length) void play(speed);
      };
      controls.current = { jump, sync };
      sync();

      const observer = new MutationObserver(() => instance.setTheme(dark() ? "dark" : "light"));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      cleanup = () => {
        stop();
        controls.current = null;
        unregister();
        observer.disconnect();
        instance.destroy();
        unregisterNativeIndicator(type);
      };
    })().catch(() => {
      if (!disposed) setError("The historical chart could not be rendered.");
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [history, tradeKey]);
  // A count the chart did not reach itself is a jump.
  useEffect(() => {
    if (count === reached.current) return;
    reached.current = count;
    controls.current?.jump(count);
  }, [count]);
  useEffect(() => {
    controls.current?.sync();
  }, [playing, speed]);
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div ref={host} className="h-[420px] overflow-hidden rounded-lg border" />
    </>
  );
}
