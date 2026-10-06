"use client";
import { useApi } from "@/lib/use-api";
import { useFilters } from "@/components/filter-bar";
import { MonetaryValue } from "./privacy";
import type { GroupSummary } from "@luxalgo/journal-core";
import { useI18n } from "./i18n";
interface Adherence {
  id: string;
  total: number;
  evaluated: number;
  possible: number;
  rate: number | null;
  currencies: string[];
  followed: GroupSummary;
  broken: GroupSummary;
  unassessed: number;
  rules: {
    rule: string;
    evaluated: number;
    rate: number | null;
    followed: GroupSummary;
    broken: GroupSummary;
  }[];
}
const pct = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);
/** Signed, so a gain never relies on its colour alone (docs/design.md). */
const signed = (n: number, digits?: number) =>
  `${n > 0 ? "+" : ""}${digits === undefined ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(digits)}`;
export function AdherenceReport({ bookId }: { bookId: string }) {
  const { t, tn, tx } = useI18n();
  const { query } = useFilters();
  const { data, error } = useApi<{ books: Adherence[] }>(`/api/adherence?${query}`);
  const b = data?.books.find((b) => b.id === bookId);
  if (error)
    return (
      <p role="alert" className="text-xs text-destructive">
        {error}
      </p>
    );
  if (!b) return null;
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("Rule adherence")}</span>
        <strong className="text-lg">{pct(b.rate)}</strong>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("{evaluated}/{possible} rule assessments across {total} filtered closed trades.", {
          evaluated: b.evaluated,
          possible: b.possible,
          total: b.total,
        })}{" "}
        {tn(
          b.unassessed,
          "{count} trade still needs assessment.",
          "{count} trades still need assessment.",
        )}
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {[
          ["All rules followed", b.followed],
          ["At least one broken", b.broken],
        ].map(([title, stats]) => {
          const s = stats as GroupSummary;
          return (
            <div key={String(title)} className="rounded-md bg-muted/40 p-2">
              <p className="mb-1 font-medium">{t(String(title))}</p>
              <p>
                {tn(s.trades, "{count} trade · {win} win", "{count} trades · {win} win", {
                  win: pct(s.winRate),
                })}
              </p>
              {b.currencies.length <= 1 && (
                <p className={s.netPnl >= 0 ? "text-profit" : "text-loss"}>
                  <MonetaryValue>
                    {signed(s.netPnl)} {b.currencies[0] ?? ""}
                  </MonetaryValue>
                </p>
              )}
            </div>
          );
        })}
      </div>
      {b.currencies.length > 1 && (
        <p className="text-xs text-muted-foreground">{t("P&L hidden for mixed currencies.")}</p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          {t("Performance by rule")}
        </summary>
        <div className="mt-2 space-y-3">
          {b.rules.map((r) => (
            <div key={r.rule} className="border-t pt-2">
              <p className="font-medium">{r.rule}</p>
              <p className="text-muted-foreground">
                {t("{rate} followed", { rate: pct(r.rate) })} ·{" "}
                {tn(r.evaluated, "{count} assessment", "{count} assessments")}
              </p>
              <p>
                {t(
                  "Followed: {followed} trades / {followedWin} win · Broken: {broken} / {brokenWin} win",
                  {
                    followed: r.followed.trades,
                    followedWin: pct(r.followed.winRate),
                    broken: r.broken.trades,
                    brokenWin: pct(r.broken.winRate),
                  },
                )}
              </p>
              {b.currencies.length <= 1 && (
                <p>
                  {t("Net P&L:")} <MonetaryValue>{signed(r.followed.netPnl, 2)}</MonetaryValue>{" "}
                  {tx("rule", "followed")} /{" "}
                  <MonetaryValue>{signed(r.broken.netPnl, 2)}</MonetaryValue> {tx("rule", "broken")}{" "}
                  {b.currencies[0] ?? ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
