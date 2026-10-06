"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import type { DayStats } from "@luxalgo/journal-core";
import { calendarTradeHref, type CalendarResponse } from "@/lib/calendar-insights";
import { cn, fmtMoney, fmtPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { HelpHint, HoverHint } from "./ui/tooltip";
import { Pnl } from "./pnl";
import { usePrivacy } from "./privacy";
import { useI18n, useT } from "./i18n";
// Keep the calendar and summaries usable before the plotting bundle loads.
const CalendarDailyChart = dynamic(
  () => import("./charts/calendar-daily-chart").then((module) => module.CalendarDailyChart),
  {
    loading: () => <ChartLoading />,
  },
);

function ChartLoading() {
  const t = useT();
  return (
    <div
      role="status"
      aria-label={t("Loading daily performance chart")}
      className="h-60 rounded-lg bg-muted/20"
    />
  );
}

/** Short day labels ("Sep 4", "4 sept") in the journal's language. */
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateLabel = (date: string, intl: string) => {
  let formatter = dateFormatters.get(intl);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intl, { month: "short", day: "numeric", timeZone: "UTC" });
    dateFormatters.set(intl, formatter);
  }
  return formatter.format(new Date(`${date}T12:00:00Z`));
};
/** The weekday keys of core's calendar, Sunday first, translated in the "group" context. */
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Metric({
  title,
  value,
  detail,
  hint,
}: {
  title: string;
  value: ReactNode;
  detail: ReactNode;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <HelpHint heading={title}>{hint}</HelpHint>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

export function CalendarPerformance({ data, query }: { data: CalendarResponse; query: string }) {
  const { t, tx, tn, intl } = useI18n();
  const { insights: i, scope, timeZone, currencies } = data;
  const shortDate = (date: string) => dateLabel(date, intl);
  const weekdayName = (label: string) => t(label);
  const shortWeekday = (index: number) => tx("group", SHORT_WEEKDAYS[index] ?? "");
  const currency = currencies[0] ?? "USD";
  const mixed = currencies.length > 1;
  const privateMode = usePrivacy();
  const router = useRouter();
  const [weekday, setWeekday] = useState<number | null>(null);
  const href = (date?: string) => calendarTradeHref(query, scope, date);
  const money = (value: number | null) =>
    value === null || mixed ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <Pnl value={value} currency={currency} />
    );
  const selected = weekday === null ? null : i.weekdays[weekday]!;
  const peak = Math.max(1, ...i.weekdays.map((day) => Math.abs(day.netPnl)));
  const dayLink = (day: DayStats | null) =>
    day && !mixed ? (
      <Link
        href={href(day.date)}
        className="inline-flex max-w-full items-center gap-2 rounded text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {money(day.netPnl)}
        <span className="text-xs font-normal text-muted-foreground">{shortDate(day.date)}</span>
        <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
      </Link>
    ) : (
      money(null)
    );
  return (
    <section
      aria-labelledby="calendar-insights-heading"
      className="space-y-3"
      data-calendar-insights
    >
      <div className="flex flex-wrap items-end justify-between gap-2 pt-3">
        <div>
          <h2 id="calendar-insights-heading" className="text-base font-semibold tracking-tight">
            {t("Performance insights")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Visible month × active filters · Closed trades, after fees · {timeZone}", {
              timeZone,
            })}
          </p>
        </div>
        {i.trades > 0 && (
          <Link
            href={href()}
            className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("View matching trades")} <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      {!i.tradingDays ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarDays aria-hidden="true" className="mb-1 size-6 text-muted-foreground" />
            <h3 className="text-sm font-medium">{t("No closed trades in this view")}</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {t(
                "Choose another month or adjust your account and filters. Open positions and days without trades aren’t included in performance insights.",
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {mixed && (
            <p
              role="status"
              className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              {t(
                "These trades use {currencies}. Select accounts with one currency to compare monetary performance; no exchange-rate conversion is applied.",
                { currencies: currencies.join(", ") },
              )}
            </p>
          )}
          <div className="grid gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Metric
              title={t("Net P&L")}
              value={money(i.netPnl)}
              detail={`${tn(i.tradingDays, "{count} trading day", "{count} trading days")}${mixed ? "" : ` · ${currency}`}`}
              hint={t(
                "Sum of net P&L for closed trades in this month and filter selection. Includes fees. No currency conversion.",
              )}
            />
            <Metric
              title={t("Average daily P&L")}
              value={money(i.avgDailyPnl)}
              detail={t("Per day with closed trades")}
              hint={t(
                "Net P&L divided by trading days. Days without closed trades are excluded; break-even trading days are included.",
              )}
            />
            <Metric
              title={t("Trade win rate")}
              value={fmtPercent(i.winRate)}
              detail={t("{wins} wins · {losses} losses · {breakevens} break-even", {
                wins: i.wins,
                losses: i.losses,
                breakevens: i.breakevens,
              })}
              hint={t(
                "Winning closed trades divided by all closed trades, including break-even trades. Uses your journal's configured break-even rule.",
              )}
            />
            <Metric
              title={t("Total closed trades")}
              value={
                <Link
                  className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  href={href()}
                >
                  {i.trades}
                </Link>
              }
              detail={t("Round-trip trades, not executions")}
              hint={t(
                "Counts completed trades whose closing day falls in the visible month and selected date range, with all other filters applied.",
              )}
            />
          </div>
          {!mixed && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("Best & worst day")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">{t("Best day")}</span>
                      {dayLink(i.bestDay)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">{t("Worst day")}</span>
                      {dayLink(i.worstDay)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.tradingDays === 1
                        ? t("One trading day; both extrema are the same.")
                        : t("Highest and lowest daily net P&L.")}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("Average green & red day")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {tn(i.greenDays, "{count} profitable day", "{count} profitable days")}
                      </span>
                      {money(i.avgGreenDay)}
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {tn(i.redDays, "{count} losing day", "{count} losing days")}
                      </span>
                      {money(i.avgRedDay)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("Each average uses only its own group.")}
                    </p>
                  </CardContent>
                </Card>
                <Metric
                  title={t("Day consistency")}
                  value={fmtPercent(i.profitableDayRate)}
                  detail={t("{green} positive · {red} negative · {flat} flat days", {
                    green: i.greenDays,
                    red: i.redDays,
                    flat: i.flatDays,
                  })}
                  hint={t(
                    "Share of trading days with strictly positive net P&L. This is a profitable-day rate, not a risk-adjusted score or a prediction. Flat days stay in the denominator.",
                  )}
                />
              </div>
              <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium">{t("Daily performance")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("Net P&L by closing day")} · {currency}
                      {i.tradingDays >= 8 ? ` · ${t("Dashed line: 5-trading-day average")}` : ""}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {i.tradingDays >= 2 ? (
                      <CalendarDailyChart
                        data={i.trend}
                        currency={currency}
                        onInspect={(date) => router.push(href(date))}
                      />
                    ) : (
                      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-muted/30 p-5 text-center">
                        <span className="text-sm font-medium">
                          {t("A trend needs more than one day")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {shortDate(i.days[0]!.date)} · {money(i.netPnl)} ·{" "}
                          {tn(i.trades, "{count} closed trade", "{count} closed trades")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("Explore an earlier month with more trading history.")}
                        </span>
                      </div>
                    )}
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        {t("Daily values & trade links ({count})", { count: i.tradingDays })}
                      </summary>
                      <div className="mt-2 max-h-60 overflow-auto">
                        <table className="w-full text-left text-xs">
                          <caption className="sr-only">
                            {t("Daily results for the current month and filters")}
                          </caption>
                          <thead className="sticky top-0 bg-card text-muted-foreground">
                            <tr>
                              <th scope="col" className="py-2 font-medium">
                                {t("Closing day")}
                              </th>
                              <th scope="col" className="text-right font-medium">
                                {t("Trades")}
                              </th>
                              <th scope="col" className="text-right font-medium">
                                {t("Net P&L")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {i.days.map((row) => (
                              <tr key={row.date} className="border-t">
                                <th scope="row" className="py-2 font-normal">
                                  <Link
                                    href={href(row.date)}
                                    className="rounded underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {shortDate(row.date)}
                                  </Link>
                                </th>
                                <td className="text-right tabular-nums">{row.trades}</td>
                                <td className="text-right">{money(row.netPnl)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <h3 className="text-sm font-medium">{t("Performance by weekday")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("Closing-day net P&L")} · {currency} · {t("Select a row")}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 rounded-lg bg-muted/40 px-3 py-2">
                      <div className="text-[11px] text-muted-foreground">
                        {t("Most profitable weekday")}
                      </div>
                      <div className="mt-0.5 flex flex-wrap justify-between gap-1 text-sm font-medium">
                        {i.mostProfitableWeekday ? (
                          <>
                            <span>{weekdayName(i.mostProfitableWeekday.label)}</span>
                            {money(i.mostProfitableWeekday.netPnl)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("No profitable weekday yet")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {i.weekdays.map((day) => (
                        <HoverHint
                          key={day.index}
                          heading={weekdayName(day.label)}
                          content={`${tn(day.days.length, "{count} trading day", "{count} trading days")} · ${tn(day.trades, "{count} closed trade", "{count} closed trades")} · ${privateMode ? t("P&L hidden") : fmtMoney(day.netPnl, currency)}`}
                        >
                          <button
                            type="button"
                            disabled={!day.trades}
                            onClick={() => setWeekday(weekday === day.index ? null : day.index)}
                            aria-pressed={weekday === day.index}
                            aria-label={
                              privateMode
                                ? t("{weekday}: {trades} trades. Inspect closing days.", {
                                    weekday: weekdayName(day.label),
                                    trades: day.trades,
                                  })
                                : t("{weekday}: {trades} trades, {pnl}. Inspect closing days.", {
                                    weekday: weekdayName(day.label),
                                    trades: day.trades,
                                    pnl: fmtMoney(day.netPnl, currency),
                                  })
                            }
                            className={cn(
                              "grid w-full grid-cols-[2rem_minmax(0,1fr)_5.75rem] items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:bg-transparent",
                              weekday === day.index && "bg-accent",
                            )}
                          >
                            <span>{shortWeekday(day.index)}</span>
                            <span aria-hidden="true" className="relative h-4">
                              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                              <span
                                className={cn(
                                  "absolute top-1 h-2 rounded-sm",
                                  day.netPnl > 0
                                    ? "bg-profit"
                                    : day.netPnl < 0
                                      ? "bg-loss"
                                      : "bg-muted-foreground",
                                )}
                                style={{
                                  left:
                                    day.netPnl < 0
                                      ? `${50 - (Math.abs(day.netPnl) / peak) * 50}%`
                                      : "50%",
                                  width:
                                    day.netPnl === 0
                                      ? "2px"
                                      : `${(Math.abs(day.netPnl) / peak) * 50}%`,
                                }}
                              />
                            </span>
                            <span className="text-right">
                              {day.trades ? money(day.netPnl) : "—"}
                            </span>
                          </button>
                        </HoverHint>
                      ))}
                    </div>
                    {selected && (
                      <div className="mt-3 border-t pt-3" aria-live="polite">
                        <p className="mb-2 text-xs font-medium">
                          {t("{weekday} · {trades} trades across {days} days", {
                            weekday: weekdayName(selected.label),
                            trades: selected.trades,
                            days: selected.days.length,
                          })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selected.days.map((row) => (
                            <Link
                              key={row.date}
                              href={href(row.date)}
                              className="rounded-md border px-2 py-1.5 text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {shortDate(row.date)}{" "}
                              <span className="text-muted-foreground">
                                · {tn(row.trades, "{count} trade", "{count} trades")}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              {i.tradingDays < 5 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {tn(
                    i.tradingDays,
                    "Small sample: {count} trading day. Weekday results and consistency describe this selection only.",
                    "Small sample: {count} trading days. Weekday results and consistency describe this selection only.",
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
