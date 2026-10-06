"use client";

import { useMemo, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import { fmtMoney, fmtNumber } from "@/lib/utils";
import { useI18n } from "../i18n";
import { usePrivacy } from "../privacy";
import { useVizTokens } from "./tokens";

const EChart = dynamic(() => import("./echart").then((module) => module.EChart), { ssr: false });

export interface HourBucket {
  key: string; // "09"
  netPnl: number;
  trades: number;
}

/**
 * Time-of-day performance (ECharts — the heavy plot). Two aligned rows:
 * P&L per opening hour as diverging columns, trade count as a muted line.
 * One value axis per pane — never dual-axis on one grid.
 */
export function TimeHeatmap({
  hours,
  height = 300,
  currency = "USD",
}: {
  hours: HourBucket[];
  height?: number;
  currency?: string;
}) {
  const { t } = useI18n();
  const tokens = useVizTokens();
  const privateMode = usePrivacy();
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const option = useMemo<EChartsOption | null>(() => {
    if (!tokens) return null;
    const categories = hours.map((h) => `${h.key}:00`);
    return {
      backgroundColor: "transparent",
      grid: [
        { left: 64, right: 16, top: 24, height: "48%" },
        { left: 64, right: 16, bottom: 28, height: "22%" },
      ],
      tooltip: {
        confine: true,
        trigger: "axis",
        backgroundColor: tokens.card,
        borderColor: tokens.border,
        borderWidth: 1,
        padding: [12, 14],
        extraCssText:
          "border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.1);line-height:1.6;",
        textStyle: { color: tokens.foreground, fontSize: 13 },
      },
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      xAxis: [
        {
          type: "category",
          data: categories,
          gridIndex: 0,
          axisLine: { lineStyle: { color: tokens.baseline } },
          axisLabel: { show: false },
          axisTick: { show: false },
        },
        {
          type: "category",
          data: categories,
          gridIndex: 1,
          axisLine: { lineStyle: { color: tokens.baseline } },
          axisLabel: { color: tokens.inkMuted, fontSize: 11 },
          axisTick: { show: false },
        },
      ],
      yAxis: [
        {
          type: "value",
          gridIndex: 0,
          name: privateMode ? t("Net P&L (hidden)") : t("Net P&L ({currency})", { currency }),
          nameTextStyle: { color: tokens.inkMuted, fontSize: 11 },
          splitLine: { lineStyle: { color: tokens.gridline } },
          axisLabel: {
            color: tokens.inkMuted,
            fontSize: 11,
            formatter: (value: number) => (privateMode ? "••••" : fmtNumber(value, 0)),
          },
        },
        {
          type: "value",
          gridIndex: 1,
          name: t("Trades"),
          nameTextStyle: { color: tokens.inkMuted, fontSize: 11 },
          splitLine: { show: false },
          axisLabel: { color: tokens.inkMuted, fontSize: 11 },
        },
      ],
      series: [
        {
          type: "bar",
          name: t("Net P&L"),
          tooltip: {
            valueFormatter: (value) =>
              privateMode ? t("Hidden") : fmtMoney(Number(value), currency),
          },
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: hours.map((h) => ({
            value: h.netPnl,
            itemStyle: {
              color: h.netPnl >= 0 ? tokens.profitFill : tokens.loss,
              borderRadius: h.netPnl >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4],
            },
          })),
          barMaxWidth: 26,
        },
        {
          type: "line",
          name: t("Trades"),
          tooltip: { valueFormatter: (value) => fmtNumber(Number(value), 0) },
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: hours.map((h) => h.trades),
          lineStyle: { color: tokens.inkMuted, width: 2 },
          itemStyle: { color: tokens.inkMuted },
          symbolSize: 6,
        },
      ],
    };
  }, [hours, tokens, privateMode, currency, t]);

  return (
    <div ref={host} style={{ height }}>
      {visible && option && <EChart key={String(privateMode)} option={option} height={height} />}
    </div>
  );
}
