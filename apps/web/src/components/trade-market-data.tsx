"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Vela } from "@luxalgo/vela";
import {
  RESOLUTIONS,
  type MarketConnection,
  type ExcursionEstimate,
  type Resolution,
  type TradeMarketResult,
} from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import type { MarketCsvDataset } from "@/lib/market-csv";
import { replayFrame } from "@/lib/trade-replay";
import { VELA_TIMEFRAME } from "@/lib/chart-analysis";
import { useApi } from "@/lib/use-api";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";
import { TradeChart, type ChartExecution, type ChartTrade } from "./trade-chart";
import { registerTradeSnapshot } from "@/lib/trade-snapshot";
import { usePrivacy } from "./privacy";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { OptionSelect } from "./ui/option-select";

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
  const autoStarted = useRef(false);
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
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
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
    // Runs once per trade page.
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
    if (!playing || privacy) return;
    const timer = window.setInterval(
      () => {
        if (!document.hidden) setCount((current) => Math.min(current + 1, history.bars.length));
      },
      1000 / Number(speed),
    );
    return () => window.clearInterval(timer);
  }, [playing, privacy, speed, history.bars.length]);
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
            <ReplayChart history={history} nextFrame={frame} tradeKey={trade.key} />
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
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
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
              {new Date(frame.through).toISOString()} (UTC). Candles are revealed at bar close; this
              is not a tick-by-tick simulation.
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

function ReplayChart({
  history,
  nextFrame,
  tradeKey,
}: {
  history: TradeMarketResult;
  nextFrame: ReturnType<typeof replayFrame<ChartExecution>>;
  /** The chart's picture goes with an AI critique of this trade while it is shown. */
  tradeKey: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<Vela | null>(null);
  const frame = useRef(nextFrame);
  const latest = useRef(nextFrame);
  latest.current = nextFrame;
  const update = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    setError("");
    void (async () => {
      const { Vela, registerNativeIndicator, unregisterNativeIndicator } =
        await import("@luxalgo/vela");
      if (disposed || !host.current) return;
      const type = `replay-fills-${crypto.randomUUID()}`;
      registerNativeIndicator({
        type,
        title: "Recorded fills",
        paneHint: "price",
        overlay: true,
        inputsSchema: () => [],
        defaultInputs: () => ({}),
        create: () => ({
          start(ctx) {
            ctx.emit({
              labels: frame.current.fills.map((fill, index) => ({
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
            ctx.setStatus("idle");
          },
          onBars() {},
          onViewport() {},
          setInputs() {},
          suspend() {},
          resume() {},
          stop() {},
        }),
      });
      const dark = () => document.documentElement.classList.contains("dark");
      const instance = new Vela(host.current, {
        symbol: history.symbol,
        timeframe: VELA_TIMEFRAME[history.resolution],
        data: latest.current.bars,
        live: false,
        height: 420,
        theme: dark() ? "dark" : "light",
        priceStyle: "candles",
        volume: true,
        drawings: false,
      });
      chart.current = instance;
      const unregister = registerTradeSnapshot(tradeKey, () => instance.renderer.screenshot());
      frame.current = latest.current;
      instance.addNativeIndicator(type);
      let updating = false;
      // Coalesce rapid scrubbing/ticks instead of queuing expensive Vela reloads.
      const flush = async () => {
        if (updating || disposed) return;
        updating = true;
        try {
          do {
            frame.current = latest.current;
            await instance.setMarket({ data: frame.current.bars });
          } while (!disposed && frame.current !== latest.current);
        } catch {
          if (!disposed) setError("The replay chart could not be updated.");
        } finally {
          updating = false;
        }
      };
      update.current = () => {
        void flush();
      };
      const observer = new MutationObserver(() => instance.setTheme(dark() ? "dark" : "light"));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      cleanup = () => {
        update.current = null;
        unregister();
        observer.disconnect();
        instance.destroy();
        unregisterNativeIndicator(type);
        if (chart.current === instance) chart.current = null;
      };
    })().catch(() => {
      if (!disposed) setError("The historical chart could not be rendered.");
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [history]);
  useEffect(() => {
    update.current?.();
  }, [nextFrame, history]);
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
