"use client";

import { BetaGate } from "@/components/beta";
import Link from "next/link";
import { Suspense, use, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { research } from "@luxalgo/journal-core";
import { CATEGORY_LABELS, type StrategyDetail } from "@/lib/strategy-research";
import { useApi } from "@/lib/use-api";
import { fmtPercent } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import {
  ConfigSharpeBars,
  EquityChart,
  FoldsChart,
  RegimeBars,
} from "@/components/strategy-research/charts";
import {
  CategoryBadge,
  CriteriaList,
  MetricsTable,
  VerdictBadge,
  describeWeights,
  loss,
  ratio,
  useDay,
} from "@/components/strategy-research/parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OptionSelect } from "@/components/ui/option-select";
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

export default function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <BetaGate feature="strategyResearch">
      <Suspense>
        <Strategy id={id} />
      </Suspense>
    </BetaGate>
  );
}

function Strategy({ id }: { id: string }) {
  const { t } = useI18n();
  const { data, error } = useApi<StrategyDetail>(`/api/research/${encodeURIComponent(id)}`);
  return (
    <div>
      <FilterBar title="Strategy research" />
      <div className="space-y-4 p-4">
        <Link
          href="/research"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("All strategies")}
        </Link>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!data ? <Skeleton className="h-64 w-full" /> : <Detail data={data} />}
      </div>
    </div>
  );
}

