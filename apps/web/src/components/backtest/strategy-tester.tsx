"use client";

import { useEffect, useRef, useState } from "react";
import type { StrategyState, StrategyTrade, Vela } from "@luxalgo/vela";
import { backtestReport, type BacktestReport } from "@luxalgo/journal-core";
import { useFilters } from "@/components/filter-bar";
import { Pnl } from "@/components/pnl";
import { MonetaryValue } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { localInput, zonedTime } from "@/lib/backtest-replay";
import { EXAMPLE_STRATEGIES } from "@/lib/backtest-strategies";
import { VELA_TIMEFRAME, maxSpanMs } from "@/lib/chart-analysis";
import { FallbackPineEngine } from "@/lib/pine-fallback-engine";
import {
  RESOLUTIONS,
  type MarketBar,
  type MarketConnection,
  type MarketHistory,
  type Resolution,
} from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import { formatTimestamp } from "@/lib/timezone";
import { postJson, useApi } from "@/lib/use-api";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";
import { clipOffscreenDashes } from "../vela-dash-fix";
import { limitChartView } from "../vela-view-limits";
import { BacktestReportView } from "./backtest-report";

const FIAT = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"]);
const MAX_BARS = 20_000;

interface Result {
  bars: MarketBar[];
  currency: string;
  state: StrategyState;
  trades: readonly StrategyTrade[];
  report: BacktestReport;
  buyHold: number | null;
}

