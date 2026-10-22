"use client";

import * as echarts from "echarts/core";
import { CustomChart, ScatterChart } from "echarts/charts";
import { LegendComponent, MarkLineComponent } from "echarts/components";
import type { EChartsOption } from "echarts";
import type { ClaimStatus } from "@luxalgo/journal-core";
import type { GroupReport, ReportCharts } from "@/lib/video-intelligence";
import { STATUS_LABELS } from "@/lib/video-intelligence";
import { EChart } from "@/components/charts/echart";
import { useVizTokens, type VizTokens } from "@/components/charts/tokens";
import { useI18n } from "@/components/i18n";

echarts.use([CustomChart, ScatterChart, LegendComponent, MarkLineComponent]);

/** Tooltips are HTML: names from elsewhere (a channel's title) are escaped before going in. */
const escape = (text: unknown) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

/** Outcome colours: names always accompany them (legend, tooltip), so colour is never the only cue. */
function statusColor(status: ClaimStatus | "not_evaluated", t: VizTokens): string {
  switch (status) {
    case "target_hit":
      return t.profit;
    case "target_hit_late":
      return t.series[2] ?? t.brand;
    case "invalidated":
      return t.loss;
    case "expired":
      return t.series[4] ?? t.inkMuted;
    case "ambiguous":
      return t.series[5] ?? t.inkMuted;
    case "pending":
      return t.brand;
    default:
      return t.inkMuted;
  }
}

const ORDER: (ClaimStatus | "not_evaluated")[] = [
  "target_hit",
  "target_hit_late",
  "invalidated",
  "expired",
  "ambiguous",
  "not_triggered",
  "pending",
  "unevaluable",
  "not_evaluated",
];

const axis = (t: VizTokens) => ({
  axisLine: { lineStyle: { color: t.baseline } },
  axisLabel: { color: t.inkMuted },
  splitLine: { lineStyle: { color: t.gridline } },
});

/** How each group's claims ended: one stacked bar per group. */
export function OutcomeBars({ groups }: { groups: GroupReport[] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !groups.length) return null;
  const rows = groups.slice(0, 12).reverse();
  const count = (g: GroupReport, s: ClaimStatus | "not_evaluated") => {
    const tally = g.tally;
    const map: Record<string, number> = {
      target_hit: tally.targetHits,
      target_hit_late: tally.late,
      invalidated: tally.invalidated,
      expired: tally.expired,
      ambiguous: tally.ambiguous,
      not_triggered: tally.notTriggered,
      pending: tally.pending,
      unevaluable: tally.unevaluable,
      not_evaluated: Math.max(
        0,
        tally.claims -
          tally.targetHits -
          tally.late -
          tally.invalidated -
          tally.expired -
          tally.ambiguous -
          tally.notTriggered -
          tally.pending -
          tally.unevaluable,
      ),
    };
    return map[s] ?? 0;
  };
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: tokens.inkMuted }, type: "scroll" },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", ...axis(tokens), minInterval: 1 },
    yAxis: { type: "category", data: rows.map((g) => g.label), ...axis(tokens) },
    series: ORDER.filter((s) => rows.some((g) => count(g, s) > 0)).map((s) => ({
      type: "bar" as const,
      stack: "claims",
      name: t(STATUS_LABELS[s]),
      itemStyle: { color: statusColor(s, tokens) },
      data: rows.map((g) => count(g, s)),
    })),
  };
  return <EChart option={option} height={Math.max(160, 48 + rows.length * 32)} />;
}

/**
 * Each group's target hit rate next to its mirror's (the same claims bet the other way), with
 * their 95% intervals as whiskers. Overlapping whiskers: no evidence of skill over chance.
 */
