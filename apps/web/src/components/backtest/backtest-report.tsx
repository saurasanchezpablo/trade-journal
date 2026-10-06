"use client";

import type { BacktestReport, BacktestSideReport } from "@luxalgo/journal-core";
import { EquityArea } from "@/components/charts/equity-area";
import { Pnl } from "@/components/pnl";
import { useI18n } from "@/components/i18n";
import { MonetaryValue } from "@/components/privacy";
import { fmtAmount } from "@/lib/backtest-replay";
import { fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";

const ratio = (value: number | null, infinite = false) =>
  infinite ? "∞" : value === null ? "–" : fmtNumber(value);
const rText = (value: number | null) =>
  value === null ? "–" : `${value > 0 ? "+" : ""}${fmtNumber(value)} R`;

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum text-sm font-medium">{children}</p>
    </div>
  );
}

function SideRow({
  label,
  side,
  currency,
}: {
  label: string;
  side: BacktestSideReport;
  currency: string;
}) {
  return (
    <tr className="border-t">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted-foreground">
        {label}
      </th>
      <td className="tnum py-1.5 pr-3">{side.trades}</td>
      <td className="tnum py-1.5 pr-3">{fmtPercent(side.winRate)}</td>
      <td className="py-1.5 pr-3">
        <Pnl value={side.netProfit} currency={currency} />
      </td>
      <td className="tnum py-1.5 pr-3">{ratio(side.profitFactor, side.profitFactorIsInfinite)}</td>
      <td className="tnum py-1.5">{rText(side.avgR)}</td>
    </tr>
  );
}

/** A tester's performance summary: results, risk, the equity curve, and long against short. */
export function BacktestReportView({
  report,
  currency,
  initialBalance,
}: {
  report: BacktestReport;
  currency: string;
  initialBalance: number;
}) {
  const { t, tn, tx } = useI18n();
  if (report.trades === 0)
    return <p className="text-sm text-muted-foreground">{t("No closed trades yet.")}</p>;
  const money = (value: number | null) =>
    value === null ? "–" : <MonetaryValue>{fmtMoney(value, currency)}</MonetaryValue>;
  const amount = (value: number | null) =>
    value === null ? "–" : <MonetaryValue>{fmtAmount(value, currency)}</MonetaryValue>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={t("Net profit")}>
          <Pnl value={report.netProfit} currency={currency} />
          {report.returnPct !== null && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({report.returnPct > 0 ? "+" : ""}
              {fmtPercent(report.returnPct)})
            </span>
          )}
        </Stat>
        <Stat label={t("Closed trades")}>
          {report.trades}{" "}
          <span className="text-xs text-muted-foreground">
            {t("{wins} W · {losses} L · {breakeven} BE", {
              wins: report.wins,
              losses: report.losses,
              breakeven: report.breakeven,
            })}
          </span>
        </Stat>
        <Stat label={t("Win rate")}>{fmtPercent(report.winRate)}</Stat>
        <Stat label={t("Profit factor")}>
          {ratio(report.profitFactor, report.profitFactorIsInfinite)}
        </Stat>
        <Stat label={t("Average R")}>{rText(report.avgR)}</Stat>
        <Stat label={t("Expectancy (avg trade)")}>
          {report.avgTrade === null ? "–" : <Pnl value={report.avgTrade} currency={currency} />}
        </Stat>
        <Stat label={t("Avg win / avg loss")}>
          {amount(report.avgWin)} / {amount(report.avgLoss)}{" "}
          <span className="text-xs text-muted-foreground">({ratio(report.payoff)})</span>
        </Stat>
        <Stat label={t("Largest win / loss")}>
          {money(report.largestWin)} / {money(report.largestLoss)}
        </Stat>
        <Stat label={t("Max drawdown")}>
          {money(-report.maxDrawdown)}{" "}
          <span className="text-xs text-muted-foreground">
            ({fmtPercent(report.maxDrawdownPct)})
          </span>
        </Stat>
        <Stat label={t("Streaks")}>
          {t("{wins} wins · {losses} losses", {
            wins: report.maxConsecutiveWins,
            losses: report.maxConsecutiveLosses,
          })}
        </Stat>
        <Stat label={t("Gross profit / loss")}>
          {money(report.grossProfit)} / {money(-report.grossLoss)}
        </Stat>
        <Stat label={t("Commission paid")}>{amount(report.commission)}</Stat>
        <Stat label={t("Avg candles in a trade")}>
          {report.avgBars === null ? "–" : fmtNumber(report.avgBars, 1)}
        </Stat>
        <Stat label={t("Starting balance")}>{amount(initialBalance)}</Stat>
        <Stat label={t("Candle-order calls")}>
          {report.ambiguous}
          <span className="ml-1 text-xs text-muted-foreground">
            {tn(
              report.ambiguous,
              "trade decided by the same-candle rule",
              "trades decided by the same-candle rule",
            )}
          </span>
        </Stat>
      </div>
      <EquityArea
        currency={currency}
        data={report.equity.map((point, i) => ({
          t:
            i === 0
              ? t("Start")
              : new Date(point.time).toISOString().slice(0, 16).replace("T", " "),
          cumNetPnl: point.equity - initialBalance,
        }))}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-3 font-normal" />
              <th className="py-1 pr-3 font-normal">{t("Trades")}</th>
              <th className="py-1 pr-3 font-normal">{t("Win rate")}</th>
              <th className="py-1 pr-3 font-normal">{t("Net profit")}</th>
              <th className="py-1 pr-3 font-normal">{t("Profit factor")}</th>
              <th className="py-1 font-normal">{t("Avg R")}</th>
            </tr>
          </thead>
          <tbody>
            <SideRow label={tx("trades", "All")} side={report} currency={currency} />
            <SideRow label={t("Long")} side={report.long} currency={currency} />
            <SideRow label={t("Short")} side={report.short} currency={currency} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
