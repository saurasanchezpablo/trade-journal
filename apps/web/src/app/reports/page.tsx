"use client";
import { OptionSelect } from "@/components/ui/option-select";

import { HoverHint } from "@/components/ui/tooltip";
import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import {
  DIMENSIONS,
  type Dimension,
  type AnalysisFilters,
  type GroupSummary,
} from "@luxalgo/journal-core";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { FilterFields, Field, fieldClass } from "@/components/filter-fields";
import { ReviewExport } from "@/components/review-export";
import { AskJournalChat } from "@/components/ask-journal-chat";
import { BehaviourPatterns } from "@/components/behaviour-patterns";
import { ReportOverview } from "@/components/report-overview";
import { MonetaryValue, usePrivacy } from "@/components/privacy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApi } from "@/lib/use-api";
import { describeFilters } from "@/lib/filter-description";
import { fmtDuration } from "@/lib/utils";
import { useI18n, useT } from "@/components/i18n";
function LoadingText({ text }: { text: string }) {
  return useT()(text);
}
const TradeExplorer = dynamic(
  () => import("@/components/trade-explorer").then((module) => module.TradeExplorer),
  {
    loading: () => (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        <LoadingText text="Loading trade explorer…" />
      </p>
    ),
  },
);
const PerformanceTrendsReport = dynamic(
  () => import("@/components/performance-trends").then((module) => module.PerformanceTrendsReport),
  {
    loading: () => (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        <LoadingText text="Loading performance trends…" />
      </p>
    ),
  },
);
interface Group extends GroupSummary {
  row: string;
  column: string;
}
interface Analysis {
  accounts: { id: string; name: string }[];
  summary: GroupSummary;
  groups: Group[];
  playbooks: { id: string; name: string }[];
  currencies: string[];
  timeZone: string;
}
const number = (n: number | null) =>
  n === null ? "-" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const percent = (n: number | null) => (n === null ? "-" : `${(n * 100).toFixed(1)}%`);
/** Signed, so a gain never relies on its colour alone (docs/design.md). */
const money = (n: number, currency: string) => `${n > 0 ? "+" : ""}${number(n)} ${currency}`;
type Translate = ReturnType<typeof useI18n>["t"];
type TranslateIn = ReturnType<typeof useI18n>["tx"];
/** A dimension's name in the journal's language. */
const dimensionName = (t: Translate, dimension: Dimension) => t(DIMENSIONS[dimension]);
/**
 * A group's label: names people typed (symbols, tags, mistakes, strategies) stay as they are;
 * the journal's own keys (weekdays, sides, outcomes, bands, "Untagged") are translated.
 */
