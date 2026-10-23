"use client";

import * as echarts from "echarts/core";
import { LegendComponent, MarkAreaComponent, MarkLineComponent } from "echarts/components";
import type { EChartsOption } from "echarts";
import type { research } from "@luxalgo/journal-core";
import type { StrategyOverview } from "@/lib/strategy-research";
import { EChart } from "@/components/charts/echart";
import { useVizTokens, type VizTokens } from "@/components/charts/tokens";
import { useI18n } from "@/components/i18n";

echarts.use([LegendComponent, MarkLineComponent, MarkAreaComponent]);

/** Tooltips are HTML: labels are escaped before going in. */
const escape = (text: unknown) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
const signed = (v: number, digits = 1) => `${v > 0 ? "+" : ""}${pct(v, digits)}`;

const axis = (t: VizTokens) => ({
  axisLine: { lineStyle: { color: t.baseline } },
  axisLabel: { color: t.inkMuted },
  splitLine: { lineStyle: { color: t.gridline } },
});

export type EquityPoint = research.SeriesSummary["equity"][number];

/**
 * Growth of 1 for the strategy and, over the same days, the benchmark (log scale, so equal
 * percentage moves look equal), with the drawdown below. Series are named in the legend and
 * the tooltip: colour is never the only cue.
 */
export function EquityChart({
  points,
  benchmarkLabel,
  shade,
}: {
  points: EquityPoint[];
  benchmarkLabel?: string;
  /** Periods to shade and name (the holdout, for example). */
  shade?: { from: number; to: number; label: string }[];
}) {
  const { t, intl } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !points.length) return null;
  const date = (v: number) =>
    new Date(v).toLocaleDateString(intl, { year: "numeric", month: "short" });
  const hasBenchmark = points.some((p) => p.benchmark !== null);
  const option: EChartsOption = {
    animation: false,
    legend: { top: 0, textStyle: { color: tokens.inkMuted } },
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const time = Number((list[0]?.value as [number, number])?.[0]);
        return [
          escape(new Date(time).toLocaleDateString(intl, { dateStyle: "medium" })),
          ...list.map((p) => {
            const v = Number((p.value as [number, number])[1]);
            return `${p.marker} ${escape(p.seriesName)}: ${p.seriesIndex === 2 ? `-${pct(v, 1)}` : signed(v - 1, 1)}`;
          }),
        ].join("<br/>");
      },
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [
      { left: 8, right: 16, top: 36, height: "58%", containLabel: true },
      { left: 8, right: 16, top: "74%", bottom: 8, containLabel: true },
    ],
    xAxis: [
      { type: "time", gridIndex: 0, ...axis(tokens), axisLabel: { show: false } },
      {
        type: "time",
        gridIndex: 1,
        ...axis(tokens),
        axisLabel: { color: tokens.inkMuted, formatter: date, hideOverlap: true },
      },
    ],
    yAxis: [
      {
        type: "log",
        gridIndex: 0,
        // Fit the data (a log axis otherwise snaps to whole powers of ten).
        min: (v: { min: number }) => v.min * 0.95,
        max: (v: { max: number }) => v.max * 1.05,
        ...axis(tokens),
        axisLabel: {
          color: tokens.inkMuted,
          formatter: (v: number) => `${v.toFixed(v < 2 ? 2 : v < 10 ? 1 : 0)}×`,
          hideOverlap: true,
        },
      },
      {
        type: "value",
        gridIndex: 1,
        inverse: true,
        min: 0,
        max: (v: { max: number }) => Math.max(0.05, v.max),
        splitNumber: 2,
        ...axis(tokens),
        axisLabel: { color: tokens.inkMuted, formatter: (v: number) => `-${pct(v)}` },
      },
    ],
    series: [
      {
        type: "line",
        name: t("Strategy"),
        showSymbol: false,
        lineStyle: { color: tokens.foreground, width: 2 },
        itemStyle: { color: tokens.foreground },
        data: points.map((p) => [p.time, p.equity]),
        markLine: {
          symbol: "none",
          silent: true,
          data: [{ yAxis: 1, lineStyle: { color: tokens.baseline } }],
          label: { show: false },
        },
        markArea: shade?.length
          ? {
              silent: true,
              itemStyle: { color: tokens.gridline, opacity: 0.5 },
              label: { color: tokens.inkMuted, position: "insideTop" },
              data: shade.map((s) => [{ xAxis: s.from, name: s.label }, { xAxis: s.to }]),
            }
          : undefined,
      },
      {
        type: "line",
        name: benchmarkLabel ?? t("Benchmark"),
        showSymbol: false,
        lineStyle: { color: tokens.inkMuted, width: 1, type: "dashed" },
        itemStyle: { color: tokens.inkMuted },
        data: hasBenchmark
          ? points.filter((p) => p.benchmark !== null).map((p) => [p.time, p.benchmark])
          : [],
      },
      {
        type: "line",
        name: t("Drawdown"),
        xAxisIndex: 1,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { color: tokens.loss, width: 1 },
        itemStyle: { color: tokens.loss },
        areaStyle: { color: tokens.loss, opacity: 0.15 },
        data: points.map((p) => [p.time, p.drawdown]),
      },
    ],
  };
  return <EChart option={option} height={340} />;
}

