"use client";

import type { research } from "@luxalgo/journal-core";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { CATEGORY_LABELS, VERDICT_LABELS } from "@/lib/strategy-research";
import { fmtPercent } from "@/lib/utils";
import { useI18n } from "@/components/i18n";
import { Badge } from "@/components/ui/badge";
import { HoverHint } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const signed = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "–" : `${v > 0 ? "+" : ""}${fmtPercent(v, digits)}`;
export const ratio = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? "–" : v.toFixed(digits);
export const loss = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : v > 0 ? `-${fmtPercent(v, 1)}` : fmtPercent(0, 1);

export function useDay() {
  const { intl } = useI18n();
  return (time: number | null | undefined) =>
    time === null || time === undefined
      ? "–"
      : new Date(time).toLocaleDateString(intl, { timeZone: "UTC", dateStyle: "medium" });
}

/** The verdict in words (never colour alone). */
export function VerdictBadge({ verdict }: { verdict: research.Verdict | null }) {
  const { t } = useI18n();
  if (!verdict) return <Badge variant="outline">{t("Not run yet")}</Badge>;
  const v = VERDICT_LABELS[verdict];
  return (
    <HoverHint content={t(v.detail)}>
      <Badge
        variant={
          verdict === "meets-standard"
            ? "default"
            : verdict === "rejected"
              ? "loss"
              : verdict === "experimental"
                ? "secondary"
                : "outline"
        }
      >
        {t(v.label)}
      </Badge>
    </HoverHint>
  );
}

export function CategoryBadge({ category }: { category: research.ResultCategory }) {
  const { t } = useI18n();
  const c = CATEGORY_LABELS[category];
  return (
    <HoverHint content={t(c.detail)}>
      <Badge variant="outline" className="font-normal">
        {t(c.label)}
      </Badge>
    </HoverHint>
  );
}

