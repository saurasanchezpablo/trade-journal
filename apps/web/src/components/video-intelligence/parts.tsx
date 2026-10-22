"use client";

import { AlertTriangle } from "lucide-react";
import type { GroupReport, ClaimRow } from "@/lib/video-intelligence";
import { STATUS_LABELS } from "@/lib/video-intelligence";
import { fmtDuration, fmtNumber, fmtPercent } from "@/lib/utils";
import { useI18n } from "@/components/i18n";
import { Badge } from "@/components/ui/badge";
import { HelpHint } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A claim's outcome as a chip: the words carry the state, colour only repeats it. */
export function StatusBadge({ status }: { status: ClaimRow["status"] }) {
  const { t } = useI18n();
  const variant =
    status === "target_hit"
      ? "profit"
      : status === "invalidated"
        ? "loss"
        : status === "pending"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{t(STATUS_LABELS[status]).toUpperCase()}</Badge>;
}

/** A rate with its 95% interval and the sample it rests on. */
export function Rate({
  rate,
  interval,
  n,
}: {
  rate: number | null;
  interval: { low: number; high: number } | null;
  n: number;
}) {
  const { t } = useI18n();
  if (rate === null) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="tnum whitespace-nowrap">
      {fmtPercent(rate, 0)}
      {interval && (
        <span className="ml-1 text-xs text-muted-foreground">
          ({fmtPercent(interval.low, 0)}–{fmtPercent(interval.high, 0)})
        </span>
      )}
      <span className="ml-1 text-xs text-muted-foreground">{t("n={n}", { n })}</span>
    </span>
  );
}

/** A signed return: sign and digits carry it, never colour alone. */
export const signedPercent = (value: number | null, digits = 2) =>
  value === null ? "–" : `${value > 0 ? "+" : ""}${fmtPercent(value, digits)}`;

export function SmallSample() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <AlertTriangle className="size-3" aria-hidden />
      {t("Small sample")}
    </span>
  );
}

/** Prediction outcomes by group: never ranked by rate, largest evidence first. */
export function PredictionTable({ groups, label }: { groups: GroupReport[]; label: string }) {
  const { t } = useI18n();
  if (!groups.length) return <p className="text-sm text-muted-foreground">{t("No claims yet.")}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">{t("Claims")}</TableHead>
          <TableHead className="text-right">
            {t("Settled")}{" "}
            <HelpHint heading={t("Settled")}>
              {t(
                "Claims whose target was hit, or that were invalidated or expired inside their horizon. Pending, untriggered, ambiguous and unevaluable claims are counted apart, never as misses.",
              )}
            </HelpHint>
          </TableHead>
          <TableHead>{t("Target hit rate (95% interval)")}</TableHead>
          <TableHead>{t("Direction right at horizon")}</TableHead>
          <TableHead className="text-right">
            {t("Right but missed")}{" "}
            <HelpHint heading={t("Right but missed")}>
              {t(
                "Direction right at the horizon's end, yet the target was missed or the invalidation came first: a timing or risk problem.",
              )}
            </HelpHint>
          </TableHead>
          <TableHead className="text-right">{t("Median time to target")}</TableHead>
          <TableHead className="text-right">{t("Pending")}</TableHead>
          <TableHead className="text-right">{t("Unevaluable")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((g) => (
          <TableRow key={g.key}>
            <TableCell className="max-w-56 truncate font-medium">
              {g.label}
              {g.tally.insufficient && (
                <div>
                  <SmallSample />
                </div>
              )}
            </TableCell>
            <TableCell className="tnum text-right">{g.tally.claims}</TableCell>
            <TableCell className="tnum text-right">{g.tally.resolved}</TableCell>
            <TableCell>
              <Rate
                rate={g.tally.targetHitRate}
                interval={g.tally.targetHitInterval}
                n={g.tally.resolved}
              />
            </TableCell>
            <TableCell>
              <Rate
                rate={g.tally.directionRate}
                interval={g.tally.directionInterval}
                n={g.tally.directional}
              />
            </TableCell>
            <TableCell className="tnum text-right">{g.rightButMissed}</TableCell>
            <TableCell className="tnum text-right">
              {fmtDuration(g.tally.medianTimeToTarget)}
            </TableCell>
            <TableCell className="tnum text-right">{g.tally.pending}</TableCell>
            <TableCell className="tnum text-right">{g.tally.unevaluable}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Simulated trades by group (level C setups only). */
export function TradeTable({ groups, label }: { groups: GroupReport[]; label: string }) {
  const { t } = useI18n();
  const rows = groups.filter((g) => g.trades.trades > 0);
  if (!rows.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t(
          "No simulated trades yet: only setups that state an entry, a stop and a target are traded.",
        )}
      </p>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">{t("Trades")}</TableHead>
          <TableHead>{t("Win rate (95% interval)")}</TableHead>
          <TableHead className="text-right">{t("Expectancy (net)")}</TableHead>
          <TableHead className="text-right">{t("Average R")}</TableHead>
          <TableHead className="text-right">{t("Profit factor")}</TableHead>
          <TableHead className="text-right">{t("Max drawdown")}</TableHead>
          <TableHead className="text-right">{t("Net total")}</TableHead>
          <TableHead className="text-right">
            {t("No cost / 2× cost")}{" "}
            <HelpHint heading={t("Cost sensitivity")}>
              {t(
                "The same trades with no commission or slippage, and with twice the costs set below.",
              )}
            </HelpHint>
          </TableHead>
          <TableHead className="text-right">{t("Ambiguous")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((g) => (
          <TableRow key={g.key}>
            <TableCell className="max-w-56 truncate font-medium">
              {g.label}
              {g.trades.insufficient && (
                <div>
                  <SmallSample />
                </div>
              )}
            </TableCell>
            <TableCell className="tnum text-right">{g.trades.trades}</TableCell>
            <TableCell>
              <Rate rate={g.trades.winRate} interval={g.trades.winInterval} n={g.trades.trades} />
            </TableCell>
            <TableCell className="tnum text-right">
              {signedPercent(g.trades.expectancy)}
              {g.trades.expectancyInterval && (
                <div className="text-xs text-muted-foreground">
                  {signedPercent(g.trades.expectancyInterval.low)} {t("to")}{" "}
                  {signedPercent(g.trades.expectancyInterval.high)}
                </div>
              )}
            </TableCell>
            <TableCell className="tnum text-right">
              {g.trades.avgR === null
                ? "–"
                : `${g.trades.avgR > 0 ? "+" : ""}${fmtNumber(g.trades.avgR, 2)}R`}
            </TableCell>
            <TableCell className="tnum text-right">
              {g.trades.profitFactor === null ? "–" : fmtNumber(g.trades.profitFactor, 2)}
            </TableCell>
            <TableCell className="tnum text-right">
              {fmtPercent(-g.trades.maxDrawdown, 2)}
            </TableCell>
            <TableCell className="tnum text-right">{signedPercent(g.trades.netTotal)}</TableCell>
            <TableCell className="tnum text-right whitespace-nowrap">
              {signedPercent(g.costFree)} / {signedPercent(g.costDouble)}
            </TableCell>
            <TableCell className="tnum text-right">{g.trades.ambiguous}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
