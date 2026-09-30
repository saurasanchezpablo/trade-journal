"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useFilters } from "@/components/filter-bar";
import { Pnl } from "@/components/pnl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { Skeleton } from "@/components/ui/skeleton";
import { localInput, zonedTime } from "@/lib/backtest-replay";
import {
  DEFAULT_SESSION_SETTINGS,
  type BacktestSession,
  type BacktestSessionSummary,
} from "@/lib/backtest-session";
import { RESOLUTIONS, type MarketConnection, type Resolution } from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import { parseDecimalInput } from "@/lib/number-input";
import { formatTimestamp } from "@/lib/timezone";
import { postJson, useApi } from "@/lib/use-api";
import { fmtPercent } from "@/lib/utils";

/** Your replay sessions, and the form that starts one. */
export function SessionList() {
  const { data, error, refresh } = useApi<{ sessions: BacktestSessionSummary[] }>("/api/backtests");
  const { timeZone } = useFilters();
  const [creating, setCreating] = useState(false);
  const when = (time: number) =>
    formatTimestamp(new Date(time).toISOString(), timeZone).slice(0, 16);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating((v) => !v)}>
          <Plus />
          New replay session
        </Button>
      </div>
      {creating && <NewSession onCancel={() => setCreating(false)} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <Skeleton className="h-32" />}
      {data?.sessions.length === 0 && !creating && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No backtests yet. Start a replay session on any symbol and date your market data sources
          cover.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.sessions.map((session) => (
          <Card key={session.id}>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="truncate text-base normal-case tracking-normal">
                  <Link href={`/backtest/${session.id}`} className="hover:underline">
                    {session.name}
                  </Link>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {session.symbol} · {providerInfo(session.provider)?.name ?? session.provider} ·{" "}
                  {session.resolution}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                aria-label={`Delete backtest ${session.name}`}
                onClick={async () => {
                  if (!confirm(`Delete "${session.name}" and its trades?`)) return;
                  try {
                    await postJson(`/api/backtests/${session.id}`, undefined, "DELETE");
                  } catch (cause) {
                    alert(cause instanceof Error ? cause.message : "Could not delete the session.");
                  }
                  refresh();
                }}
              >
                <Trash2 />
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Net</p>
                <Pnl value={session.netProfit} currency={session.currency} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Trades</p>
                <p className="tnum">
                  {session.trades}
                  {session.open ? " + open" : ""}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Win rate</p>
                <p className="tnum">{fmtPercent(session.winRate)}</p>
              </div>
              <p className="col-span-3 text-xs text-muted-foreground">
                From {when(session.startAt)}, now at {when(session.cursorAt)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function NewSession({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { timeZone } = useFilters();
  const { data } = useApi<{ connections: MarketConnection[] }>("/api/market-data/connections");
  const sources = (data?.connections ?? []).filter((c) => c.configured);
  const [provider, setProvider] = useState("");
  const [dataset, setDataset] = useState("");
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState<Resolution>("15m");
  const [start, setStart] = useState(() => localInput(Date.now() - 30 * 86_400_000, timeZone));
  const [name, setName] = useState("");
  const [balance, setBalance] = useState(String(DEFAULT_SESSION_SETTINGS.initialBalance));
  const [currency, setCurrency] = useState("USD");
  const [risk, setRisk] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const info = providerInfo(provider);
  const chosen = provider || sources[0]?.id || "";

  const create = async () => {
    setError("");
    const startAt = zonedTime(start, timeZone);
    const initialBalance = parseDecimalInput(balance);
    const riskValue = parseDecimalInput(risk);
    if (!chosen) return setError("Enable a market data source in Settings first.");
    if (!symbol.trim()) return setError("Enter the source's symbol.");
    if (startAt === null) return setError("Choose where the replay starts.");
    if (!initialBalance || !riskValue)
      return setError("Enter the starting balance and the risk per trade.");
    setBusy(true);
    try {
      const { session } = await postJson<{ session: BacktestSession }>("/api/backtests", {
        name: name.trim() || `${symbol.trim()} ${resolution} from ${start.slice(0, 10)}`,
        provider: chosen,
        dataset: dataset || null,
        symbol: symbol.trim(),
        resolution,
        startAt,
        settings: {
          ...DEFAULT_SESSION_SETTINGS,
          initialBalance,
          currency: currency.trim().toUpperCase(),
          riskValue,
        },
      });
      router.push(`/backtest/${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the session.");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New replay session</CardTitle>
      </CardHeader>
      <CardContent>
        {data && !sources.length ? (
          <p className="text-sm">
            Enable a market data source first:{" "}
            <Link className="underline" href="/settings#market-data">
              Settings → Market data
            </Link>
            . Binance, Bybit, OKX, Kraken, Coinbase, Nasdaq and Yahoo Finance need no key.
          </p>
        ) : (
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div>
              <label htmlFor="new-bt-source" className="text-xs text-muted-foreground">
                Source
              </label>
              <OptionSelect
                id="new-bt-source"
                aria-label="Source"
                value={chosen}
                onValueChange={(value) => {
                  setProvider(value);
                  setDataset("");
                }}
              >
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </OptionSelect>
            </div>
            {(providerInfo(chosen)?.datasets?.length ?? 0) > 0 && (
              <div>
                <label htmlFor="new-bt-dataset" className="text-xs text-muted-foreground">
                  Market
                </label>
                <OptionSelect
                  id="new-bt-dataset"
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
              <label htmlFor="new-bt-symbol" className="text-xs text-muted-foreground">
                Symbol
              </label>
              <Input
                id="new-bt-symbol"
                value={symbol}
                placeholder="BTCUSDT, EURUSD=X, AAPL…"
                onChange={(event) => setSymbol(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="new-bt-resolution" className="text-xs text-muted-foreground">
                Candles
              </label>
              <OptionSelect
                id="new-bt-resolution"
                aria-label="Candles"
                value={resolution}
                onValueChange={(value) => setResolution(value as Resolution)}
              >
                {(Object.keys(RESOLUTIONS) as Resolution[])
                  .filter((r) => r !== "1w")
                  .map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
              </OptionSelect>
            </div>
            <div>
              <label htmlFor="new-bt-start" className="text-xs text-muted-foreground">
                Start ({timeZone})
              </label>
              <Input
                id="new-bt-start"
                type="datetime-local"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="new-bt-name" className="text-xs text-muted-foreground">
                Name (optional)
              </label>
              <Input
                id="new-bt-name"
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="new-bt-balance" className="text-xs text-muted-foreground">
                Starting balance
              </label>
              <Input
                id="new-bt-balance"
                inputMode="decimal"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="new-bt-currency" className="text-xs text-muted-foreground">
                  Currency
                </label>
                <Input
                  id="new-bt-currency"
                  value={currency}
                  maxLength={3}
                  onChange={(event) => setCurrency(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="new-bt-risk" className="text-xs text-muted-foreground">
                  Risk (%)
                </label>
                <Input
                  id="new-bt-risk"
                  inputMode="decimal"
                  value={risk}
                  onChange={(event) => setRisk(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              {info?.symbolHint ?? providerInfo(chosen)?.symbolHint} Commission, slippage, the lot
              size and a contract multiplier are set in the session&apos;s settings.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-4">
                {error}
              </p>
            )}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={busy}>
                {busy ? "Starting…" : "Start replay"}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
