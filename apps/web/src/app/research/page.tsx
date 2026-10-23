"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { Download, FlaskConical, Play, RotateCcw, Square } from "lucide-react";
import {
  CATEGORY_LABELS,
  type ResearchOverview,
  type StrategyOverview,
} from "@/lib/strategy-research";
import { postJson, useApi } from "@/lib/use-api";
import { fmtPercent } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import { CategorySharpeBars } from "@/components/strategy-research/charts";
import {
  VerdictBadge,
  describeWeights,
  loss,
  ratio,
  signed,
  useDay,
} from "@/components/strategy-research/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ResearchPage() {
  return (
    <Suspense>
      <Research />
    </Suspense>
  );
}

function Research() {
  const { t } = useI18n();
  const { data, error, refresh } = useApi<ResearchOverview>("/api/research");
  const running = data?.state.running ?? null;
  // Follow a download or a research run while it goes on.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [running, refresh]);

  return (
    <div>
      <FilterBar title="Strategy research" />
      <div className="space-y-4 p-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "Trading strategies chosen from published evidence, tested on Binance's daily history after costs, and judged against a standard declared before the results. In-sample, walk-forward, holdout and paper results are kept apart.",
          )}
        </p>
        <p
          role="note"
          className="max-w-3xl rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          {t(
            "Research and paper trading only: no order is ever placed and no exchange account is used. Past results, even out of sample, do not promise future returns. Nothing here is investment advice.",
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <Controls data={data} refresh={refresh} />
            <Tabs defaultValue="strategies">
              <TabsList>
                <TabsTrigger value="strategies">{t("Strategies")}</TabsTrigger>
                <TabsTrigger value="paper">{t("Paper trading")}</TabsTrigger>
                <TabsTrigger value="method">{t("Method")}</TabsTrigger>
                <TabsTrigger value="data">{t("Data")}</TabsTrigger>
              </TabsList>
              <TabsContent value="strategies" className="mt-4 space-y-4">
                <Summary data={data} />
                <StrategiesTable strategies={data.strategies} />
                <Card>
                  <CardHeader>
                    <CardTitle>{t("Sharpe ratio by kind of evidence")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "In-sample bars are the highest by construction: each is the best of several configurations, measured on the days it was chosen on. Walk-forward and holdout show what was left on days no choice saw.",
                      )}
                    </p>
                    <CategorySharpeBars strategies={data.strategies} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="paper" className="mt-4">
                <Paper data={data} />
              </TabsContent>
              <TabsContent value="method" className="mt-4">
                <Method data={data} />
              </TabsContent>
              <TabsContent value="data" className="mt-4">
                <Data data={data} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

function Controls({ data, refresh }: { data: ResearchOverview; refresh: () => void }) {
  const { t, intl } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [costs, setCosts] = useState({
    spotFeeBps: String(data.settings.spotFeeBps),
    perpFeeBps: String(data.settings.perpFeeBps),
    slippageBps: String(data.settings.slippageBps),
    cashRatePct: String(data.settings.cashRatePct),
  });
  const act = async (action: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await postJson("/api/research/actions", { action });
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await postJson(
        "/api/research",
        Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, Number(v)])),
        "PUT",
      );
      setMessage(t("Saved. Run the research again to apply the new costs."));
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" })
      : t("never");
  const { state, settings } = data;
  const errors = Object.entries(state.errors).filter(([, v]) => v);
  const running = state.running;
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || Boolean(running)}
            onClick={() => act("refresh")}
          >
            <Download className="size-4" aria-hidden />
            {t("Download new data")}
          </Button>
          <Button size="sm" disabled={busy || Boolean(running)} onClick={() => act("research")}>
            <FlaskConical className="size-4" aria-hidden />
            {t("Download and run the research")}
          </Button>
          {settings.monitoring ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("stop")}>
              <Square className="size-4" aria-hidden />
              {t("Stop monitoring")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act("start")}>
              <Play className="size-4" aria-hidden />
              {t("Start monitoring and paper trading")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(t("Forget every recorded signal and start the paper ledger again?"))
              )
                void act("reset-paper");
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            {t("Reset paper ledger")}
          </Button>
        </div>
        <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <span>
            {t("Status")}:{" "}
            <span className="text-foreground">
              {running === "refresh"
                ? t("downloading data…")
                : running === "research"
                  ? t("running the research…")
                  : running === "monitor"
                    ? t("recording signals…")
                    : settings.monitoring
                      ? t("monitoring (checked every 10 minutes)")
                      : t("idle")}
            </span>
          </span>
          <span>
            {t("Data downloaded")}: {when(state.lastRefreshAt)}
          </span>
          <span>
            {t("Research run")}: {when(state.lastResearchAt)}
          </span>
          <span>
            {t("Signals checked")}: {when(state.lastMonitorAt)}
          </span>
        </div>
        {state.stale.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {t("Stale data, signals skipped for: {list}", { list: state.stale.join(", ") })}
          </p>
        )}
        {errors.map(([step, text]) => (
          <p key={step} role="alert" className="text-sm text-destructive">
            {t("Last {step} failed: {text}", { step: t(step), text: text ?? "" })}
          </p>
        ))}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {t("Cost assumptions")}
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {(
              [
                ["spotFeeBps", t("Spot fee (bp)")],
                ["perpFeeBps", t("Perpetual fee (bp)")],
                ["slippageBps", t("Slippage per side (bp)")],
                ["cashRatePct", t("Cash rate (% a year)")],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`cost-${key}`}>{label}</Label>
                <Input
                  id={`cost-${key}`}
                  type="number"
                  min={0}
                  step="0.5"
                  className="w-32"
                  value={costs[key]}
                  onChange={(e) => setCosts((c) => ({ ...c, [key]: e.target.value }))}
                />
              </div>
            ))}
            <Button size="sm" variant="outline" disabled={busy} onClick={save}>
              {t("Save")}
            </Button>
          </div>
          <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
            {t(
              "Defaults: Binance taker fees for a regular account (spot 0.10%, USD-M futures 0.05%) and 5 bp slippage, conservative for BTC and ETH. The cash rate is an assumption (about the 2019 to 2025 average 3-month US Treasury bill yield): idle capital earns it and every Sharpe ratio is measured against it.",
            )}
          </p>
        </details>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}