/** Index of the first candle at or after `time` (bars ascending). */
const indexAt = (bars: readonly MarketBar[], time: number) => {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** Closed strategy trades in the report's terms: net result, commission, candles held. */
export function strategyReport(
  trades: readonly StrategyTrade[],
  bars: readonly MarketBar[],
  initialCapital: number,
): BacktestReport {
  const closed = trades.filter((t) => !t.open && t.exit && typeof t.pnl === "number");
  return backtestReport(
    closed.map((t) => ({
      netPnl: t.pnl!,
      r: null,
      side: t.side,
      fees: t.commission ?? 0,
      bars: Math.max(0, indexAt(bars, t.exit!.time) - indexAt(bars, t.entry.time)),
      exitTime: t.exit!.time,
      ambiguous: false,
    })),
    initialCapital,
  );
}

/** Run a Pine Script strategy over a date range and read its results like a tester. */
export function StrategyTester() {
  const { timeZone } = useFilters();
  const { data } = useApi<{ connections: MarketConnection[] }>("/api/market-data/connections");
  const { data: scripts } = useApi<{ scripts: { id: string; name: string; source: string }[] }>(
    "/api/chart-scripts",
  );
  const sources = (data?.connections ?? []).filter((c) => c.configured);
  const [provider, setProvider] = useState("");
  const chosen = provider || sources[0]?.id || "";
  const [dataset, setDataset] = useState("");
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1h");
  const [from, setFrom] = useState(() => localInput(Date.now() - 180 * 86_400_000, timeZone));
  const [to, setTo] = useState(() => localInput(Date.now(), timeZone));
  const [scriptKey, setScriptKey] = useState(EXAMPLE_STRATEGIES[0]!.key);
  const [source, setSource] = useState(EXAMPLE_STRATEGIES[0]!.source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bars, setBars] = useState<MarketBar[] | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [result, setResult] = useState<Result | null>(null);
  const runId = useRef(0);

  const pickScript = (key: string) => {
    setScriptKey(key);
    const example = EXAMPLE_STRATEGIES.find((s) => s.key === key);
    const saved = scripts?.scripts.find((s) => `saved:${s.id}` === key);
    const next = example?.source ?? saved?.source;
    if (next) setSource(next);
  };

  const run = async () => {
    setError("");
    setResult(null);
    const start = zonedTime(from, timeZone);
    const end = zonedTime(to, timeZone);
    if (!chosen) return setError("Enable a market data source in Settings first.");
    if (!symbol.trim()) return setError("Enter the source's symbol.");
    if (start === null || end === null || start >= end)
      return setError("Choose a start before the end.");
    if ((end - start) / RESOLUTIONS[resolution] > MAX_BARS)
      return setError(
        `That range holds more than ${MAX_BARS.toLocaleString("en-US")} candles. Shorten it or choose larger candles.`,
      );
    if (!/\bstrategy\s*\(/.test(source))
      return setError("This is not a strategy: the script needs a strategy(...) declaration.");
    setBusy(true);
    const id = ++runId.current;
    try {
      const loaded: MarketBar[] = [];
      let quote: string | undefined;
      const span = maxSpanMs(resolution);
      for (let s = start; s < end; s += span) {
        const history = await postJson<MarketHistory>("/api/market-data/history", {
          provider: chosen,
          symbol: symbol.trim(),
          dataset: dataset || null,
          resolution,
          from: s,
          to: Math.min(end, s + span),
        });
        quote ??= history.quoteCurrency;
        loaded.push(...history.bars);
      }
      if (id !== runId.current) return;
      const finished = loaded.filter((bar) => bar.time + RESOLUTIONS[resolution] <= Date.now());
      if (finished.length < 50) {
        setBusy(false);
        return setError("Fewer than 50 candles in that range: widen it or check the symbol.");
      }
      setCurrency(quote && FIAT.has(quote) ? quote : "USD");
      setBars(finished);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "The candles could not be loaded.");
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Strategy tester</CardTitle>
        </CardHeader>
        <CardContent>
          {data && !sources.length ? (
            <p className="text-sm">Enable a market data source in Settings → Market data first.</p>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              <div>
                <label htmlFor="st-source" className="text-xs text-muted-foreground">
                  Source
                </label>
                <OptionSelect
                  id="st-source"
                  aria-label="Source"
                  value={chosen}
                  onValueChange={(v) => {
                    setProvider(v);
                    setDataset("");
                  }}
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </OptionSelect>
              </div>
              {(providerInfo(chosen)?.datasets?.length ?? 0) > 0 && (
                <div>
                  <label htmlFor="st-dataset" className="text-xs text-muted-foreground">
                    Market
                  </label>
                  <OptionSelect
                    id="st-dataset"
                    aria-label="Market"
                    value={dataset}
                    onValueChange={setDataset}
                  >
                    {providerInfo(chosen)!.datasets!.map((item) => (
                      <option key={item.value} value={item.value} disabled={!item.value}>
                        {item.label}
                      </option>
                    ))}
                  </OptionSelect>
                </div>
              )}
              <div>
                <label htmlFor="st-symbol" className="text-xs text-muted-foreground">
                  Symbol
                </label>
                <Input
                  id="st-symbol"
                  value={symbol}
                  placeholder="BTCUSDT"
                  onChange={(e) => setSymbol(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="st-resolution" className="text-xs text-muted-foreground">
                  Candles
                </label>
                <OptionSelect
                  id="st-resolution"
                  aria-label="Candles"
                  value={resolution}
                  onValueChange={(v) => setResolution(v as Resolution)}
                >
                  {(Object.keys(RESOLUTIONS) as Resolution[]).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </OptionSelect>
              </div>
              <div>
                <label htmlFor="st-from" className="text-xs text-muted-foreground">
                  From ({timeZone})
                </label>
                <Input
                  id="st-from"
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="st-to" className="text-xs text-muted-foreground">
                  To
                </label>
                <Input
                  id="st-to"
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="st-script" className="text-xs text-muted-foreground">
                  Strategy
                </label>
                <OptionSelect
                  id="st-script"
                  aria-label="Strategy"
                  value={scriptKey}
                  onValueChange={pickScript}
                >
                  {EXAMPLE_STRATEGIES.map((s) => (
                    <option key={s.key} value={s.key}>
                      Example: {s.name}
                    </option>
                  ))}
                  {(scripts?.scripts ?? [])
                    .filter((s) => /\bstrategy\s*\(/.test(s.source))
                    .map((s) => (
                      <option key={s.id} value={`saved:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                </OptionSelect>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label htmlFor="st-code" className="text-xs text-muted-foreground">
                  Pine Script (capital, sizing and commission are in its strategy() line)
                </label>
                <textarea
                  id="st-code"
                  spellCheck={false}
                  className="min-h-48 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
                  {error}
                </p>
              )}
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit" disabled={busy}>
                  {busy ? "Running…" : "Run the strategy"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      {bars && (
        <StrategyChart
          key={runId.current}
          bars={bars}
          resolution={resolution}
          symbol={symbol.trim()}
          source={source}
          onDone={(outcome) => {
            setBusy(false);
            if ("error" in outcome) return setError(outcome.error);
            const first = bars[0]!.close;
            const last = bars.at(-1)!.close;
            setResult({
              bars,
              currency,
              state: outcome.state,
              trades: outcome.trades,
              report: strategyReport(outcome.trades, bars, outcome.state.initialCapital),
              buyHold: first > 0 ? (last - first) / first : null,
            });
          }}
        />
      )}
      {result && <StrategyResults result={result} timeZone={timeZone} />}
    </div>
  );
}

function StrategyChart({
  bars,
  resolution,
  symbol,
  source,
  onDone,
}: {
  bars: MarketBar[];
  resolution: Resolution;
  symbol: string;
  source: string;
  onDone: (
    outcome: { state: StrategyState; trades: readonly StrategyTrade[] } | { error: string },
  ) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let disposed = false;
    const teardown: (() => void)[] = [];
    void (async () => {
      const [{ Vela }, { PineEngine, PineWorkerEngine }] = await Promise.all([
        import("@luxalgo/vela"),
        import("@luxalgo/vela-pinets"),
      ]);
      if (disposed || !host.current) return;
      const dark = document.documentElement.classList.contains("dark");
      const chart: Vela = new Vela(host.current, {
        symbol,
        timeframe: VELA_TIMEFRAME[resolution],
        data: bars,
        live: false,
        theme: dark ? "dark" : "light",
        priceStyle: "candles",
        volume: true,
        drawings: false,
      });
      teardown.push(() => chart.destroy());
      clipOffscreenDashes(chart.renderer);
      limitChartView(chart.renderer);
      const engine = new FallbackPineEngine(
        new PineWorkerEngine({ props: "strategy" }),
        () => new PineEngine({ props: "strategy" }),
      );
      teardown.push(() => engine.terminate());
      chart.registerEngine("pine", engine);
      await chart.ready();
      const outcome = await chart.runScript(source);
      if (disposed) return;
      if (!outcome.ok || !outcome.run)
        return done.current({ error: outcome.error?.message ?? "The strategy did not run." });
      if (outcome.run.kind !== "strategy" || !outcome.run.strategy)
        return done.current({
          error: "This script ran as an indicator: declare it with strategy(...).",
        });
      const trades = await outcome.run.trades();
      if (!disposed) done.current({ state: outcome.run.strategy, trades });
    })().catch((cause: unknown) => {
      if (!disposed)
        done.current({
          error: cause instanceof Error ? cause.message : "The strategy did not run.",
        });
    });
    return () => {
      disposed = true;
      for (const undo of teardown.reverse()) undo();
    };
  }, [bars, resolution, symbol, source]);
  return <div ref={host} className="h-[460px] overflow-hidden rounded-lg border" />;
}

function StrategyResults({ result, timeZone }: { result: Result; timeZone: string }) {
  const { report, state, trades, currency } = result;
  const when = (time: number) =>
    formatTimestamp(new Date(time).toISOString(), timeZone).slice(0, 16);
  const open = trades.filter((t) => t.open);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Performance summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {result.bars.length.toLocaleString()} candles, {when(result.bars[0]!.time)} to{" "}
            {when(result.bars.at(-1)!.time)} ({timeZone}). Buy and hold over the same candles:{" "}
            {result.buyHold === null
              ? "–"
              : `${result.buyHold > 0 ? "+" : ""}${fmtPercent(result.buyHold)}`}
            .{open.length > 0 && ` ${open.length} trade still open at the end, not counted.`} Max
            run-up <MonetaryValue>{fmtMoney(state.maxRunup, currency)}</MonetaryValue>.
          </p>
          <BacktestReportView
            report={report}
            currency={currency}
            initialBalance={state.initialCapital}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>List of trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="text-left">
                  {["#", "Side", "Entry", "Exit", "Qty", "Net", "Run-up", "Drawdown"].map(
                    (label) => (
                      <th key={label} className="py-1.5 pr-3 font-normal">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="tnum">
                {[...trades].reverse().map((t, i) => (
                  <tr key={t.id} className="border-t align-top">
                    <td className="py-1.5 pr-3 text-muted-foreground">{trades.length - i}</td>
                    <td
                      className={`py-1.5 pr-3 ${t.side === "long" ? "text-profit" : "text-loss"}`}
                    >
                      {t.side === "long" ? "Long" : "Short"}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      {when(t.entry.time)} · {fmtNumber(t.entry.price, 6)}
                      <span className="block text-muted-foreground">{t.entry.id}</span>
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      {t.exit ? `${when(t.exit.time)} · ${fmtNumber(t.exit.price, 6)}` : "Open"}
                      {t.exit && <span className="block text-muted-foreground">{t.exit.id}</span>}
                    </td>
                    <td className="py-1.5 pr-3">{fmtNumber(t.qty, 6)}</td>
                    <td className="py-1.5 pr-3">
                      {typeof t.pnl === "number" ? <Pnl value={t.pnl} currency={currency} /> : "–"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {typeof t.maxRunup === "number" ? (
                        <MonetaryValue>{fmtMoney(t.maxRunup, currency)}</MonetaryValue>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="py-1.5">
                      {typeof t.maxDrawdown === "number" ? (
                        <MonetaryValue>{fmtMoney(-t.maxDrawdown, currency)}</MonetaryValue>
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
