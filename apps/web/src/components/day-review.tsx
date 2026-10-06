"use client";

import { useState } from "react";
import { postJson, useApi } from "@/lib/use-api";
import { fmtPrice } from "@/lib/analysis-text";
import { formatTimestamp } from "@/lib/timezone";
import {
  OUTCOMES,
  OUTCOME_LABELS,
  planTradeStats,
  type AnalysisPlan,
  type ScenarioOutcome,
  type ScenarioReview,
} from "@/lib/analysis-plan";
import { Pnl } from "./pnl";
import { MonetaryValue } from "./privacy";
import { contextTags } from "@/lib/day-context";
import type { DayPriceAction } from "@/server/day-price-action";
import type { DayTrade } from "@/server/trade-links";
import { useI18n } from "./i18n";

const LEVEL_STATUS: Record<DayPriceAction["levels"][number]["status"], string> = {
  untouched: "not reached",
  held: "held",
  broken: "broken",
  testing: "closed inside",
};

/**
 * One analysis's day in review, loaded when opened: what price did against its levels,
 * each plan scenario's grade (suggested from the day's candles, confirmed by you), and the
 * day's trades on its symbol, linked to the plan or not.
 */
export function DayReview({ analysisId, date }: { analysisId: string; date: string }) {
  const { t, tx } = useI18n();
  const [open, setOpen] = useState(false);
  const base = `/api/analyses/${encodeURIComponent(analysisId)}/snapshots/${date}`;
  const { data: priceData, error: priceError } = useApi<{
    priceAction: DayPriceAction | null;
    problem: string | null;
  }>(open ? `${base}/price-action` : null);
  const {
    data: reviewData,
    error: reviewError,
    refresh: refreshReview,
  } = useApi<{
    plan: AnalysisPlan;
    reviews: ScenarioReview[];
    changes: { since: string; list: string[] } | null;
  }>(open ? `${base}/review` : null);
  const {
    data: tradeData,
    error: tradeError,
    refresh: refreshTrades,
  } = useApi<{
    trades: DayTrade[];
    timeZone: string;
  }>(open ? `${base}/trades` : null);
  const [problem, setProblem] = useState("");
  const action = priceData?.priceAction;
  const plan = reviewData?.plan;
  const trades = tradeData?.trades ?? [];
  const reached = action?.levels.filter((l) => l.status !== "untouched").length ?? 0;

  const save = async (work: () => Promise<unknown>, after: () => void) => {
    setProblem("");
    try {
      await work();
      after();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t("Could not save."));
    }
  };
  const grade = (scenarioId: string, outcome: ScenarioOutcome | null) =>
    save(() => postJson(`${base}/review`, { scenarioId, outcome }, "PUT"), refreshReview);
  const link = (trade: DayTrade, linked: boolean, scenarioId: string | null) =>
    save(
      () => postJson(`${base}/trades`, { tradeKey: trade.key, linked, scenarioId }, "PUT"),
      refreshTrades,
    );

  return (
    // currentTarget: React passes on the toggle of the nested "levels not reached" list too.
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
        {t("Day review")}
        {action
          ? ` · ${
              action.levels.length
                ? action.partial
                  ? t("{reached} of {total} levels reached so far", {
                      reached,
                      total: action.levels.length,
                    })
                  : t("{reached} of {total} levels reached", {
                      reached,
                      total: action.levels.length,
                    })
                : action.partial
                  ? t("no levels drawn so far")
                  : t("no levels drawn")
            }`
          : ""}
      </summary>
      <div className="mt-2 space-y-3">
        {problem && (
          <p role="alert" className="text-destructive">
            {problem}
          </p>
        )}
        {reviewError && (
          <p role="alert" className="text-destructive">
            {t("The plan and its grades could not be loaded: {error}", { error: reviewError })}
          </p>
        )}
        {tradeError && (
          <p role="alert" className="text-destructive">
            {t("The day's trades could not be loaded: {error}", { error: tradeError })}
          </p>
        )}
        <PriceActionSection
          loading={open && !priceData && !priceError}
          error={priceError}
          data={priceData}
        />
        {plan && plan.scenarios.length > 0 && (
          <section className="space-y-1.5" aria-label={t("Plan")}>
            <p className="font-medium">
              {plan.bias ? t("Plan · {bias} bias", { bias: tx("bias", plan.bias) }) : t("Plan")}
            </p>
            {plan.scenarios.map((s) => {
              const suggestion = action?.scenarios[s.id];
              const review = reviewData?.reviews.find((r) => r.scenarioId === s.id);
              return (
                <div key={s.id} className="space-y-1 rounded-md border p-2">
                  <p>
                    <span className="font-medium">{s.name || t("Unnamed scenario")}</span>{" "}
                    <span className="tnum text-muted-foreground">
                      {t("{direction} at {trigger}", {
                        direction: tx("direction", s.direction),
                        trigger: s.trigger === null ? t("no trigger") : fmtPrice(s.trigger),
                      })}
                      {s.target !== null
                        ? ` · ${t("target {price}", { price: fmtPrice(s.target) })}`
                        : ""}
                      {s.invalidation !== null
                        ? ` · ${t("invalid at {price}", { price: fmtPrice(s.invalidation) })}`
                        : ""}
                    </span>
                  </p>
                  {suggestion && (
                    <p className="text-muted-foreground">
                      {t("From the candles: {outcome}.", {
                        outcome: t(OUTCOME_LABELS[suggestion.outcome]),
                      })}{" "}
                      {t(suggestion.reason)}
                    </p>
                  )}
                  <label className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t("Your grade")}</span>
                    <select
                      value={review?.outcome ?? ""}
                      onChange={(e) =>
                        void grade(s.id, (e.target.value || null) as ScenarioOutcome | null)
                      }
                      className="h-7 rounded-md border bg-background px-1"
                    >
                      <option value="">
                        {suggestion
                          ? t("Not graded (suggested: {outcome})", {
                              outcome: t(OUTCOME_LABELS[suggestion.outcome]),
                            })
                          : t("Not graded")}
                      </option>
                      {OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {t(OUTCOME_LABELS[o])}
                        </option>
                      ))}
                    </select>
                    {!review && suggestion && suggestion.outcome !== "unclear" && (
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void grade(s.id, suggestion.outcome)}
                      >
                        {t("Accept")}
                      </button>
                    )}
                  </label>
                </div>
              );
            })}
          </section>
        )}
        {reviewData?.changes && (
          <section className="space-y-1" aria-label={t("Changes since the previous version")}>
            <p className="font-medium">
              {t("Changed since {date}", { date: reviewData.changes.since })}
            </p>
            {reviewData.changes.list.length ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {reviewData.changes.list.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("Nothing: the analysis stood as it was.")}</p>
            )}
          </section>
        )}
        {open && tradeData && (
          <TradesSection
            analysisId={analysisId}
            plan={plan}
            trades={trades}
            timeZone={tradeData.timeZone}
            onLink={link}
          />
        )}
      </div>
    </details>
  );
}