/** The pre-declared criteria, each passed, failed or not measurable, with its value. */
export function CriteriaList({ criteria }: { criteria: research.Criterion[] }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-1.5 text-sm">
      {criteria.map((c) => (
        <li key={c.id} className="flex items-start gap-2">
          {c.passed === null ? (
            <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : c.passed ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-profit" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden />
          )}
          <span>
            <span className="font-medium">
              {c.passed === null ? t("Not measurable") : c.passed ? t("Passed") : t("Failed")}:
            </span>{" "}
            {t(c.label)} <span className="text-muted-foreground">({c.value})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every metric of each category of evidence side by side, the benchmark over the same days
 * next to each: the categories are never added together.
 */
export function MetricsTable({ series }: { series: research.SeriesSummary[] }) {
  const { t } = useI18n();
  const day = useDay();
  const rows: {
    label: string;
    hint?: string;
    value: (s: research.SeriesSummary) => string;
    bench?: (s: research.SeriesSummary) => string;
  }[] = [
    { label: t("Period"), value: (s) => `${day(s.from)} – ${day(s.to)}` },
    { label: t("Days"), value: (s) => String(s.metrics.days) },
    {
      label: t("Total return"),
      value: (s) => signed(s.metrics.totalReturn),
      bench: (s) => signed(s.benchmark?.totalReturn),
    },
    {
      label: t("CAGR"),
      hint: t("Compounded annual growth rate, after costs."),
      value: (s) => signed(s.metrics.cagr),
      bench: (s) => signed(s.benchmark?.cagr),
    },
    {
      label: t("Volatility"),
      hint: t("Annualized standard deviation of daily returns."),
      value: (s) => fmtPercent(s.metrics.volatility, 1),
      bench: (s) => fmtPercent(s.benchmark?.volatility ?? null, 1),
    },
    {
      label: t("Sharpe ratio"),
      hint: t("Mean daily return over the cash rate, divided by its standard deviation, × √365."),
      value: (s) => ratio(s.metrics.sharpe),
      bench: (s) => ratio(s.benchmark?.sharpe),
    },
    {
      label: t("Sharpe 95% interval"),
      hint: t("Stationary block bootstrap (2,000 resamples, mean block 10 days, fixed seed)."),
      value: (s) => (s.bootstrap ? `${ratio(s.bootstrap.low)} to ${ratio(s.bootstrap.high)}` : "–"),
    },
    {
      label: t("Probabilistic Sharpe"),
      hint: t(
        "Probability that the true Sharpe ratio is above 0, given the sample's length, skewness and kurtosis.",
      ),
      value: (s) => fmtPercent(s.probabilisticSharpe, 0),
    },
    {
      label: t("Sortino ratio"),
      value: (s) => ratio(s.metrics.sortino),
      bench: (s) => ratio(s.benchmark?.sortino),
    },
    {
      label: t("Max drawdown"),
      value: (s) => loss(s.metrics.maxDrawdown),
      bench: (s) => loss(s.benchmark?.maxDrawdown),
    },
    {
      label: t("Longest drawdown"),
      value: (s) => t("{n} days", { n: s.metrics.maxDrawdownDays }),
      bench: (s) => (s.benchmark ? t("{n} days", { n: s.benchmark.maxDrawdownDays }) : "–"),
    },
    {
      label: t("Calmar ratio"),
      value: (s) => ratio(s.metrics.calmar),
      bench: (s) => ratio(s.benchmark?.calmar),
    },
    {
      label: t("Worst day / 95% CVaR"),
      value: (s) => `${signed(s.metrics.worstDay)} / ${loss(s.metrics.cvar95)}`,
      bench: (s) =>
        s.benchmark ? `${signed(s.benchmark.worstDay)} / ${loss(s.benchmark.cvar95)}` : "–",
    },
    {
      label: t("Skewness / excess kurtosis"),
      value: (s) => `${ratio(s.metrics.skewness)} / ${ratio(s.metrics.kurtosis, 1)}`,
    },
    {
      label: t("Beta / correlation to benchmark"),
      value: (s) =>
        s.relative ? `${ratio(s.relative.beta)} / ${ratio(s.relative.correlation)}` : "–",
    },
    {
      label: t("Exposure"),
      hint: t("Average share of capital at work (Σ|weight|)."),
      value: (s) => fmtPercent(s.trading.exposure, 0),
    },
    {
      label: t("Turnover a year"),
      hint: t("Σ|traded weight| a year: 2 means the whole book bought and sold once."),
      value: (s) => s.trading.annualTurnover.toFixed(1),
    },
    { label: t("Trades"), value: (s) => String(s.trading.trades) },
    { label: t("Win rate"), value: (s) => fmtPercent(s.trading.winRate, 0) },
    { label: t("Profit factor"), value: (s) => ratio(s.trading.profitFactor) },
    {
      label: t("Costs paid"),
      hint: t("Commission and slippage, as a share of starting capital, summed."),
      value: (s) => `-${fmtPercent(s.trading.fees + s.trading.slippage, 1)}`,
    },
    {
      label: t("Funding received"),
      value: (s) => signed(s.trading.funding),
    },
    {
      label: t("Cash income"),
      value: (s) => signed(s.trading.cashIncome),
    },
  ];
  const withStress = series.some((s) => s.perpStress);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Metric")}</TableHead>
            {series.map((s) => (
              <TableHead key={s.category} colSpan={2}>
                <CategoryBadge category={s.category} />
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead />
            {series.map((s) => (
              <SubHeads key={s.category} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="whitespace-nowrap">
                {r.hint ? (
                  <HoverHint content={r.hint}>
                    <span className="cursor-help underline decoration-dotted">{r.label}</span>
                  </HoverHint>
                ) : (
                  r.label
                )}
              </TableCell>
              {series.map((s) => (
                <Cells key={s.category} value={r.value(s)} bench={r.bench?.(s)} />
              ))}
            </TableRow>
          ))}
          {withStress && (
            <TableRow>
              <TableCell className="whitespace-nowrap">
                <HoverHint
                  content={t(
                    "The worst rise of the perpetual from the open to the high on a day a short was held, against the margin posted (the backtest assumes it is topped up daily).",
                  )}
                >
                  <span className="cursor-help underline decoration-dotted">
                    {t("Worst move against the short leg")}
                  </span>
                </HoverHint>
              </TableCell>
              {series.map((s) => (
                <Cells
                  key={s.category}
                  value={
                    s.perpStress
                      ? t("{move} of {margin} margin", {
                          move: fmtPercent(s.perpStress.worstMove, 1),
                          margin: fmtPercent(s.perpStress.margin, 0),
                        })
                      : "–"
                  }
                />
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SubHeads() {
  const { t } = useI18n();
  return (
    <>
      <TableHead className="text-xs font-normal">{t("Strategy")}</TableHead>
      <TableHead className="text-xs font-normal text-muted-foreground">{t("Benchmark")}</TableHead>
    </>
  );
}

function Cells({ value, bench }: { value: string; bench?: string }) {
  return (
    <>
      <TableCell className="whitespace-nowrap tabular-nums">{value}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {bench ?? ""}
      </TableCell>
    </>
  );
}

export function describeWeights(weights: Record<string, number>, t: (s: string) => string) {
  const parts = Object.entries(weights)
    .filter(([, w]) => Math.abs(w) > 1e-6)
    .map(([id, w]) => `${w > 0 ? t("long") : t("short")} ${id} ${Math.round(Math.abs(w) * 100)}%`);
  return parts.length ? parts.join(", ") : t("cash");
}
