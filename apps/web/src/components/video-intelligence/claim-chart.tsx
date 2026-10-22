"use client";

import * as echarts from "echarts/core";
import { MarkLineComponent, MarkPointComponent } from "echarts/components";
import type { EChartsOption } from "echarts";
import type { ClaimBar, ClaimOutcome } from "@luxalgo/journal-core";
import { EChart } from "@/components/charts/echart";
import { useVizTokens } from "@/components/charts/tokens";
import { useI18n } from "@/components/i18n";

echarts.use([MarkLineComponent, MarkPointComponent]);

/**
 * A claim on the candles its evaluation read: the closes, the claim's time and horizon end,
 * the reference price, the targets and the invalidation (and a setup's entry and stop), and
 * where the outcome was decided. Levels are the analyst's; the line is the market's.
 */
export function ClaimChart({
  bars,
  claimTime,
  horizonEnd,
  targets,
  invalidation,
  entry,
  stop,
  outcome,
}: {
  bars: ClaimBar[];
  claimTime: number;
  horizonEnd: number;
  targets: number[];
  invalidation: number | null;
  entry: number | null;
  stop: number | null;
  outcome: ClaimOutcome | null;
}) {
  const { t, tx, intl } = useI18n();
  const tokens = useVizTokens();
  if (!tokens || !bars.length) return null;
  const label = (text: string, color: string) => ({
    formatter: text,
    color,
    fontSize: 10,
    position: "insideEndTop" as const,
  });
  const level = (
    value: number,
    text: string,
    color: string,
    type: "solid" | "dashed" = "dashed",
  ) => ({
    yAxis: value,
    lineStyle: { color, type, width: 1 },
    label: label(`${text} ${value}`, color),
  });
  const time = (value: number, text: string) => ({
    xAxis: value,
    lineStyle: { color: tokens.inkMuted, type: "dotted" as const, width: 1 },
    label: { formatter: text, color: tokens.inkMuted, fontSize: 10 },
  });
  const decided = outcome?.targetHitAt ?? outcome?.invalidatedAt ?? null;
  const decidedBar = decided === null ? null : bars.find((b) => b.time === decided);
  const option: EChartsOption = {
    animation: false,
    grid: { left: 8, right: 64, top: 16, bottom: 24, containLabel: true },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => String(v),
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: tokens.baseline } },
      axisLabel: {
        color: tokens.inkMuted,
        formatter: (v: number) =>
          new Date(v).toLocaleDateString(intl, { month: "short", day: "numeric" }),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      position: "right",
      splitLine: { lineStyle: { color: tokens.gridline } },
      axisLabel: { color: tokens.inkMuted },
    },
    series: [
      {
        type: "line",
        name: tx("candle", "Close"),
        showSymbol: false,
        lineStyle: { color: tokens.foreground, width: 1 },
        data: bars.map((b) => [b.time, b.close]),
        markLine: {
          symbol: "none",
          silent: true,
          data: [
            time(claimTime, t("Claim")),
            time(horizonEnd, t("Horizon end")),
            ...(outcome?.referencePrice != null
              ? [level(outcome.referencePrice, t("Reference"), tokens.inkMuted, "solid")]
              : []),
            ...targets.map((v) => level(v, t("Target"), tokens.profit)),
            ...(invalidation !== null ? [level(invalidation, t("Invalidation"), tokens.loss)] : []),
            ...(entry !== null ? [level(entry, t("Entry"), tokens.brand)] : []),
            ...(stop !== null && stop !== invalidation
              ? [level(stop, tx("chart level", "Stop"), tokens.loss)]
              : []),
          ],
        },
        markPoint: decidedBar
          ? {
              symbol: "pin",
              symbolSize: 28,
              itemStyle: { color: outcome?.targetHitAt ? tokens.profit : tokens.loss },
              label: { formatter: outcome?.targetHitAt ? "✓" : "✕", color: tokens.card },
              data: [{ name: "outcome", coord: [decidedBar.time, decidedBar.close] }],
            }
          : undefined,
      },
    ],
  };
  return <EChart option={option} height={300} />;
}