function PriceActionSection({
  loading,
  error,
  data,
}: {
  loading: boolean;
  error: string | null;
  data: { priceAction: DayPriceAction | null; problem: string | null } | null;
}) {
  const { t, tn } = useI18n();
  if (loading) return <p className="text-muted-foreground">{t("Loading the day's candles…")}</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        {error}
      </p>
    );
  if (!data) return null;
  if (data.problem) return <p className="text-muted-foreground">{t(data.problem)}</p>;
  const action = data.priceAction;
  if (!action) return <p className="text-muted-foreground">{t("No candles for this day.")}</p>;
  const unreached = action.levels.filter((l) => l.status === "untouched").length;
  return (
    <section className="space-y-1" aria-label={t("What price did")}>
      <p className="font-medium">{t("What price did")}</p>
      <p className="text-muted-foreground">
        {contextTags(action.context)
          .map((tag) => t(tag))
          .join(" · ")}
        {action.context.news.length ? ` (${action.context.news.join(", ")})` : ""}
      </p>
      <p className="tnum">
        O {fmtPrice(action.summary.open)} · H {fmtPrice(action.summary.high)} · L{" "}
        {fmtPrice(action.summary.low)} · C {fmtPrice(action.summary.close)} (
        {action.summary.change >= 0 ? "+" : "−"}
        {Math.abs(action.summary.changePct * 100).toFixed(2)}%)
        {action.averageRange
          ? ` · ${t("range {ratio}× average", {
              ratio: (action.summary.range / action.averageRange).toFixed(2),
            })}`
          : ""}
      </p>
      <LevelList levels={action.levels.filter((l) => l.status !== "untouched")} />
      {unreached > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            {tn(unreached, "{count} level not reached", "{count} levels not reached")}
          </summary>
          <LevelList levels={action.levels.filter((l) => l.status === "untouched")} />
        </details>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t(
          "From {resolution} candles, in the journal's time zone. Held: price reached it and closed back on the same side; broken: it closed through.",
          { resolution: action.resolution },
        )}
      </p>
    </section>
  );
}