/** The in-sample Sharpe ratio of every configuration tried, the chosen one marked. */
export function ConfigSharpeBars({
  configs,
  selected,
}: {
  configs: research.ConfigResult[];
  selected: string | null;
}) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !configs.length) return null;
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const p = (Array.isArray(params) ? params : [params])[0]!;
        const c = configs[p.dataIndex]!;
        return `${escape(c.label)}${c.id === selected ? ` (${escape(t("chosen"))})` : ""}<br/>${escape(t("Sharpe"))}: ${c.sharpe?.toFixed(2) ?? "–"}<br/>${escape(t("CAGR"))}: ${c.cagr === null ? "–" : signed(c.cagr)}<br/>${escape(t("Max drawdown"))}: -${pct(c.maxDrawdown)}`;
      },
    },
    xAxis: { type: "value", ...axis(tokens) },
    yAxis: {
      type: "category",
      inverse: true,
      data: configs.map((c) => (c.id === selected ? `▶ ${c.label}` : c.label)),
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, width: 260, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        name: t("Sharpe"),
        data: configs.map((c) => ({
          value: c.sharpe ?? 0,
          itemStyle: { color: c.id === selected ? tokens.brand : tokens.inkMuted },
        })),
        label: {
          show: true,
          position: "right",
          color: tokens.inkMuted,
          formatter: (p) => Number(p.value).toFixed(2),
        },
        markLine: {
          symbol: "none",
          silent: true,
          data: [{ xAxis: 0, lineStyle: { color: tokens.baseline } }],
          label: { show: false },
        },
      },
    ],
  };
  return <EChart option={option} height={Math.max(120, configs.length * 30 + 24)} />;
}

/**
 * The Sharpe ratio of every strategy in each category of evidence, side by side: in-sample
 * bars are expected to be the highest (they were chosen on those days); what matters is what
 * is left out of sample.
 */
export function CategorySharpeBars({ strategies }: { strategies: StrategyOverview[] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !strategies.length) return null;
  const categories = [
    { key: "inSample", label: t("In-sample"), color: tokens.series[3] ?? tokens.inkMuted },
    { key: "walkForward", label: t("Walk-forward"), color: tokens.brand },
    { key: "holdout", label: t("Holdout"), color: tokens.series[1] ?? tokens.foreground },
  ] as const;
  const option: EChartsOption = {
    animation: false,
    legend: { top: 0, textStyle: { color: tokens.inkMuted } },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (v) => Number(v).toFixed(2),
    },
    xAxis: {
      type: "category",
      data: strategies.map((s) => s.name),
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, interval: 0, width: 90, overflow: "break" },
    },
    yAxis: {
      type: "value",
      name: t("Sharpe"),
      nameTextStyle: { color: tokens.inkMuted },
      ...axis(tokens),
    },
    series: categories.map((c, i) => ({
      type: "bar" as const,
      name: c.label,
      itemStyle: { color: c.color },
      data: strategies.map((s) => s[c.key]?.sharpe ?? null),
      ...(i === 0
        ? {
            markLine: {
              symbol: "none",
              silent: true,
              data: [{ yAxis: 0, lineStyle: { color: tokens.baseline } }],
              label: { show: false },
            },
          }
        : {}),
    })),
  };
  return <EChart option={option} height={300} />;
}

