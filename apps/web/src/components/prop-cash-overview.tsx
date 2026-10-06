"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Card, CardContent } from "./ui/card";
import { useVizTokens, tooltipStyle } from "./charts/tokens";
import { cashSummary, currencyDigits, propMoney } from "@/lib/prop-firms";
import { useI18n } from "./i18n";

type Summary = ReturnType<typeof cashSummary>;
export function PropCashSummary({
  summary,
  currency,
  privacy,
}: {
  summary: Summary;
  currency: string;
  privacy: boolean;
}) {
  const { t } = useI18n();
  const money = (value: number) => (privacy ? "••••" : currency ? propMoney(value, currency) : "—");
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2 w-2 rounded-full bg-[var(--loss)]" />
            {t("Money spent")}
          </p>
          <p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums">
            {money(summary.spent)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("All fees, subscriptions and other costs")}
          </p>
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-3 text-xs">
            <span className="text-muted-foreground">
              {t("Refunded")} <span className="text-foreground">{money(summary.refunds)}</span>
            </span>
            <span className="text-muted-foreground">
              {t("Net cost")} <span className="text-foreground">{money(summary.netSpend)}</span>
            </span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
            {t("Payouts received")}
          </p>
          <p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums">
            {money(summary.received)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Money received, after any reversals")}
          </p>
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            {t("Pending requests are tracked separately below.")}
          </p>
        </CardContent>
      </Card>
      <Card className="bg-muted/30">
        <CardContent className="p-5 sm:p-6">
          <p className="text-sm font-medium">{t("Net after costs")}</p>
          <p
            className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums"
            style={{
              color:
                privacy || !currency
                  ? undefined
                  : summary.net < 0
                    ? "var(--loss)"
                    : summary.net > 0
                      ? "var(--profit)"
                      : undefined,
            }}
          >
            {money(summary.net)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Payouts received + refunds − money spent")}
          </p>
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            {t("Return on net cost")}{" "}
            <span className="text-foreground">
              {privacy
                ? "••••"
                : !currency || summary.roi === null
                  ? "—"
                  : `${(summary.roi * 100).toFixed(1)}%`}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
export function PropCashComparison({
  months,
  currency,
  privacy,
}: {
  months: (Summary & { month: string })[];
  currency: string;
  privacy: boolean;
}) {
  const viz = useVizTokens();
  const { t, intl } = useI18n();
  const divisor = currency ? 10 ** currencyDigits(currency) : 1;
  const rows = [...months]
    .reverse()
    .map((row) => ({ ...row, spent: row.spent / divisor, received: row.received / divisor }));
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{t("Spending vs payouts")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Monthly cash flow")}
              {currency ? ` · ${currency}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--loss)]" />
              {t("Money spent")}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--brand)]" />
              {t("Payouts received")}
            </span>
          </div>
        </div>
        {privacy || !currency || !rows.length ? (
          <p className="flex min-h-48 items-center justify-center text-center text-sm text-muted-foreground">
            {privacy
              ? t("Chart hidden in privacy mode.")
              : !currency
                ? t("Choose a currency in Filters to compare spending and payouts.")
                : t("Record an expense or a payout receipt to start your comparison.")}
          </p>
        ) : (
          <div className="h-64 min-w-0 sm:h-72">
            {viz && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  accessibilityLayer
                  data={rows}
                  margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid vertical={false} stroke={viz.gridline} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                    tick={{ fill: viz.inkMuted, fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Intl.DateTimeFormat(intl, {
                        month: "short",
                        year: "2-digit",
                        timeZone: "UTC",
                      }).format(new Date(`${v}-01T12:00:00Z`))
                    }
                  />
                  <YAxis
                    width={65}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: viz.inkMuted, fontSize: 11 }}
                    tickFormatter={(v) =>
                      new Intl.NumberFormat("en", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(v)
                    }
                  />
                  <ReferenceLine y={0} stroke={viz.baseline} />
                  <Tooltip
                    cursor={{ fill: viz.gridline, opacity: 0.35 }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div style={tooltipStyle(viz)}>
                          <p className="mb-1 font-medium">{String(label)}</p>
                          {payload.map((item) => (
                            <p key={String(item.dataKey)}>
                              {item.name}:{" "}
                              {propMoney(Math.round(Number(item.value) * divisor), currency)}
                            </p>
                          ))}
                          <p>
                            {t("Refunds: {amount}", {
                              amount: propMoney(payload[0]!.payload.refunds, currency),
                            })}
                          </p>
                          <p className="mt-1 border-t pt-1">
                            {t("Net after costs: {amount}", {
                              amount: propMoney(payload[0]!.payload.net, currency),
                            })}
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar
                    name={t("Money spent")}
                    dataKey="spent"
                    fill={viz.loss}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                    isAnimationActive={false}
                  />
                  <Bar
                    name={t("Payouts received")}
                    dataKey="received"
                    fill={viz.brand}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {t("Refunds reduce your net cost. Hover a month for refunds and the final net amount.")}
        </p>
      </CardContent>
    </Card>
  );
}