export function BaselineChart({ groups }: { groups: GroupReport[] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  const rows = groups.filter((g) => g.baseline.pairs > 0).slice(0, 12);
  if (!tokens || !rows.length) return null;
  const whiskers = (
    name: string,
    color: string,
    offset: number,
    pick: (g: GroupReport) => {
      rate: number | null;
      interval: { low: number; high: number } | null;
    },
  ) => ({
    type: "custom" as const,
    name,
    itemStyle: { color },
    data: rows.map((g, i) => {
      const p = pick(g);
      return [i, p.rate ?? 0, p.interval?.low ?? 0, p.interval?.high ?? 0, g.baseline.pairs];
    }),
    encode: { x: 0, y: [1, 2, 3] },
    renderItem: (_params: unknown, api: any) => {
      const x = api.value(0) as number;
      const [cx, cy] = api.coord([x, api.value(1)]);
      const [, low] = api.coord([x, api.value(2)]);
      const [, high] = api.coord([x, api.value(3)]);
      const dx = (api.size([1, 0])[0] as number) * offset;
      const style = { stroke: color, lineWidth: 1.5 };
      return {
        type: "group" as const,
        children: [
          { type: "line" as const, shape: { x1: cx + dx, y1: low, x2: cx + dx, y2: high }, style },
          {
            type: "line" as const,
            shape: { x1: cx + dx - 5, y1: low, x2: cx + dx + 5, y2: low },
            style,
          },
          {
            type: "line" as const,
            shape: { x1: cx + dx - 5, y1: high, x2: cx + dx + 5, y2: high },
            style,
          },
          { type: "circle" as const, shape: { cx: cx + dx, cy, r: 4 }, style: { fill: color } },
        ],
      };
    },
  });
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: tokens.inkMuted } },
    tooltip: {
      trigger: "item",
      formatter: (p: any) =>
        `${escape(rows[p.value[0]]!.label)}<br/>${escape(p.seriesName)}: ${pct(p.value[1])} (${pct(p.value[2])}–${pct(p.value[3])}), n=${p.value[4]}`,
    },
    xAxis: {
      type: "category",
      data: rows.map((g) => g.label),
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, interval: 0, width: 120, overflow: "truncate" },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    series: [
      whiskers(t("Analyst"), tokens.brand, -0.15, (g) => ({
        rate: g.baseline.analystRate,
        interval: g.baseline.analystInterval,
      })),
      whiskers(t("Mirror (opposite bet)"), tokens.inkMuted, 0.15, (g) => ({
        rate: g.baseline.mirrorRate,
        interval: g.baseline.mirrorInterval,
      })),
    ],
  };
  return <EChart option={option} height={300} />;
}

/** Cumulative return of the simulated trades, net and gross, and at no cost and double cost. */
export function EquityChart({ points }: { points: ReportCharts["equity"] }) {
  const { t, intl } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !points.length) return null;
  const line = (
    name: string,
    color: string,
    pick: (p: (typeof points)[number]) => number,
    dashed = false,
  ) => ({
    type: "line" as const,
    name,
    step: "end" as const,
    showSymbol: points.length < 40,
    lineStyle: {
      color,
      width: dashed ? 1 : 2,
      type: dashed ? ("dashed" as const) : ("solid" as const),
    },
    itemStyle: { color },
    data: points.map((p) => [p.time, pick(p)]),
  });
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: tokens.inkMuted } },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => `${Number(v) > 0 ? "+" : ""}${pct(Number(v), 2)}`,
    },
    xAxis: {
      type: "time",
      ...axis(tokens),
      axisLabel: {
        color: tokens.inkMuted,
        formatter: (v: number) =>
          new Date(v).toLocaleDateString(intl, { month: "short", day: "numeric" }),
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v, 1) },
    },
    series: [
      {
        ...line(t("Net"), tokens.foreground, (p) => p.net),
        markLine: {
          symbol: "none",
          silent: true,
          data: [{ yAxis: 0, lineStyle: { color: tokens.baseline } }],
          label: { show: false },
        },
      },
      line(t("Gross"), tokens.brand, (p) => p.gross, true),
      line(t("No cost"), tokens.profit, (p) => p.free, true),
      line(t("2× cost"), tokens.loss, (p) => p.double, true),
    ],
  };
  return <EChart option={option} height={260} />;
}

