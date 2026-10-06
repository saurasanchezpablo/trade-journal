"use client";

import { useState } from "react";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { EdgeScoreComponents } from "@luxalgo/journal-core";
import { useI18n } from "../i18n";
import { tooltipStyle, useVizTokens } from "./tokens";
import { ChartFrame } from "./chart-frame";

const LABELS: Record<keyof EdgeScoreComponents, string> = {
  winRate: "Win %",
  profitFactor: "Profit factor",
  avgWinLoss: "Avg win/loss",
  drawdown: "Drawdown",
  recovery: "Recovery",
  consistency: "Consistency",
};

/** The open Edge Score, drawn from its six 0-100 components. */
export function EdgeRadar({
  components,
  height = 220,
}: {
  components: EdgeScoreComponents;
  height?: number | `${number}%`;
}) {
  const { t, tx } = useI18n();
  const tokens = useVizTokens();
  const [radius, setRadius] = useState(48);
  if (!tokens) return <div style={{ height }} />;
  const data = (Object.keys(LABELS) as (keyof EdgeScoreComponents)[]).map((key) => ({
    // Short axis names: the radar has little room around it.
    metric: tx("radar", LABELS[key]),
    value: Math.round(components[key]),
  }));
  return (
    <ChartFrame height={height}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        onResize={(width, height) =>
          setRadius(Math.max(20, Math.min(width / 2 - 84, height / 2 - 34)))
        }
      >
        <RadarChart className="journal-edge-radar" data={data} outerRadius={radius}>
          <PolarGrid stroke={tokens.gridline} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <PolarAngleAxis dataKey="metric" tick={{ fill: tokens.inkMuted, fontSize: 11 }} />
          <Tooltip
            cursor={false}
            allowEscapeViewBox={{ x: false, y: false }}
            contentStyle={tooltipStyle(tokens)}
            formatter={(value) => [`${value}/100`, t("Score")]}
          />
          <Radar
            dataKey="value"
            stroke={tokens.brand}
            fill={tokens.brand}
            fillOpacity={0.28}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
