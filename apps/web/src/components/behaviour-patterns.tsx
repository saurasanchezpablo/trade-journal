"use client";

import Link from "next/link";
import type { BehaviourReport, SideStats } from "@luxalgo/journal-core";
import { useApi } from "@/lib/use-api";
import { fmtPercent } from "@/lib/utils";
import { formatTimestamp } from "@/lib/timezone";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Pnl } from "./pnl";
import { useI18n } from "./i18n";

interface Payload extends BehaviourReport {
  currencies: string[];
  timeZone: string;
  examples: Record<string, { symbol: string; direction: string; openedAt: string; netPnl: number }>;
}

/** `currency` is null when the trades mix currencies: their amounts cannot be added. */
function Side({
  label,
  stats,
  currency,
}: {
  label: string;
  stats: SideStats;
  currency: string | null;
}) {
  const { t, tn } = useI18n();
  const won = stats.winRate === null ? "–" : fmtPercent(stats.winRate, 0);
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{t(label)}</div>
      <div className="tnum text-sm">
        {tn(stats.trades, "{count} trade · {won} won", "{count} trades · {won} won", { won })}
      </div>
      <div className="text-sm">
        {stats.avgPnl === null || currency === null ? (
          "–"
        ) : (
          <Pnl value={stats.avgPnl} currency={currency} />
        )}{" "}
        <span className="text-xs text-muted-foreground">{t("a trade")}</span>
      </div>
    </div>
  );
}

/**
 * Habits in your own trades, each against the rest: revenge trades, trading on after losses,
 * sizing up, and results later in the day. Computed by the journal; the AI chat reads the
 * same numbers when you ask about them.
 */
export function BehaviourPatterns({ query }: { query: string }) {
  const { t, tx } = useI18n();
  const { data, error } = useApi<Payload>(`/api/behaviour?${query}`);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!data) return <Skeleton className="h-64" />;
  const mixed = data.currencies.length > 1;
  // Like the calendar: with several currencies amounts are hidden rather than shown in one.
  const currency = mixed ? null : (data.currencies[0] ?? "USD");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Habits")}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            "{count} closed trades, days in {timeZone}. A habit is flagged when it has at least five trades on each side and does worse than the rest.",
            { count: data.trades, timeZone: data.timeZone },
          )}
          {mixed
            ? ` ${t("These trades use {currencies}, so amounts are not shown. Select accounts with one currency to see them.", { currencies: data.currencies.join(", ") })}`
            : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.patterns.map((p) => (
          <section key={p.kind} className="space-y-2 rounded-md border p-3" aria-label={t(p.title)}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">{t(p.title)}</h3>
              <Badge variant={p.flagged ? "loss" : "secondary"}>
                {p.flagged
                  ? t("COSTING YOU")
                  : p.flaggedSide.trades < 5 || p.baseline.trades < 5
                    ? t("TOO FEW TRADES")
                    : t("NO HARM FOUND")}
              </Badge>
              {p.flagged && p.cost !== null && p.cost > 0 && currency !== null && (
                <span className="text-xs text-muted-foreground">
                  {t("about")} <Pnl value={-p.cost} currency={currency} />{" "}
                  {t("against your usual result")}
                </span>
              )}
            </div>
            {p.kind === "size-creep" && p.detail?.length ? (
              <p className="text-xs text-muted-foreground">
                {t("Size up on {symbols}.", {
                  symbols: p.detail
                    .map((d) =>
                      t("{symbol} ({earlier} to {recent})", {
                        symbol: d.symbol,
                        earlier: d.earlier.toPrecision(3),
                        recent: d.recent.toPrecision(3),
                      }),
                    )
                    .join(", "),
                })}
              </p>
            ) : null}
            {p.flaggedSide.trades > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <Side label="These trades" stats={p.flaggedSide} currency={currency} />
                <Side label="The rest" stats={p.baseline} currency={currency} />
              </div>
            )}
            {p.flagged && p.examples.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t("Recent examples")}>
                {p.examples.map((key) => {
                  const example = data.examples[key];
                  if (!example) return null;
                  return (
                    <li key={key}>
                      <Link
                        href={`/trades/${encodeURIComponent(key)}`}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                      >
                        {example.symbol} {tx("group", example.direction)}{" "}
                        {formatTimestamp(example.openedAt, data.timeZone).slice(0, 16)}{" "}
                        {currency !== null && <Pnl value={example.netPnl} currency={currency} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