/** Each walk-forward window: the configuration chosen and the test window's return. */
export function FoldsChart({
  folds,
  points,
  labels,
}: {
  folds: { testFrom: number; testTo: number; chosen: string }[];
  points: EquityPoint[];
  labels: Map<string, string>;
}) {
  const { t, intl } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !folds.length) return null;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const growth = (from: number, to: number) => {
    const inside = sorted.filter((p) => p.time >= from && p.time <= to + 86_400_000);
    if (!inside.length) return null;
    const before = sorted.filter((p) => p.time < from).pop();
    const start = before ? before.equity : 1;
    const end = inside[inside.length - 1]!;
    const bStart = before?.benchmark ?? 1;
    return {
      strategy: end.equity / start - 1,
      benchmark: end.benchmark !== null && bStart ? end.benchmark / bStart - 1 : null,
    };
  };
  const rows = folds.map((f) => ({ ...f, ...growth(f.testFrom, f.testTo) }));
  const option: EChartsOption = {
    animation: false,
    legend: { top: 0, textStyle: { color: tokens.inkMuted } },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const r = rows[list[0]!.dataIndex]!;
        return [
          `${escape(new Date(r.testFrom).toLocaleDateString(intl, { dateStyle: "medium" }))} – ${escape(new Date(r.testTo).toLocaleDateString(intl, { dateStyle: "medium" }))}`,
          `${escape(t("Chosen"))}: ${escape(labels.get(r.chosen) ?? r.chosen)}`,
          ...list.map(
            (p) =>
              `${p.marker} ${escape(p.seriesName)}: ${p.value == null ? "–" : signed(Number(p.value))}`,
          ),
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: rows.map((r) =>
        new Date(r.testFrom).toLocaleDateString(intl, { year: "2-digit", month: "short" }),
      ),
      ...axis(tokens),
    },
    yAxis: {
      type: "value",
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    series: [
      {
        type: "bar",
        name: t("Strategy"),
        itemStyle: { color: tokens.brand },
        data: rows.map((r) => r.strategy ?? null),
        markLine: {
          symbol: "none",
          silent: true,
          data: [{ yAxis: 0, lineStyle: { color: tokens.baseline } }],
          label: { show: false },
        },
      },
      {
        type: "bar",
        name: t("Benchmark"),
        itemStyle: { color: tokens.inkMuted },
        data: rows.map((r) => r.benchmark ?? null),
      },
    ],
  };
  return <EChart option={option} height={260} />;
}

/** Annualized mean return in each market regime (from BTC's own past). */
export function RegimeBars({ rows }: { rows: research.SeriesSummary["byRegime"] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !rows.length) return null;
  const order = ["uptrend-calm", "uptrend-volatile", "downtrend-calm", "downtrend-volatile"];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.regime) - order.indexOf(b.regime));
  const names: Record<string, string> = {
    "uptrend-calm": t("Uptrend, calm"),
    "uptrend-volatile": t("Uptrend, volatile"),
    "downtrend-calm": t("Downtrend, calm"),
    "downtrend-volatile": t("Downtrend, volatile"),
  };
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params) => {
        const r = sorted[(Array.isArray(params) ? params : [params])[0]!.dataIndex]!;
        return `${escape(names[r.regime] ?? r.regime)}<br/>${escape(t("Days"))}: ${r.days}<br/>${escape(t("Annualized mean"))}: ${signed(r.annualizedMean)}<br/>${escape(t("Sharpe"))}: ${r.sharpe?.toFixed(2) ?? "–"}`;
      },
    },
    xAxis: {
      type: "category",
      data: sorted.map((r) => names[r.regime] ?? r.regime),
      ...axis(tokens),
    },
    yAxis: {
      type: "value",
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    series: [
      {
        type: "bar",
        name: t("Annualized mean"),
        data: sorted.map((r) => ({
          value: r.annualizedMean,
          itemStyle: { color: r.annualizedMean >= 0 ? tokens.profit : tokens.loss },
        })),
        label: {
          show: true,
          position: "top",
          color: tokens.inkMuted,
          formatter: (p) => signed(Number(p.value), 0),
        },
        markLine: {
          symbol: "none",
          silent: true,
          data: [{ yAxis: 0, lineStyle: { color: tokens.baseline } }],
          label: { show: false },
        },
      },
    ],
  };
  return <EChart option={option} height={220} />;
}