const groupLabel = (t: Translate, tx: TranslateIn, dimension: Dimension, key: string) => {
  if (dimension === "symbol" || dimension === "month") return key;
  if (dimension === "tag") return key === "Untagged" ? tx("group", key) : key;
  if (dimension === "mistake") return key === "None" ? tx("group", key) : key;
  if (dimension === "playbook") return key === "Unassigned" ? tx("group", key) : key;
  return tx("group", key);
};
function Summary({ data }: { data: Analysis }) {
  const { t } = useI18n();
  const s = data.summary;
  return (
    <div className="report-summary">
      <div className="report-summary-grid grid grid-cols-2 gap-4">
        {[
          ["Closed trades", String(s.trades)],
          ["Net P&L", money(s.netPnl, data.currencies[0] ?? "USD")],
          ["Win rate", percent(s.winRate)],
          ["Profit factor", s.noLosses ? "∞" : number(s.profitFactor)],
          ["Entry volume", number(s.volume)],
          ["Avg holding time", fmtDuration(s.avgDurationMs)],
          ["Avg planned R", number(s.avgPlannedR)],
          ["Avg realized R", number(s.avgRealizedR)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{t(label!)}</p>
            <p className="mt-1 break-words text-base font-semibold tabular-nums sm:text-lg">
              {label === "Net P&L" ? <MonetaryValue>{value}</MonetaryValue> : value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
function DimensionSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Dimension;
  onChange: (d: Dimension) => void;
}) {
  const { t } = useI18n();
  return (
    <Field label={label}>
      <OptionSelect
        className={fieldClass}
        value={value}
        onValueChange={(next) => onChange(next as Dimension)}
      >
        {Object.entries(DIMENSIONS).map(([key, label]) => (
          <option key={key} value={key}>
            {t(label)}
          </option>
        ))}
      </OptionSelect>
    </Field>
  );
}
const labels = (data: Analysis, key: string) =>
  data.playbooks.find((p) => p.id === key)?.name ?? key;
function GroupLabel({ dimension, children }: { dimension: Dimension; children: string }) {
  return dimension === "entryPrice" || dimension === "exitPrice" ? (
    <MonetaryValue>{children}</MonetaryValue>
  ) : (
    children
  );
}
function Breakdown({
  data,
  cross,
  primary,
  secondary,
}: {
  data: Analysis;
  cross: boolean;
  primary: Dimension;
  secondary: Dimension;
}) {
  const { t, tx, tn } = useI18n();
  const label = (dimension: Dimension, k: string) =>
    dimension === "playbook" && k !== "Unassigned"
      ? labels(data, k)
      : groupLabel(t, tx, dimension, k);
  const rowLabel = (k: string) => label(primary, k),
    colLabel = (k: string) => label(secondary, k);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = [...new Set(data.groups.map((g) => g.row))],
    columns = [...new Set(data.groups.map((g) => g.column))].sort((a, b) =>
      secondary === "weekday"
        ? weekdays.indexOf(a) - weekdays.indexOf(b)
        : a.localeCompare(b, undefined, { numeric: true }),
    );
  if (primary === "weekday") rows.sort((a, b) => weekdays.indexOf(a) - weekdays.indexOf(b));
  const max = data.groups.reduce((max, g) => Math.max(max, Math.abs(g.netPnl)), 1);
  const cells = new Map(data.groups.map((g) => [JSON.stringify([g.row, g.column]), g]));
  return (
    <div className="space-y-4">
      {cross && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="p-3 text-left">
                  {dimensionName(t, primary)} / {dimensionName(t, secondary)}
                </th>
                {columns.map((c) => (
                  <th key={c} className="min-w-24 p-2">
                    <GroupLabel dimension={secondary}>{colLabel(c)}</GroupLabel>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <th className="p-3 text-left font-medium">
                    <GroupLabel dimension={primary}>{rowLabel(r)}</GroupLabel>
                  </th>
                  {columns.map((c) => {
                    const g = cells.get(JSON.stringify([r, c]));
                    return (
                      <HoverHint
                        key={c}
                        content={
                          g
                            ? `${tn(g.trades, "{count} trade", "{count} trades")} · ${t("Win rate {rate}", { rate: percent(g.winRate) })}`
                            : t("No trades")
                        }
                      >
                        <td
                          key={c}
                          className="border border-background p-2 text-center tabular-nums"
                          style={{
                            background: g
                              ? `color-mix(in srgb, ${g.netPnl >= 0 ? "var(--profit-fill)" : "var(--loss)"} ${8 + (Math.abs(g.netPnl) / max) * 35}%, transparent)`
                              : undefined,
                          }}
                          tabIndex={0}
                        >
                          {g ? <MonetaryValue>{number(g.netPnl)}</MonetaryValue> : "-"}
                        </td>
                      </HoverHint>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Cell values are net P&L in {currency}.", {
              currency: data.currencies[0] ?? t("account currency"),
            })}
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              {[
                dimensionName(t, primary),
                ...(cross ? [dimensionName(t, secondary)] : []),
                t("Trades"),
                t("Win %"),
                t("Net P&L"),
                t("Entry volume"),
                t("Avg planned R"),
                t("Avg realized R"),
                t("Avg duration"),
              ].map((h) => (
                <th key={h} className="whitespace-nowrap border-b px-3 py-3 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.groups.map((g) => (
              <tr
                key={JSON.stringify([g.row, g.column])}
                className="border-b border-border/50 hover:bg-accent/30"
              >
                <td className="px-3 py-3 font-medium">
                  <GroupLabel dimension={primary}>{rowLabel(g.row)}</GroupLabel>
                </td>
                {cross && (
                  <td className="px-3 py-3">
                    <GroupLabel dimension={secondary}>{colLabel(g.column)}</GroupLabel>
                  </td>
                )}
                <td className="px-3">{g.trades}</td>
                <td className="px-3">{percent(g.winRate)}</td>
                <td
                  className={`whitespace-nowrap px-3 tabular-nums ${g.netPnl >= 0 ? "text-profit" : "text-loss"}`}
                >
                  <MonetaryValue>{money(g.netPnl, data.currencies[0] ?? "USD")}</MonetaryValue>
                </td>
                <td className="px-3">{number(g.volume)}</td>
                <td className="px-3">{number(g.avgPlannedR)}</td>
                <td className="px-3">{number(g.avgRealizedR)}</td>
                <td className="whitespace-nowrap px-3">{fmtDuration(g.avgDurationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.groups.length && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t("No closed trades match these filters.")}
        </p>
      )}
    </div>
  );
}
export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}
function Reports() {
  const { t, tx } = useI18n();
  const { query, values } = useFilters();
  const [mode, setMode] = useState<
      "overview" | "trends" | "explorer" | "breakdown" | "cross" | "compare" | "habits"
    >("overview"),
    [primary, setPrimary] = useState<Dimension>("symbol"),
    [secondary, setSecondary] = useState<Dimension>("weekday");
  const { data, error, loading } = useApi<Analysis>(
    mode === "breakdown" || mode === "cross"
      ? `/api/analysis?${query}&primary=${primary}${mode === "cross" ? `&secondary=${secondary}` : ""}`
      : null,
  );
  const multi = (data?.currencies.length ?? 0) > 1;
  return (
    <div>
      <FilterBar title={t("Reports")} />
      <div className="space-y-4 p-4">
        <AskJournalChat />
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["overview", "Overview"],
              ["trends", "Performance trends"],
              ["explorer", "Trade explorer"],
              ["breakdown", "Breakdowns"],
              ["cross", "Cross-analysis"],
              ["compare", "Compare groups"],
              ["habits", "Habits"],
            ] as const
          ).map(([key, name]) => (
            <Button
              key={key}
              size="sm"
              variant={mode === key ? "default" : "outline"}
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
            >
              {t(name)}
            </Button>
          ))}
        </div>
        <div key={mode} className="journal-report-section space-y-4" data-report-section={mode}>
          {mode === "overview" ? (
            <ReportOverview query={query} filters={values} />
          ) : mode === "trends" ? (
            <PerformanceTrendsReport key={query} query={query} />
          ) : mode === "explorer" ? (
            <TradeExplorer key={query} query={query} />
          ) : mode === "habits" ? (
            <BehaviourPatterns key={query} query={query} />
          ) : mode === "compare" ? (
            <Comparison key={query} initial={values} />
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex flex-wrap gap-3">
                      <DimensionSelect
                        label={t("Group by")}
                        value={primary}
                        onChange={setPrimary}
                      />
                      {mode === "cross" && (
                        <DimensionSelect
                          label={t("Then by")}
                          value={secondary}
                          onChange={setSecondary}
                        />
                      )}
                    </div>
                    {data && !multi && (
                      <ReviewExport
                        containsFinancialData
                        document={{
                          title:
                            mode === "cross"
                              ? t("{primary} by {secondary}", {
                                  primary: dimensionName(t, primary),
                                  secondary: dimensionName(t, secondary),
                                })
                              : t("{dimension} performance", {
                                  dimension: dimensionName(t, primary),
                                }),
                          subtitle: `${data.timeZone} · ${data.currencies[0] ?? t("Account currency")}`,
                          lines: [
                            t("Filters: {filters}", {
                              filters: describeFilters(values, data.accounts, data.playbooks),
                            }),
                            t("Closed trades: {trades} | Net P&L: {pnl} | Win rate: {rate}", {
                              trades: data.summary.trades,
                              pnl: number(data.summary.netPnl),
                              rate: percent(data.summary.winRate),
                            }),
                            "",
                            ...data.groups.map((g) => {
                              const row =
                                primary === "playbook" && g.row !== "Unassigned"
                                  ? labels(data, g.row)
                                  : groupLabel(t, tx, primary, g.row);
                              const column = !g.column
                                ? ""
                                : secondary === "playbook" && g.column !== "Unassigned"
                                  ? labels(data, g.column)
                                  : groupLabel(t, tx, secondary, g.column);
                              return `${row}${column ? ` / ${column}` : ""}: ${t(
                                "{trades} trades | P&L {pnl} | Win {win} | Planned {planned}R | Realized {realized}R | Volume {volume} | Holding time {holding}",
                                {
                                  trades: g.trades,
                                  pnl: number(g.netPnl),
                                  win: percent(g.winRate),
                                  planned: number(g.avgPlannedR),
                                  realized: number(g.avgRealizedR),
                                  volume: number(g.volume),
                                  holding: fmtDuration(g.avgDurationMs),
                                },
                              )}`;
                            }),
                          ],
                        }}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {error ? (
                    <p role="alert" className="text-destructive">
                      {error}
                    </p>
                  ) : loading ? (
                    <p className="text-sm text-muted-foreground">{t("Loading report…")}</p>
                  ) : multi ? (
                    <p className="text-sm">
                      {t(
                        "These accounts use different currencies ({currencies}). Select accounts with the same currency in Filters to compare monetary results.",
                        { currencies: data?.currencies.join(", ") ?? "" },
                      )}
                    </p>
                  ) : data ? (
                    <Summary data={data} />
                  ) : null}
                </CardContent>
              </Card>
              {data && !multi && !loading && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {mode === "cross"
                        ? `${dimensionName(t, primary)} × ${dimensionName(t, secondary)}`
                        : t("Performance by {dimension}", {
                            dimension: dimensionName(t, primary).toLowerCase(),
                          })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Breakdown
                      data={data}
                      cross={mode === "cross"}
                      primary={primary}
                      secondary={secondary}
                    />
                  </CardContent>
                </Card>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t(
                  "Closed trades only. Dates use the closing day; weekday and entry time use the opening time in {timeZone}. Volume is total entry quantity. R uses weighted entry and total entry quantity; missing or invalid risk inputs are excluded from R averages. Derivatives require a configured multiplier for realized R. Multiple tags or mistakes can place a trade in more than one group, so those group totals can overlap.",
                  { timeZone: data?.timeZone ?? t("your journal timezone") },
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function Comparison({ initial }: { initial: AnalysisFilters }) {
  const { t } = useI18n();
  const privateMode = usePrivacy();
  const [a, setA] = useState<AnalysisFilters>({ ...initial, direction: "long" }),
    [b, setB] = useState<AnalysisFilters>({ ...initial, direction: "short" }),
    [nameA, setNameA] = useState(() => t("Long trades")),
    [nameB, setNameB] = useState(() => t("Short trades")),
    [editing, setEditing] = useState<"a" | "b" | null>(null),
    [draft, setDraft] = useState<AnalysisFilters>({});
  const aa = useApi<Analysis>(`/api/analysis?${new URLSearchParams(a).toString()}`),
    bb = useApi<Analysis>(`/api/analysis?${new URLSearchParams(b).toString()}`);
  const currencies = new Set([...(aa.data?.currencies ?? []), ...(bb.data?.currencies ?? [])]),
    multi = currencies.size > 1;
  const metricLines = (name: string, d: Analysis) => [
    name,
    `${t("Trades: {trades} | P&L: {pnl}", { trades: d.summary.trades, pnl: number(d.summary.netPnl) })} ${d.currencies[0] ?? ""}`,
    t("Win rate: {rate} | Planned R: {planned} | Realized R: {realized}", {
      rate: percent(d.summary.winRate),
      planned: number(d.summary.avgPlannedR),
      realized: number(d.summary.avgRealizedR),
    }),
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "Each group has its own filters. Compare strategies, accounts, periods, or trade characteristics. Groups may overlap.",
        )}
      </p>
      {multi && (
        <p role="alert" className="rounded-md border p-3 text-sm">
          {t(
            "Select accounts with the same currency in both groups. Currency conversion is not applied.",
          )}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            { key: "a", name: nameA, setName: setNameA, filters: a, result: aa },
            { key: "b", name: nameB, setName: setNameB, filters: b, result: bb },
          ] as const
        ).map((group) => (
          <Card key={group.key}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  aria-label={t("Group {group} name", { group: group.key.toUpperCase() })}
                  className={`${fieldClass} min-w-32 flex-1 font-semibold`}
                  value={group.name}
                  onChange={(e) => group.setName(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraft({ ...group.filters });
                    setEditing(group.key);
                  }}
                >
                  {t("Edit filters")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground break-words">
                {describeFilters(
                  group.filters,
                  group.result.data?.accounts,
                  group.result.data?.playbooks,
                  privateMode,
                )}
              </p>
            </CardHeader>
            <CardContent>
              {group.result.error ? (
                <p role="alert" className="text-destructive">
                  {group.result.error}
                </p>
              ) : group.result.loading ? (
                <p>{t("Loading…")}</p>
              ) : group.result.data && !multi ? (
                <Summary data={group.result.data} />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {aa.data && bb.data && !aa.loading && !bb.loading && !multi && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm">
              {t("{b} minus {a}:", { b: nameB, a: nameA })}{" "}
              <strong>
                <MonetaryValue>
                  {money(
                    bb.data.summary.netPnl - aa.data.summary.netPnl,
                    [...currencies][0] ?? "USD",
                  )}
                </MonetaryValue>
              </strong>{" "}
              {t("net P&L")} ·{" "}
              {t("{count} trades", {
                count: number(bb.data.summary.trades - aa.data.summary.trades),
              })}
            </p>
            <ReviewExport
              containsFinancialData
              document={{
                title: t("{a} vs {b}", { a: nameA, b: nameB }),
                lines: [
                  t("Group {group}: {filters}", {
                    group: "A",
                    filters: describeFilters(a, aa.data.accounts, aa.data.playbooks),
                  }),
                  t("Group {group}: {filters}", {
                    group: "B",
                    filters: describeFilters(b, bb.data.accounts, bb.data.playbooks),
                  }),
                  "",
                  ...metricLines(nameA, aa.data),
                  "",
                  ...metricLines(nameB, bb.data),
                ],
              }}
            />
          </CardContent>
        </Card>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t("Group {group} filters", { group: editing?.toUpperCase() ?? "" })}
            </DialogTitle>
          </DialogHeader>
          <FilterFields value={draft} onChange={setDraft} />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setDraft({})}>
              {t("Clear")}
            </Button>
            <Button
              onClick={() => {
                if (editing === "a") setA(draft);
                else setB(draft);
                setEditing(null);
              }}
            >
              {t("Apply to group")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
