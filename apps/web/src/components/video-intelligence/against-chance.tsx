"use client";

import type { GroupReport } from "@/lib/video-intelligence";
import { MIN_SAMPLE } from "@luxalgo/journal-core";
import { fmtPercent } from "@/lib/utils";
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
import { Rate } from "./parts";

export type Verdict = "too_few" | "beats" | "worse" | "none";

/**
 * What the sign test says, in words. Below the minimum sample nothing is concluded; a p-value
 * under 5% says the split between analyst-only and mirror-only wins is unlikely by chance.
 */
export function verdictOf(g: GroupReport): Verdict {
  if (g.baseline.pairs < MIN_SAMPLE || g.edge.pValue === null) return "too_few";
  if (g.edge.pValue >= 0.05) return "none";
  return g.edge.analystOnly > g.edge.mirrorOnly ? "beats" : "worse";
}

const VERDICTS: Record<Verdict, string> = {
  too_few: "Too few claims to tell",
  beats: "Better than chance",
  worse: "Worse than chance",
  none: "No evidence of an edge",
};

export function VerdictBadge({ g }: { g: GroupReport }) {
  const { t } = useI18n();
  const verdict = verdictOf(g);
  return (
    <Badge variant={verdict === "beats" ? "profit" : verdict === "worse" ? "loss" : "outline"}>
      {t(VERDICTS[verdict])}
    </Badge>
  );
}

/** Each group's hit rate against its mirror's, the sign test and what it means. */
export function AgainstChanceTable({ groups, label }: { groups: GroupReport[]; label: string }) {
  const { t } = useI18n();
  const rows = groups.filter((g) => g.baseline.pairs > 0);
  if (!rows.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t("No claim has been settled both ways yet.")}
      </p>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">{t("Pairs")}</TableHead>
          <TableHead>{t("Analyst hit rate")}</TableHead>
          <TableHead>{t("Mirror hit rate")}</TableHead>
          <TableHead className="text-right">
            {t("Only analyst / only mirror")}{" "}
            <HelpHint heading={t("Only analyst / only mirror")}>
              {t(
                "Claims where only the analyst's target came first, and claims where only the opposite bet's did. When both or neither won, the claim says nothing about skill.",
              )}
            </HelpHint>
          </TableHead>
          <TableHead className="text-right">
            {t("p-value")}{" "}
            <HelpHint heading={t("p-value")}>
              {t(
                "The chance of a split at least this uneven if the analyst had no edge (exact two-sided sign test). Under 5% is unlikely to be luck; with many analysts, about one in twenty passes by luck alone.",
              )}
            </HelpHint>
          </TableHead>
          <TableHead>{t("Verdict")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((g) => (
          <TableRow key={g.key}>
            <TableCell className="max-w-56 truncate font-medium">{g.label}</TableCell>
            <TableCell className="tnum text-right">{g.baseline.pairs}</TableCell>
            <TableCell>
              <Rate
                rate={g.baseline.analystRate}
                interval={g.baseline.analystInterval}
                n={g.baseline.pairs}
              />
            </TableCell>
            <TableCell>
              <Rate
                rate={g.baseline.mirrorRate}
                interval={g.baseline.mirrorInterval}
                n={g.baseline.pairs}
              />
            </TableCell>
            <TableCell className="tnum text-right">
              {g.edge.analystOnly} / {g.edge.mirrorOnly}
            </TableCell>
            <TableCell className="tnum text-right">
              {g.edge.pValue === null
                ? "–"
                : g.edge.pValue < 0.001
                  ? "< 0.001"
                  : g.edge.pValue.toFixed(3)}
            </TableCell>
            <TableCell>
              <VerdictBadge g={g} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** One sentence for the overview: the whole selection against chance. */
export function AgainstChanceSummary({ g }: { g: GroupReport }) {
  const { t } = useI18n();
  if (!g.baseline.pairs)
    return (
      <p className="text-sm text-muted-foreground">
        {t("No claim has been settled both ways yet.")}
      </p>
    );
  return (
    <div className="space-y-2 text-sm">
      <p>
        {t(
          "On {pairs} claims settled both ways, the analysts' targets came first {analyst} of the time; the same distances bet the other way, {mirror}.",
          {
            pairs: g.baseline.pairs,
            analyst: fmtPercent(g.baseline.analystRate, 0),
            mirror: fmtPercent(g.baseline.mirrorRate, 0),
          },
        )}
      </p>
      <div className="flex items-center gap-2">
        <VerdictBadge g={g} />
        {g.edge.pValue !== null && (
          <span className="text-xs text-muted-foreground">
            {t("p = {p} (sign test, {a} analyst-only against {m} mirror-only wins)", {
              p: g.edge.pValue < 0.001 ? "< 0.001" : g.edge.pValue.toFixed(3),
              a: g.edge.analystOnly,
              m: g.edge.mirrorOnly,
            })}
          </span>
        )}
      </div>
    </div>
  );
}