function TradesSection({
  analysisId,
  plan,
  trades,
  timeZone,
  onLink,
}: {
  analysisId: string;
  plan: AnalysisPlan | undefined;
  trades: DayTrade[];
  /** The journal's: the day's trades were picked by it. */
  timeZone: string;
  onLink: (trade: DayTrade, linked: boolean, scenarioId: string | null) => void;
}) {
  const { t: tt, tx } = useI18n();
  if (!trades.length)
    return (
      <p className="text-muted-foreground">{tt("No trades on this symbol opened this day.")}</p>
    );
  const own = new Set(trades.filter((t) => t.link?.analysisId === analysisId).map((t) => t.key));
  const stats = planTradeStats(trades, own);
  return (
    <section className="space-y-1" aria-label={tt("Trades opened this day")}>
      <p className="font-medium">{tt("Trades opened this day")}</p>
      <p className="text-muted-foreground">
        {tt("From this plan: {count}", { count: stats.onPlan.trades })} (
        <Pnl value={stats.onPlan.netPnl} />) ·{" "}
        {tt("Not from it: {count}", {
          count: stats.offPlan.trades,
        })}{" "}
        (<Pnl value={stats.offPlan.netPnl} />)
      </p>
      <ul className="space-y-1">
        {trades.map((t) => {
          const mine = t.link?.analysisId === analysisId;
          const elsewhere = t.link && !mine;
          const time = formatTimestamp(t.openedAt, timeZone).slice(11, 16);
          return (
            <li key={t.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="tnum">
                {tx("direction", t.direction).toUpperCase()} {t.symbol} @{" "}
                <MonetaryValue>{fmtPrice(t.avgEntry)}</MonetaryValue> · <Pnl value={t.netPnl} />{" "}
                <span className="text-muted-foreground">{time}</span>
              </span>
              <select
                // Named by its time, not its price: privacy mode hides trade prices.
                aria-label={tt("Plan link for the {direction} {symbol} trade opened at {time}", {
                  direction: tx("direction", t.direction),
                  symbol: t.symbol,
                  time,
                })}
                value={mine ? (t.link?.scenarioId ?? "plan") : ""}
                onChange={(e) =>
                  e.target.value === ""
                    ? onLink(t, false, null)
                    : onLink(t, true, e.target.value === "plan" ? null : e.target.value)
                }
                className="h-7 max-w-52 rounded-md border bg-background px-1"
              >
                <option value="">
                  {elsewhere ? tt("From another analysis") : tt("Not from this plan")}
                </option>
                <option value="plan">{tt("From this plan")}</option>
                {plan?.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t.suggestedScenario === s.id
                      ? tt("Scenario: {name} (suggested)", { name: s.name || tt("unnamed") })
                      : tt("Scenario: {name}", { name: s.name || tt("unnamed") })}
                  </option>
                ))}
              </select>
              {!t.link && t.suggestedScenario && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => onLink(t, true, t.suggestedScenario)}
                >
                  {tt("Link to the suggested scenario")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LevelList({ levels }: { levels: DayPriceAction["levels"] }) {
  const { t } = useI18n();
  if (!levels.length) return null;
  return (
    <ul className="space-y-0.5">
      {levels.map((level, i) => (
        <li key={i} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate">
            {level.label}{" "}
            <span className="tnum text-muted-foreground">
              {level.low === level.high
                ? fmtPrice(level.low)
                : t("{low} to {high}", { low: fmtPrice(level.low), high: fmtPrice(level.high) })}
            </span>
          </span>
          <span className="shrink-0 rounded border px-1.5 text-[11px] uppercase tracking-wide">
            {t(LEVEL_STATUS[level.status])}
          </span>
        </li>
      ))}
    </ul>
  );
}
