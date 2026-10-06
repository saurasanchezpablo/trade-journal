"use client";

import { useState } from "react";
import { useApi } from "@/lib/use-api";
import type { DayTypeBreakdown } from "@/server/day-types";
import { Pnl } from "./pnl";
import { Button } from "./ui/button";
import { SectionCard } from "./section-card";
import { useI18n } from "./i18n";

const PERIODS = [30, 90, 180, 365] as const;

/**
 * Closed trades split by the kind of day they closed on, computed from each symbol's daily
 * candles (fetched on request, so opening the journal never calls a market data source).
 */
export function DayTypeStats() {
  const { t } = useI18n();
  const [days, setDays] = useState<(typeof PERIODS)[number] | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(90);
  const { data, error, loading, refresh } = useApi<DayTypeBreakdown>(
    days ? `/api/day-types?days=${days}` : null,
  );
  // The breakdown covers every account: amounts show in their currency when all accounts
  // share one, and not at all when they differ (a sum across currencies means nothing).
  const { data: accountData } = useApi<{ accounts: { currency: string }[] }>(
    days ? "/api/accounts" : null,
  );
  const currencies = accountData
    ? [...new Set(accountData.accounts.map((a) => a.currency || "USD"))]
    : null;
  const currency = currencies?.length === 1 ? currencies[0] : null;
  return (
    <SectionCard
      id="journal-day-types"
      title={t("Results by day type")}
      contentClassName="space-y-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("Period")}
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value) as (typeof PERIODS)[number])}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {t("Last {count} days", { count: p })}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => (days === period ? refresh() : setDays(period))}
        >
          {data && days === period ? t("Refresh") : t("Show")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("Trend or range, quiet or volatile, news or not: from each symbol's daily candles.")}
        </span>
      </div>
      {loading && <p className="text-muted-foreground">{t("Reading daily candles…")}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {data && !loading && (
        <>
          {data.rows.length === 0 ? (
            <p className="text-muted-foreground">
              {t("No closed trades with candles in this period.")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">{t("Day type")}</th>
                  <th className="py-1 text-right font-medium">{t("Trades")}</th>
                  <th className="py-1 text-right font-medium">{t("Win rate")}</th>
                  <th className="py-1 text-right font-medium">{t("Net P&L")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.tag} className="border-t">
                    <td className="py-1">{t(row.tag)}</td>
                    <td className="tnum py-1 text-right">{row.trades}</td>
                    <td className="tnum py-1 text-right">
                      {Math.round((row.wins / row.trades) * 100)}%
                    </td>
                    <td className="py-1 text-right">
                      {currency ? (
                        <Pnl value={row.netPnl} currency={currency} />
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground">
            {t("Each trade counts once per group (shape, volatility, news).")}
            {currencies && currencies.length > 1
              ? ` ${t("Your accounts use {currencies}, so net P&L is not added across them.", { currencies: currencies.join(", ") })}`
              : ""}
            {data.symbols.some((s) => s.problem) &&
              ` ${t("Left out: {symbols}.", {
                symbols: data.symbols
                  .filter((s) => s.problem)
                  .map((s) => `${s.symbol} (${t(s.problem!)})`)
                  .join(", "),
              })}`}
          </p>
        </>
      )}
    </SectionCard>
  );
}
