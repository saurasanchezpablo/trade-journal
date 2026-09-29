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

interface Payload extends BehaviourReport {
  currencies: string[];
  timeZone: string;
  examples: Record<string, { symbol: string; direction: string; openedAt: string; netPnl: number }>;
}

function Side({ label, stats, currency }: { label: string; stats: SideStats; currency: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tnum text-sm">
        {stats.trades} trade{stats.trades === 1 ? "" : "s"} ·{" "}
        {stats.winRate === null ? "–" : fmtPercent(stats.winRate, 0)} won
      </div>
      <div className="text-sm">
        {stats.avgPnl === null ? "–" : <Pnl value={stats.avgPnl} currency={currency} />}{" "}
        <span className="text-xs text-muted-foreground">a trade</span>
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
  const { data, error } = useApi<Payload>(`/api/behaviour?${query}`);
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  if (!data) return <Skeleton className="h-64" />;
  const currency = data.currencies[0] ?? "USD";
  const mixed = data.currencies.length > 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Habits</CardTitle>
        <p className="text-xs text-muted-foreground">
          {data.trades} closed trades, days in {data.timeZone}. A habit is flagged when it has at
          least five trades on each side and does worse than the rest.
          {mixed ? " Accounts use different currencies; amounts are not converted." : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.patterns.map((p) => (
          <section key={p.kind} className="space-y-2 rounded-md border p-3" aria-label={p.title}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">{p.title}</h3>
              <Badge variant={p.flagged ? "loss" : "secondary"}>
                {p.flagged
                  ? "COSTING YOU"
                  : p.flaggedSide.trades < 5 || p.baseline.trades < 5
                    ? "TOO FEW TRADES"
                    : "NO HARM FOUND"}
              </Badge>
              {p.flagged && p.cost !== null && p.cost > 0 && (
                <span className="text-xs text-muted-foreground">
                  about <Pnl value={-p.cost} currency={currency} /> against your usual result
                </span>
              )}
            </div>
            {p.kind === "size-creep" && p.detail?.length ? (
              <p className="text-xs text-muted-foreground">
                Size up on{" "}
                {p.detail
                  .map(
                    (d) =>
                      `${d.symbol} (${d.earlier.toPrecision(3)} to ${d.recent.toPrecision(3)})`,
                  )
                  .join(", ")}
                .
              </p>
            ) : null}
            {p.flaggedSide.trades > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <Side label="These trades" stats={p.flaggedSide} currency={currency} />
                <Side label="The rest" stats={p.baseline} currency={currency} />
              </div>
            )}
            {p.flagged && p.examples.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Recent examples">
                {p.examples.map((key) => {
                  const t = data.examples[key];
                  if (!t) return null;
                  return (
                    <li key={key}>
                      <Link
                        href={`/trades/${encodeURIComponent(key)}`}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                      >
                        {t.symbol} {t.direction}{" "}
                        {formatTimestamp(t.openedAt, data.timeZone).slice(0, 16)}{" "}
                        <Pnl value={t.netPnl} currency={currency} />
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
