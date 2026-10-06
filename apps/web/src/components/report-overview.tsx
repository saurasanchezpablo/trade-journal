"use client";

import type { AnalysisFilters, BucketStats } from "@luxalgo/journal-core";
import { TimeHeatmap } from "./charts/time-heatmap";
import { ReviewExport } from "./review-export";
import { MonetaryValue } from "./privacy";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useApi } from "@/lib/use-api";
import { fmtMoney, fmtPercent, pnlClass } from "@/lib/utils";
import { describeFilters } from "@/lib/filter-description";
import { useI18n } from "./i18n";

interface OverviewData {
  buckets: Record<
    "symbol" | "tag" | "mistake" | "playbook" | "weekday" | "hour" | "duration" | "direction",
    BucketStats[]
  >;
  currencies: string[];
  timeZone: string;
  accounts: { id: string; name: string }[];
  playbooks: { id: string; name: string }[];
}

// Keep the original overview's aggregations and ordering alongside the advanced reports.
// `column` is the table's first heading (translated in the "column" context).
const SECTIONS = [
  { key: "symbol", title: "By symbol", column: "symbol" },
  { key: "direction", title: "Long vs short", column: "Long vs short" },
  { key: "weekday", title: "By weekday", column: "weekday" },
  { key: "duration", title: "By holding time", column: "holding time" },
  { key: "tag", title: "By tag", column: "tag" },
  { key: "mistake", title: "By mistake", column: "mistake" },
  { key: "playbook", title: "By playbook", column: "playbook" },
] as const;

export function ReportOverview({ query, filters }: { query: string; filters: AnalysisFilters }) {
  const { t, tx } = useI18n();
  const { data, error, loading } = useApi<OverviewData>(`/api/stats?${query}`);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (loading || !data) return <Skeleton className="h-72" />;
  if (data.currencies.length > 1)
    return (
      <p className="rounded-lg border p-4 text-sm">
        {t(
          "These accounts use different currencies ({currencies}). Select accounts with the same currency in Filters to compare monetary results.",
          { currencies: data.currencies.join(", ") },
        )}
      </p>
    );
  const currency = data.currencies[0] ?? "USD";
  // Names people typed stay as they are; the journal's weekdays and sides are translated.
  const label = (dimension: string, key: string) =>
    dimension === "playbook"
      ? (data.playbooks.find((book) => book.id === key)?.name ?? key)
      : dimension === "weekday" || dimension === "direction"
        ? tx("group", key)
        : key;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("Trading overview")} · {data.timeZone} · {currency}
        </p>
        <ReviewExport
          containsFinancialData
          document={{
            title: t("Trading overview"),
            subtitle: `${data.timeZone} · ${currency}`,
            lines: [
              t("Filters: {filters}", {
                filters: describeFilters(filters, data.accounts, data.playbooks),
              }),
              "",
              t("Trade time performance (opening hour)"),
              ...data.buckets.hour.map(
                (b) =>
                  `${b.key}:00: ${t("{trades} trades | Net P&L {pnl}", {
                    trades: b.trades,
                    pnl: fmtMoney(b.netPnl, currency),
                  })}`,
              ),
              ...SECTIONS.flatMap((section) => [
                "",
                t(section.title),
                ...data.buckets[section.key].map(
                  (b) =>
                    `${label(section.key, b.key)}: ${t(
                      "{trades} trades | Win {win} | Net P&L {pnl}",
                      {
                        trades: b.trades,
                        win: fmtPercent(b.winRate, 0),
                        pnl: fmtMoney(b.netPnl, currency),
                      },
                    )}`,
                ),
              ]),
            ],
          }}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("Trade time performance")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeHeatmap hours={data.buckets.hour} currency={currency} />
          </CardContent>
        </Card>
        {SECTIONS.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle>{t(section.title)}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.buckets[section.key].length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {section.key === "tag" || section.key === "mistake" || section.key === "playbook"
                    ? t("Annotate trades to unlock this breakdown.")
                    : t("No data yet.")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tx("column", section.column)}</TableHead>
                      <TableHead className="text-right">{t("Trades")}</TableHead>
                      <TableHead className="text-right">{t("Win %")}</TableHead>
                      <TableHead className="text-right">{t("Net P&L")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.buckets[section.key].map((bucket) => (
                      <TableRow key={bucket.key}>
                        <TableCell className="font-medium">
                          {label(section.key, bucket.key)}
                        </TableCell>
                        <TableCell className="tnum text-right text-muted-foreground">
                          {bucket.trades}
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {fmtPercent(bucket.winRate, 0)}
                        </TableCell>
                        <TableCell className={`tnum text-right ${pnlClass(bucket.netPnl)}`}>
                          <MonetaryValue>{fmtMoney(bucket.netPnl, currency)}</MonetaryValue>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "Weekday and hour use trade opening times. Overview trade counts include open positions; win rates use closed trades. Holding time requires a closed trade. Tags and mistakes can overlap. By symbol shows the top 20 by net P&L; Breakdowns includes every symbol and additional metrics for closed trades.",
        )}
      </p>
    </div>
  );
}
