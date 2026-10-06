"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  clockLabel,
  plotTradePoints,
  type PlottedTrade,
  type TradeExplorerResponse,
  type TradeXAxis,
  type TradeYAxis,
} from "@/lib/trade-explorer";
import { useApi } from "@/lib/use-api";
import { ReportMarketEstimates } from "./report-market-estimates";
import { MonetaryValue } from "./privacy";
import { fmtMoney } from "@/lib/utils";
import { Pnl } from "./pnl";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { OptionSelect } from "./ui/option-select";
import { Skeleton } from "./ui/skeleton";
import { useI18n, useT } from "./i18n";

const TradeScatter = dynamic(
  () => import("./charts/trade-scatter").then((module) => module.TradeScatter),
  {
    loading: () => <ScatterLoading />,
  },
);
function ScatterLoading() {
  const t = useT();
  return (
    <div role="status" aria-label={t("Loading scatter plot")}>
      <Skeleton className="h-80" />
    </div>
  );
}
const PAGE_SIZE = 25;
const detailHref = (key: string) => `/trades/${encodeURIComponent(key)}`;

export function TradeExplorer({ query }: { query: string }) {
  const { data, error, loading, refresh } = useApi<TradeExplorerResponse>(
    `/api/trade-explorer?${query}`,
  );
  const { t, tx, intl } = useI18n();
  const [x, setX] = useState<TradeXAxis>("durationMinutes");
  const [y, setY] = useState<TradeYAxis>("netPnl");
  const [selected, setSelected] = useState<PlottedTrade | null>(null);
  const [page, setPage] = useState(0);
  const [tableOpen, setTableOpen] = useState(false);
  const points = useMemo(() => plotTradePoints(data?.points ?? [], x, y), [data, x, y]);
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(intl, {
        timeZone: data?.timeZone ?? "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [data?.timeZone, intl],
  );
  if (loading && !data)
    return (
      <div role="status" aria-label={t("Loading trade explorer")}>
        <Skeleton className="h-96" />
      </div>
    );
  if (error || !data)
    return (
      <div role="alert" className="rounded-xl border p-5">
        <p className="text-sm text-destructive">{error ?? t("Unable to load trade explorer.")}</p>
        <Button onClick={refresh} variant="outline" size="sm" className="mt-3">
          {t("Try again")}
        </Button>
      </div>
    );
  const currency = data.currencies[0] ?? "USD";
  const excursion = x === "mae" || x === "mfe" || y === "mae" || y === "mfe";
  const blocked = (y !== "realizedR" || excursion) && data.currencies.length > 1;
  const xTitle =
    x === "durationMinutes"
      ? t("Duration (minutes)")
      : x === "entryMinute"
        ? t("Entry time ({timeZone})", { timeZone: data.timeZone })
        : t("Estimated {measure} ({currency})", { measure: x.toUpperCase(), currency });
  const yTitle =
    y === "netPnl"
      ? t("Net P&L ({currency})", { currency })
      : y === "realizedR"
        ? t("Realized R")
        : t("Estimated {measure} ({currency})", { measure: y.toUpperCase(), currency });
  const value = (point: PlottedTrade) =>
    y === "mae" || y === "mfe" ? (
      <MonetaryValue>{fmtMoney(point.y, currency)}</MonetaryValue>
    ) : y === "netPnl" ? (
      <Pnl value={point.y} currency={currency} />
    ) : (
      <span className="tabular-nums">
        {point.y > 0 ? "+" : ""}
        {point.y.toFixed(2)}R
      </span>
    );
  const xValue = (point: PlottedTrade) =>
    x === "mae" || x === "mfe" ? (
      <MonetaryValue>{fmtMoney(point.x, currency)}</MonetaryValue>
    ) : x === "entryMinute" ? (
      clockLabel(point.x)
    ) : (
      t("{minutes} min", {
        minutes: point.x.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      })
    );
  const pages = Math.ceil(points.length / PAGE_SIZE);
  const shownPage = Math.min(page, Math.max(0, pages - 1));
  const table = (
    <div className="space-y-3 px-4 pb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <caption className="pb-3 text-left text-muted-foreground">
            {t(
              "All {count} comparable trades, newest close first. Each link opens the original trade.",
              { count: points.length },
            )}
          </caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-2 pr-3">
                {t("Trade / closed")}
              </th>
              <th scope="col" className="px-2 text-right">
                {xTitle}
              </th>
              <th scope="col" className="pl-2 text-right">
                {yTitle}
              </th>
            </tr>
          </thead>
          <tbody>
            {points.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE).map((point) => (
              <tr key={point.key} className="border-b last:border-0">
                <th scope="row" className="py-3 pr-3 font-normal">
                  <Link
                    href={detailHref(point.key)}
                    className="rounded underline underline-offset-4"
                  >
                    <span className="break-all font-medium">
                      {point.symbol} · {tx("group", point.direction)}
                    </span>
                    <span className="mt-1 block text-muted-foreground">
                      {date.format(new Date(point.closedAt))}
                    </span>
                  </Link>
                </th>
                <td className="px-2 text-right tabular-nums">{xValue(point)}</td>
                <td className="pl-2 text-right">{value(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={shownPage === 0}
            onClick={() => setPage(shownPage - 1)}
          >
            {t("Previous")}
          </Button>
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {t("Page {page} of {pages}", { page: shownPage + 1, pages })}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={shownPage === pages - 1}
            onClick={() => setPage(shownPage + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      )}
    </div>
  );
  return (
    <section className="space-y-4" aria-labelledby="trade-explorer-title" data-trade-explorer>
      <div>
        <h2 id="trade-explorer-title" className="text-lg font-semibold">
          {t("Trade explorer")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Compare individual trades, not group averages")} · {t("Active account and filters")} ·{" "}
          {data.timeZone}
        </p>
      </div>
      <ReportMarketEstimates
        points={data.points}
        currencies={data.currencies}
        onComplete={refresh}
      />
      <div className="flex flex-wrap gap-2" aria-label={t("Scatter plot presets")}>
        {(
          [
            ["durationMinutes", "netPnl", "Holding time"],
            ["mae", "netPnl", "MAE vs net P&L"],
            ["mfe", "netPnl", "MFE vs net P&L"],
            ["mae", "mfe", "MAE vs MFE"],
          ] as const
        ).map(([nextX, nextY, label]) => (
          <Button
            key={label}
            size="sm"
            variant={x === nextX && y === nextY ? "secondary" : "outline"}
            onClick={() => {
              setX(nextX);
              setY(nextY);
              setSelected(null);
              setPage(0);
            }}
          >
            {t(label)}
          </Button>
        ))}
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>
                {excursion
                  ? t("{x} vs {y}", { x: xTitle, y: yTitle })
                  : x === "durationMinutes"
                    ? t("Trade outcomes by holding time")
                    : t("Trade outcomes by entry time")}
              </CardTitle>
              <p className="mt-2 text-xs text-muted-foreground">
                {blocked
                  ? t("{count} closed trades", { count: data.points.length })
                  : t("{count} of {total} closed trades comparable", {
                      count: points.length,
                      total: data.points.length,
                    })}{" "}
                · {t("One point per trade")} ·{" "}
                {excursion ? t("Gross excursion estimates; net P&L after fees") : t("After fees")}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-3 sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-44">
                <label
                  htmlFor="trade-x-axis"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  {t("X axis")}
                </label>
                <OptionSelect
                  id="trade-x-axis"
                  value={x}
                  onValueChange={(value) => {
                    setX(value as TradeXAxis);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <option value="durationMinutes">{t("Duration (minutes)")}</option>
                  <option value="entryMinute">{t("Entry time")}</option>
                  <option value="mae">{t("Estimated MAE")}</option>
                  <option value="mfe">{t("Estimated MFE")}</option>
                </OptionSelect>
              </div>
              <div className="min-w-0 flex-1 sm:w-44">
                <label
                  htmlFor="trade-y-axis"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  {t("Y axis")}
                </label>
                <OptionSelect
                  id="trade-y-axis"
                  value={y}
                  onValueChange={(value) => {
                    setY(value as TradeYAxis);
                    setSelected(null);
                    setPage(0);
                  }}
                >
                  <option value="netPnl">{t("Net P&L")}</option>
                  <option value="realizedR">{t("Realized R")}</option>
                  <option value="mae">{t("Estimated MAE")}</option>
                  <option value="mfe">{t("Estimated MFE")}</option>
                </OptionSelect>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.points.length === 0 ? (
            <div className="py-10 text-center">
              <h3 className="font-medium">{t("No closed trades in this selection")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  "Change the date range or filters to explore your history. Open positions are excluded.",
                )}
              </p>
            </div>
          ) : blocked ? (
            <p role="note" className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              {t(
                "These trades use different currencies ({currencies}). Select accounts with one currency for monetary axes, or use Duration and Realized R to compare risk-normalized outcomes. No currency conversion is applied.",
                { currencies: data.currencies.join(", ") },
              )}
            </p>
          ) : (
            <>
              {points.length < data.points.length && (
                <p role="note" className="text-xs leading-relaxed text-muted-foreground">
                  {t("{count} trades excluded:", { count: data.points.length - points.length })}{" "}
                  {y === "realizedR"
                    ? `${t("realized R requires a valid planned stop-loss and any required contract multiplier;")} `
                    : ""}
                  {excursion
                    ? `${t("MAE/MFE require saved, current market-data estimates.")} `
                    : ""}
                  {t("Both axes require valid values and timestamps.")}
                </p>
              )}
              {y === "realizedR" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "R = net P&L ÷ planned risk from your stop-loss. Uses weighted entry and total entry quantity; it does not measure maximum intratrade risk.",
                  )}
                </p>
              )}
              {points.length >= (excursion ? 1 : 8) ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{yTitle}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        <span aria-hidden="true" className="text-[var(--profit)]">
                          ●
                        </span>{" "}
                        {t("Positive net P&L")}
                      </span>
                      <span>
                        <span aria-hidden="true" className="text-[var(--loss)]">
                          ●
                        </span>{" "}
                        {t("Negative net P&L")}
                      </span>
                      <span>
                        <span aria-hidden="true">●</span> {t("Zero net P&L")}
                      </span>
                    </span>
                  </div>
                  <TradeScatter
                    points={points}
                    x={x}
                    y={y}
                    currency={currency}
                    timeZone={data.timeZone}
                    onSelect={setSelected}
                  />
                  <p className="text-center text-xs text-muted-foreground">{xTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "Select a point to inspect its trade. Overlapping points remain individually accessible in the table.",
                    )}
                  </p>
                  <div aria-live="polite">
                    {selected && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
                        <div>
                          <p className="text-sm font-medium break-all">
                            {selected.symbol} · {tx("group", selected.direction)} ·{" "}
                            {value(selected)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {xValue(selected)} ·{" "}
                            {t("Closed {date}", { date: date.format(new Date(selected.closedAt)) })}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={detailHref(selected.key)}
                            className="rounded text-sm underline underline-offset-4"
                          >
                            {t("Open trade")} ↗
                          </Link>
                          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                            {t("Dismiss")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
                  {points.length === 0
                    ? t(
                        "No trades have the data required for these axes. Try another axis or adjust your filters.",
                      )
                    : t(
                        "Fewer than 8 comparable trades. Review the exact values below, or widen your filters to reveal a useful scatter plot.",
                      )}
                </p>
              )}
              {points.length > 0 && points.length < 20 && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Small sample: treat apparent patterns cautiously until more trades are available.",
                  )}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {!blocked &&
        points.length > 0 &&
        (points.length < 8 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("Comparable trades")}</CardTitle>
            </CardHeader>
            {table}
          </Card>
        ) : (
          <details
            className="rounded-xl border bg-card"
            onToggle={(event) => setTableOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium">
              {t("Explore all {count} trades", { count: points.length })}
            </summary>
            {tableOpen && table}
          </details>
        ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "Duration is elapsed time from first entry to final exit, including overnight hours. Entry time uses the journal timezone; midnight neighbors appear at opposite ends of that axis. Patterns describe this selection, not causation or a recommended holding time.",
        )}
      </p>
    </section>
  );
}
