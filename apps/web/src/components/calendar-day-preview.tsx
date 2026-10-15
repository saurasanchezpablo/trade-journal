"use client";

import type { CalendarPnlPoint } from "@/lib/calendar-insights";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n";
import { Pnl } from "./pnl";

/** A compact step chart: one step per closed trade, starting from zero each day. */
export function CalendarDayPreview({
  points,
  total,
  trades,
  currency,
  monetary,
}: {
  points: CalendarPnlPoint[];
  total: number;
  trades: number;
  currency: string;
  monetary: boolean;
}) {
  const low = Math.min(0, ...points.map((point) => point.cumNetPnl));
  const high = Math.max(0, ...points.map((point) => point.cumNetPnl));
  const y = (value: number) => (high === low ? 50 : 88 - ((value - low) / (high - low)) * 76);
  const baseline = y(0);
  const steps = points
    .map((point, index) => `H${8 + ((index + 1) / points.length) * 248} V${y(point.cumNetPnl)}`)
    .join(" ");
  const line = `M8 ${baseline} ${steps}`;
  const { t, tn } = useI18n();

  return (
    <div className="w-64 max-w-full">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs">{t("Running P&L")}</span>
        {monetary ? (
          <Pnl value={total} currency={currency} className="text-sm font-semibold" />
        ) : (
          <span className="text-xs">{t("Multiple currencies")}</span>
        )}
      </div>
      {monetary && points.length > 0 ? (
        <>
          <svg
            viewBox="0 0 264 100"
            role="img"
            aria-label={tn(
              trades,
              "Running net P&L across {count} closed trade",
              "Running net P&L across {count} closed trades",
            )}
            className={cn(
              "journal-calendar-pnl-preview my-2 block w-full",
              total > 0 ? "text-profit" : total < 0 ? "text-loss" : "text-muted-foreground",
            )}
          >
            <line
              x1="8"
              x2="256"
              y1={baseline}
              y2={baseline}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <path d={`${line} H256 V${baseline} Z`} fill="currentColor" fillOpacity={0.1} />
            <path
              className="journal-calendar-pnl-line"
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              pathLength="1"
            />
            <circle cx="256" cy={y(points.at(-1)!.cumNetPnl)} r="3" fill="currentColor" />
          </svg>
          <div className="flex justify-between text-[10px]">
            <span>{t("Before first close")}</span>
            <span>{t("After last close")}</span>
          </div>
          <p className="mt-2 text-[11px]">
            {tn(
              trades,
              "{count} closed trade · Net of fees",
              "{count} closed trades · Net of fees",
            )}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs">
          {!monetary
            ? t("Select accounts with one currency to view the running P&L.")
            : t("No closed trades on this day.")}
        </p>
      )}
    </div>
  );
}