function Detail({ data }: { data: StrategyDetail }) {
  const { t } = useI18n();
  const { strategy, report } = data;
  const benchmarkLabel =
    strategy.role === "benchmark" ? undefined : t("BTC buy and hold (same days)");
  const cashBenchmark = strategy.benchmark === "cash";
  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{t(strategy.name)}</h2>
          <VerdictBadge verdict={report?.verdict ?? null} />
        </div>
        <p className="max-w-3xl text-sm">
          <span className="font-medium">{t("Hypothesis")}:</span> {t(strategy.hypothesis)}
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">
          <span className="font-medium">{t("Why it can fail")}:</span> {t(strategy.risk)}
        </p>
        {cashBenchmark && (
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t(
              "A market-neutral book: it is judged against cash (its Sharpe ratio is already measured against the cash rate). BTC is shown only for scale.",
            )}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("Instruments")}: {strategy.instruments.join(", ")}
          {report && (
            <>
              {" · "}
              {t(
                "Costs: spot {spot} bp, perpetual {perp} bp, slippage {slip} bp, cash {cash} a year",
                {
                  spot: report.costs.feeBps.spot,
                  perp: report.costs.feeBps.perp,
                  slip: report.costs.slippageBps.spot,
                  cash: fmtPercent(report.costs.cashRate, 1),
                },
              )}
            </>
          )}
        </p>
      </div>
      {!report ? (
        <p className="text-sm text-muted-foreground">
          {t("Not run yet: run the research on the Research page.")}
        </p>
      ) : (
        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results">{t("Results")}</TabsTrigger>
            <TabsTrigger value="selection">{t("Selection bias")}</TabsTrigger>
            <TabsTrigger value="regimes">{t("Regimes")}</TabsTrigger>
            <TabsTrigger value="signals">{t("Signals and paper")}</TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="mt-4 space-y-4">
            {strategy.role !== "benchmark" && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("Against the evidence standard")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CriteriaList criteria={report.criteria} />
                </CardContent>
              </Card>
            )}
            {(["walkForward", "holdout", "inSample"] as const).map((key) => {
              const s = report[key];
              if (!s) return null;
              return (
                <Card key={key}>
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <CategoryBadge category={s.category} />
                      <span className="text-sm font-normal text-muted-foreground">
                        {t(s.label)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Headline summary={s} />
                    <EquityChart points={s.equity} benchmarkLabel={benchmarkLabel} />
                  </CardContent>
                </Card>
              );
            })}
            <Card>
              <CardHeader>
                <CardTitle>{t("All metrics, by kind of evidence")}</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricsTable
                  series={[report.inSample, report.walkForward, report.holdout].filter(
                    (s): s is research.SeriesSummary => Boolean(s),
                  )}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="selection" className="mt-4 space-y-4">
            <Selection report={report} trials={data.trials} />
          </TabsContent>
          <TabsContent value="regimes" className="mt-4">
            <Regimes report={report} />
          </TabsContent>
          <TabsContent value="signals" className="mt-4 space-y-4">
            <Signals data={data} benchmarkLabel={benchmarkLabel} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function Headline({ summary }: { summary: research.SeriesSummary }) {
  const { t } = useI18n();
  const day = useDay();
  const m = summary.metrics;
  const b = summary.benchmark;
  return (
    <p className="text-sm">
      {t("{from} to {to}: {cagr} a year (Sharpe {sharpe}, worst drawdown {dd})", {
        from: day(summary.from),
        to: day(summary.to),
        cagr: `${(m.cagr ?? 0) > 0 ? "+" : ""}${fmtPercent(m.cagr, 1)}`,
        sharpe: ratio(m.sharpe),
        dd: `-${fmtPercent(m.maxDrawdown, 0)}`,
      })}
      {b && (
        <span className="text-muted-foreground">
          {" "}
          {t("against the benchmark's {cagr} a year (Sharpe {sharpe}, worst drawdown {dd}).", {
            cagr: `${(b.cagr ?? 0) > 0 ? "+" : ""}${fmtPercent(b.cagr, 1)}`,
            sharpe: ratio(b.sharpe),
            dd: loss(b.maxDrawdown),
          })}
        </span>
      )}
    </p>
  );
}

function Selection({
  report,
  trials,
}: {
  report: research.StrategyReport;
  trials: StrategyDetail["trials"];
}) {
  const { t } = useI18n();
  const labels = useMemo(
    () => new Map(report.configs.map((c) => [c.id, c.label])),
    [report.configs],
  );
  const wf = report.walkForward;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Every configuration tried (in-sample, before the holdout)")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="max-w-3xl text-sm text-muted-foreground">
            {t(
              "The chosen configuration (marked) is the best of these on the same days, so its in-sample Sharpe ratio is biased upwards. The Deflated Sharpe ratio and the probability of backtest overfitting measure how much.",
            )}
          </p>
          <ConfigSharpeBars configs={report.configs} selected={report.selected?.id ?? null} />
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("Deflated Sharpe ratio")}</div>
              <div className="text-lg font-semibold">{fmtPercent(report.deflated.dsr, 1)}</div>
              <div className="text-xs text-muted-foreground">
                {t("Daily Sharpe to beat: {v} (the best of {n} tries by luck)", {
                  v: report.deflated.threshold.toFixed(4),
                  n: report.deflated.trials,
                })}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">
                {t("Probability of backtest overfitting")}
              </div>
              <div className="text-lg font-semibold">{ratio(report.pbo?.pbo)}</div>
              <div className="text-xs text-muted-foreground">
                {report.pbo
                  ? t("{n} splits of 10 blocks; 0.5 is what pure luck gives", {
                      n: report.pbo.splits,
                    })
                  : t("One configuration: nothing was chosen")}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{t("Trials recorded")}</div>
              <div className="text-lg font-semibold">
                {trials.distinct || report.configs.length}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("Distinct configurations ever evaluated, over {runs} evaluations", {
                  runs: trials.runs,
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {wf && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Walk-forward windows")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="max-w-3xl text-sm text-muted-foreground">
              {t(
                "Each bar is a 90-day window traded by the configuration chosen on the 730 days before it ({n} configuration choices in all). A configuration that keeps changing is a sign the choice is mostly noise.",
                { n: wf.trials },
              )}
            </p>
            <FoldsChart folds={wf.folds} points={wf.equity} labels={labels} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Regimes({ report }: { report: research.StrategyReport }) {
  const { t } = useI18n();
  const options = (["walkForward", "holdout", "inSample"] as const).filter((k) => report[k]);
  const [key, setKey] = useState<(typeof options)[number]>(options[0] ?? "walkForward");
  const s = report[key];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("By market regime")}</CardTitle>
        <OptionSelect
          value={key}
          onValueChange={(v) => setKey(v as typeof key)}
          aria-label={t("Kind of evidence")}
          className="w-64"
        >
          {options.map((k) => (
            <option key={k} value={k}>
              {t(CATEGORY_LABELS[report[k]!.category].label)}
            </option>
          ))}
        </OptionSelect>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            "Each day's regime comes from BTC's own past only: the previous close against its 200-day average (trend), and the previous 30 days' volatility against the median of all earlier days (calm or volatile).",
          )}
        </p>
        {s && <RegimeBars rows={s.byRegime} />}
      </CardContent>
    </Card>
  );
}

function Signals({ data, benchmarkLabel }: { data: StrategyDetail; benchmarkLabel?: string }) {
  const { t, intl } = useI18n();
  const day = useDay();
  const latest = data.signals[data.signals.length - 1];
  if (!data.signals.length)
    return (
      <p className="max-w-3xl text-sm text-muted-foreground">
        {data.monitoring
          ? t("Monitoring is on: the first signal is recorded after the next daily close.")
          : t(
              "No signals recorded: start monitoring on the Research page to record them and paper trade.",
            )}
      </p>
    );
  return (
    <>
      {latest && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Latest signal")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="font-medium">{describeWeights(latest.weights, t)}</span>{" "}
              <span className="text-muted-foreground">
                {t("decided on the close of {day}, to execute at the open of {exec}", {
                  day: day(latest.decisionTime),
                  exec: day(latest.executeAt),
                })}
              </span>
            </p>
            <p className="text-muted-foreground">{latest.reason}</p>
            {latest.inputs && (
              <p className="font-mono text-xs text-muted-foreground">
                {Object.entries(latest.inputs)
                  .map(([k, v]) => `${k} = ${v ?? "–"}`)
                  .join(" · ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {data.paper && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <CategoryBadge category="paper" />
              <span className="text-sm font-normal text-muted-foreground">
                {t(data.paper.label)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.paper.metrics.days ? (
              <>
                <Headline summary={data.paper} />
                <EquityChart points={data.paper.equity} benchmarkLabel={benchmarkLabel} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  "No paper day accounted yet: a day counts once the open after it is known (the first signal executes at the open of {date}).",
                  { date: day(data.signals[0]!.executeAt) },
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("Signal log")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Close of")}</TableHead>
                <TableHead>{t("Position")}</TableHead>
                <TableHead>{t("Executes at the open of")}</TableHead>
                <TableHead>{t("Recorded")}</TableHead>
                <TableHead>{t("Reason")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.signals].reverse().map((s) => (
                <TableRow key={s.decisionTime}>
                  <TableCell className="whitespace-nowrap">{day(s.decisionTime)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {describeWeights(s.weights, t)}
                    {s.changed && (
                      <span className="ml-2 text-xs text-muted-foreground">({t("changed")})</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {day(s.executeAt)}
                    {s.executeAt > s.decisionTime + 86_400_000 && (
                      <span className="ml-2 text-xs text-muted-foreground">({t("late")})</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(s.generatedAt).toLocaleString(intl, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </TableCell>
                  <TableCell className="min-w-64 text-sm text-muted-foreground">
                    {s.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
