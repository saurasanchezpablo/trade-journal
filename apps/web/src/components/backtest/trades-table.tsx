"use client";

import { useEffect, useState } from "react";
import type { BacktestTrade } from "@luxalgo/journal-core";
import { Pnl } from "@/components/pnl";
import { useI18n, useT } from "@/components/i18n";
import { MonetaryValue } from "@/components/privacy";
import { formatTimestamp } from "@/lib/timezone";
import { fmtMoney, fmtNumber } from "@/lib/utils";

const REASONS: Record<BacktestTrade["exitReason"], string> = {
  stop: "Stop",
  target: "Target",
  manual: "By hand",
  end: "Session end",
};

function Note({ value, onSave }: { value: string; onSave: (note: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={t("Trade note")}
      className="w-full min-w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-input focus:border-input focus:outline-none"
      value={draft}
      placeholder={t("Add a note")}
      maxLength={2000}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

/** The session's closed trades, newest first, each with its exit reason, R and a note. */
export function TradesTable({
  trades,
  currency,
  timeZone,
  onNote,
}: {
  trades: readonly BacktestTrade[];
  currency: string;
  timeZone: string;
  onNote: (id: string, note: string) => void;
}) {
  const { t, tx } = useI18n();
  if (!trades.length)
    return <p className="text-sm text-muted-foreground">{t("No closed trades yet.")}</p>;
  const when = (time: number) =>
    formatTimestamp(new Date(time).toISOString(), timeZone).slice(0, 16);
  return (
    <div className="max-h-[480px] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="text-left">
            {[
              "#",
              "Side",
              "Entry",
              "Exit",
              "Why",
              "Qty",
              "Net",
              "R",
              "MAE / MFE",
              "Candles",
              "Note",
            ].map((label) => (
              <th key={label} className="whitespace-nowrap py-1.5 pr-3 font-normal">
                {tx("backtest column", label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tnum">
          {[...trades].reverse().map((trade) => (
            <tr key={trade.id} className="border-t align-top">
              <td className="py-1.5 pr-3 text-muted-foreground">{trade.id}</td>
              <td
                className={`py-1.5 pr-3 font-medium ${trade.side === "long" ? "text-profit" : "text-loss"}`}
              >
                {t(trade.side === "long" ? "Long" : "Short")}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3">
                {when(trade.entryTime)}
                <br />
                <span className="text-muted-foreground">
                  <MonetaryValue>{fmtNumber(trade.entryPrice, 6)}</MonetaryValue>
                </span>
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3">
                {when(trade.exitTime)}
                <br />
                <span className="text-muted-foreground">
                  <MonetaryValue>{fmtNumber(trade.exitPrice, 6)}</MonetaryValue>
                </span>
              </td>
              <td className="py-1.5 pr-3">
                {tx("exit reason", REASONS[trade.exitReason])}
                {trade.ambiguous && (
                  <span
                    className="ml-1 text-muted-foreground"
                    title={t(
                      "The candle reached both levels (or the entry and a level); the same-candle rule decided.",
                    )}
                  >
                    · {t("candle rule")}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-3">{fmtNumber(trade.qty, 6)}</td>
              <td className="py-1.5 pr-3">
                <Pnl value={trade.netPnl} currency={currency} />
              </td>
              <td className="py-1.5 pr-3">
                {trade.r === null ? "–" : `${trade.r > 0 ? "+" : ""}${fmtNumber(trade.r)}`}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3">
                <MonetaryValue>{fmtMoney(trade.mae, currency)}</MonetaryValue> /{" "}
                <MonetaryValue>{fmtMoney(trade.mfe, currency)}</MonetaryValue>
              </td>
              <td className="py-1.5 pr-3">{trade.bars}</td>
              <td className="py-1.5">
                <Note value={trade.note} onSave={(note) => onNote(trade.id, note)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