/** How the simulated trades ended, in R, in half-R bins. */
export function RHistogram({ values }: { values: number[] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !values.length) return null;
  const width = 0.5;
  const low = Math.floor(Math.min(...values, -1) / width) * width;
  const high = Math.ceil(Math.max(...values, 1) / width) * width;
  const bins: { from: number; count: number }[] = [];
  for (let from = low; from < high; from += width)
    bins.push({
      from,
      count: values.filter(
        (v) => v >= from && (v < from + width || (from + width >= high && v <= high)),
      ).length,
    });
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: bins.map((b) => `${b.from >= 0 ? "+" : ""}${b.from.toFixed(1)}R`),
      ...axis(tokens),
      name: t("Result in R"),
    },
    yAxis: { type: "value", minInterval: 1, ...axis(tokens) },
    series: [
      {
        type: "bar",
        name: t("Trades"),
        data: bins.map((b) => ({
          value: b.count,
          itemStyle: { color: b.from >= 0 ? tokens.profit : tokens.loss },
        })),
      },
    ],
  };
  return <EChart option={option} height={220} />;
}

/**
 * Every claim's best move (MFE) against its worst (MAE), coloured by outcome: claims that won
 * only after deep drawdowns sit far left.
 */
export function ExcursionScatter({ points }: { points: ReportCharts["excursions"] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !points.length) return null;
  const groups = ORDER.filter((s) => points.some((p) => p.status === s));
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 24, containLabel: true },
    legend: { top: 0, textStyle: { color: tokens.inkMuted }, type: "scroll" },
    tooltip: {
      trigger: "item",
      formatter: (p: any) =>
        `${escape(p.seriesName)}<br/>MFE ${pct(p.value[1], 2)} · MAE ${pct(p.value[0], 2)}`,
    },
    xAxis: {
      type: "value",
      name: t("Worst move (MAE)"),
      nameLocation: "middle",
      nameGap: 24,
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    yAxis: {
      type: "value",
      name: t("Best move (MFE)"),
      nameLocation: "middle",
      nameGap: 44,
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    series: groups.map((s) => ({
      type: "scatter" as const,
      name: t(STATUS_LABELS[s]),
      symbolSize: 7,
      itemStyle: { color: statusColor(s, tokens), opacity: 0.8 },
      data: points.filter((p) => p.status === s).map((p) => [p.mae, p.mfe]),
    })),
  };
  return <EChart option={option} height={300} />;
}

/** Stated probabilities against how often they came true; the diagonal is perfect calibration. */
export function CalibrationChart({ bins }: { bins: ReportCharts["calibration"] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !bins.length) return null;
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 24, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p: any) =>
        `${escape(t("Stated"))} ${pct(p.value[0])} · ${escape(t("Observed"))} ${pct(p.value[1])} · n=${p.value[2]}`,
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 1,
      name: t("Stated probability"),
      nameLocation: "middle",
      nameGap: 24,
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 1,
      name: t("How often it happened"),
      nameLocation: "middle",
      nameGap: 44,
      ...axis(tokens),
      axisLabel: { color: tokens.inkMuted, formatter: (v: number) => pct(v) },
    },
    series: [
      {
        type: "line",
        name: t("Perfect calibration"),
        data: [
          [0, 0],
          [1, 1],
        ],
        showSymbol: false,
        silent: true,
        lineStyle: { color: tokens.baseline, type: "dashed" },
      },
      {
        type: "scatter",
        name: t("Stated probabilities"),
        itemStyle: { color: tokens.brand },
        symbolSize: (v: number[]) => 6 + Math.sqrt(v[2] ?? 1) * 3,
        data: bins.map((b) => [b.stated, b.observed, b.count]),
      },
    ],
  };
  return <EChart option={option} height={260} />;
}

/** Claims per month by outcome. */
export function TimelineChart({ months }: { months: ReportCharts["timeline"] }) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !months.length) return null;
  const statuses = ORDER.filter((s) => months.some((m) => (m.counts[s] ?? 0) > 0));
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, textStyle: { color: tokens.inkMuted }, type: "scroll" },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: months.map((m) => m.month), ...axis(tokens) },
    yAxis: { type: "value", minInterval: 1, ...axis(tokens) },
    series: statuses.map((s) => ({
      type: "bar" as const,
      stack: "month",
      name: t(STATUS_LABELS[s]),
      itemStyle: { color: statusColor(s, tokens) },
      data: months.map((m) => m.counts[s] ?? 0),
    })),
  };
  return <EChart option={option} height={240} />;
}