function Summary({ data }: { data: ResearchOverview }) {
  const { t } = useI18n();
  const candidates = data.strategies.filter((s) => s.role === "candidate");
  const run = candidates.filter((s) => s.verdict);
  if (!run.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          "No research yet: download the data and run the research (about a minute the first time).",
        )}
      </p>
    );
  const meets = run.filter((s) => s.verdict === "meets-standard").length;
  return (
    <p className="max-w-3xl text-sm">
      {meets === 0
        ? t(
            "None of the {n} candidates meets the evidence standard: all are experimental. Their signals can be monitored and paper traded, but no result here establishes an edge.",
            { n: run.length },
          )
        : t(
            "{meets} of {n} candidates meet the evidence standard (still research, not a promise of returns).",
            {
              meets,
              n: run.length,
            },
          )}
    </p>
  );
}

function StrategiesTable({ strategies }: { strategies: StrategyOverview[] }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Strategy")}</TableHead>
              <TableHead>{t("Verdict")}</TableHead>
              <TableHead>{t("Configuration chosen")}</TableHead>
              <TableHead className="text-right">{t("In-sample Sharpe")}</TableHead>
              <TableHead className="text-right">{t("Deflated Sharpe")}</TableHead>
              <TableHead className="text-right">{t("PBO")}</TableHead>
              <TableHead className="text-right">{t("Walk-forward Sharpe")}</TableHead>
              <TableHead className="text-right">{t("vs benchmark")}</TableHead>
              <TableHead className="text-right">{t("Walk-forward max DD")}</TableHead>
              <TableHead className="text-right">{t("Holdout return")}</TableHead>
              <TableHead className="text-right">{t("Trials")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strategies.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    href={`/research/${s.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {t(s.name)}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {s.role === "benchmark" ? t("benchmark") : t(s.family)}
                  </div>
                </TableCell>
                <TableCell>
                  <VerdictBadge verdict={s.verdict} />
                </TableCell>
                <TableCell className="min-w-48 max-w-64 whitespace-normal text-sm">
                  {s.selected ? t(s.selected.label) : "–"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ratio(s.inSample?.sharpe)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.role === "benchmark" ? "–" : fmtPercent(s.deflatedSharpe, 1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{ratio(s.pbo)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {ratio(s.walkForward?.sharpe)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {s.role === "benchmark"
                    ? "–"
                    : s.benchmark === "cash"
                      ? t("cash (0)")
                      : ratio(s.walkForward?.benchmarkSharpe)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {loss(s.walkForward?.maxDrawdown)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {signed(s.holdout?.totalReturn)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.trials.distinct || s.grid.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Paper({ data }: { data: ResearchOverview }) {
  const { t } = useI18n();
  const day = useDay();
  if (!data.settings.monitoring && !data.strategies.some((s) => s.latestSignal))
    return (
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t(
          "Paper trading starts when monitoring starts: each day after the close, every strategy's frozen configuration decides, the decision is recorded once and never rewritten, and the paper ledger replays the recorded signals at the next open. Nothing that happened before that day is ever counted.",
        )}
      </p>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(CATEGORY_LABELS.paper.label)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        <p className="text-sm text-muted-foreground">
          {t(
            "Since {date}. A few days or weeks of paper results say almost nothing about a strategy: read them as a check that the signals and the accounting work, not as evidence.",
            {
              date: data.state.monitoringSince ? day(Date.parse(data.state.monitoringSince)) : "–",
            },
          )}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Strategy")}</TableHead>
              <TableHead>{t("Current signal")}</TableHead>
              <TableHead>{t("Decided on")}</TableHead>
              <TableHead className="text-right">{t("Paper days")}</TableHead>
              <TableHead className="text-right">{t("Paper return")}</TableHead>
              <TableHead className="text-right">{t("Max drawdown")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.strategies.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/research/${s.id}`} className="font-medium hover:underline">
                    {t(s.name)}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">
                  {s.latestSignal ? describeWeights(s.latestSignal.weights, t) : t("no signal yet")}
                  {s.latestSignal?.changed && (
                    <span className="ml-2 text-xs text-muted-foreground">({t("changed")})</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{day(s.latestSignal?.decisionTime)}</TableCell>
                <TableCell className="text-right tabular-nums">{s.paper?.days ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {signed(s.paper?.totalReturn)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {loss(s.paper?.maxDrawdown)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Method({ data }: { data: ResearchOverview }) {
  const { t } = useI18n();
  const day = useDay();
  const s = data.standard;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("How a strategy is tested")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {t(
                "Each strategy decides at the close of a day with only the candles (and funding) up to that close, and trades at the next day's open. Returns run from open to open.",
              )}
            </li>
            <li>
              {t(
                "Every trade pays commission and slippage; positions drift with prices, so holding a weight also trades. Perpetual shorts receive (or pay) the funding actually paid on Binance. Idle capital earns the cash rate.",
              )}
            </li>
            <li>
              {t(
                "In-sample: every configuration of the strategy's small, pre-declared grid runs on the days before the holdout ({date}); the best Sharpe ratio is chosen.",
                { date: day(data.holdoutFrom) },
              )}
            </li>
            <li>
              {t(
                "Walk-forward: every 90 days, the configuration with the best Sharpe over the previous 730 days trades the next 90. Only before the holdout.",
              )}
            </li>
            <li>
              {t(
                "Holdout: the in-sample choice, frozen, on the days from {date}, which no choice ever saw.",
                { date: day(data.holdoutFrom) },
              )}
            </li>
            <li>
              {t(
                "Paper: from the day monitoring starts, the recorded daily signals of the frozen configuration, replayed at the next open with the same accounting.",
              )}
            </li>
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("The evidence standard (declared before the results)")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              {t("At least {years} years before the holdout and {days} days of holdout.", {
                years: s.minInSampleDays / 365,
                days: s.minHoldoutDays,
              })}
            </li>
            <li>
              {t(
                "Deflated Sharpe ratio at least {v}: the probability that the chosen configuration's Sharpe ratio beats the best that luck would give over the number of configurations tried.",
                { v: s.minDeflatedSharpe },
              )}
            </li>
            <li>
              {t(
                "Probability of backtest overfitting at most {v}: how often the best configuration on half of the history ranks below the median on the other half (combinatorially symmetric cross-validation).",
                { v: s.maxPbo },
              )}
            </li>
            <li>
              {t("Walk-forward Sharpe ratio above 0, with the bootstrap's 95% interval above 0.")}
            </li>
            <li>
              {t(
                "Walk-forward Sharpe ratio above the benchmark's over the same days (BTC held; cash for the market-neutral carry).",
              )}
            </li>
            <li>{t("Holdout return after costs above what cash earned over the same days.")}</li>
          </ul>
          <p className="text-muted-foreground">
            {t(
              "Passing everything: meets the standard. Positive out of sample but failing a criterion: experimental. Not better than cash out of sample: rejected.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Versions: engine {engine}, catalog {catalog}, evaluation {evaluation}.",
              data.versions,
            )}
          </p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("What the categories mean")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {Object.values(CATEGORY_LABELS).map((c) => (
              <div key={c.label}>
                <dt className="font-medium">{t(c.label)}</dt>
                <dd className="text-muted-foreground">{t(c.detail)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "The full method, formulas, sources and limitations are in docs/trading/ in the journal's repository.",
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Data({ data }: { data: ResearchOverview }) {
  const { t, intl } = useI18n();
  const day = useDay();
  if (!data.series.length)
    return <p className="text-sm text-muted-foreground">{t("No data downloaded yet.")}</p>;
  return (
    <Card>
      <CardContent className="space-y-3 overflow-x-auto pt-6">
        <p className="text-sm text-muted-foreground">
          {t(
            "Public, keyless Binance endpoints; only closed daily candles are stored. Each refresh asks only for what is newer, spaced well under the published rate limits.",
          )}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Series")}</TableHead>
              <TableHead>{t("Source")}</TableHead>
              <TableHead>{t("From")}</TableHead>
              <TableHead>{t("To")}</TableHead>
              <TableHead className="text-right">{t("Rows")}</TableHead>
              <TableHead>{t("Retrieved")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.series.map((s) => (
              <TableRow key={s.series}>
                <TableCell className="font-mono text-xs">{s.series}</TableCell>
                <TableCell className="font-mono text-xs">{s.endpoint}</TableCell>
                <TableCell>{day(s.firstTime)}</TableCell>
                <TableCell>{day(s.lastTime)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.rows.toLocaleString(intl)}
                </TableCell>
                <TableCell>
                  {new Date(s.retrievedAt).toLocaleString(intl, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
