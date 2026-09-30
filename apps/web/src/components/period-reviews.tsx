"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { dayKeyOf } from "@luxalgo/journal-core";
import {
  GOAL_METRICS,
  formatMeasure,
  parsePeriod,
  periodOf,
  previousPeriod,
  type Goal,
  type GoalMetric,
  type Measures,
  type Period,
  type PeriodKind,
} from "@/lib/goals";
import { postJson, useApi } from "@/lib/use-api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";
import { MonetaryValue } from "./privacy";
import { SectionCard } from "./section-card";
import { JournalChat } from "./journal-chat";

interface State {
  period: Period;
  previous: Period;
  measures: Measures;
  previousMeasures: Measures;
  goals: (Goal & { status: "met" | "missed" | "unknown"; value: number | null })[];
}

interface Suggestion {
  metric: GoalMetric | null;
  comparator: "atLeast" | "atMost" | null;
  target: number | null;
  text: string;
  reason: string;
}

const METRICS = Object.keys(GOAL_METRICS) as GoalMetric[];

function Value({ metric, value }: { metric: GoalMetric; value: number | null }) {
  const text = formatMeasure(metric, value);
  return GOAL_METRICS[metric].unit === "money" ? (
    <MonetaryValue>{text}</MonetaryValue>
  ) : (
    <>{text}</>
  );
}

/** The last periods and the next one, newest first. */
function periodChoices(kind: PeriodKind, today: string): Period[] {
  const current = periodOf(kind, today);
  const next = periodOf(
    kind,
    new Date(Date.parse(`${current.to}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
  );
  const list = [next, current];
  for (let i = 0; i < (kind === "month" ? 11 : 5); i += 1) list.push(previousPeriod(list.at(-1)!));
  return list;
}

/**
 * Monthly and quarterly reviews tied to goals: set measurable goals (or written ones) for a
 * period, see each measured from your trades and routines as it goes, have the AI suggest the
 * next period's, and write the review as a chat you can follow up on.
 */
export function PeriodReviews({ timeZone }: { timeZone: string }) {
  const today = dayKeyOf(new Date().toISOString(), timeZone);
  const [kind, setKind] = useState<PeriodKind>("month");
  const choices = useMemo(() => periodChoices(kind, today), [kind, today]);
  const [periodId, setPeriodId] = useState<string>(() => periodOf("month", today).id);
  const period = parsePeriod(kind, periodId) ?? choices[1]!;
  const { data } = useApi<State>(`/api/goals?kind=${kind}&period=${period.id}`);
  const [saved, setSaved] = useState<State | null>(null);
  const state = saved?.period.id === period.id && saved.period.kind === kind ? saved : data;
  const [metric, setMetric] = useState<GoalMetric | "">("winRate");
  const [comparator, setComparator] = useState<"atLeast" | "atMost">("atLeast");
  const [target, setTarget] = useState("");
  const [text, setText] = useState("");
  // Goal changes fail with a plain message; the AI suggestion has its own notice and retry.
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // Suggestions belong to the period they were asked for, and are only offered there.
  const scope = `${kind}:${period.id}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [suggested, setSuggested] = useState<{ scope: string; goals: Suggestion[] } | null>(null);
  const suggestions = suggested?.scope === scope ? suggested.goals : null;
  const setSuggestions = (update: (goals: Suggestion[]) => Suggestion[]) =>
    setSuggested((s) => (s ? { ...s, goals: update(s.goals) } : s));
  const [busy, setBusy] = useState(false);

  const percent = metric !== "" && GOAL_METRICS[metric].unit === "percent";
  const add = async (goal: {
    metric: GoalMetric | null;
    comparator: "atLeast" | "atMost" | null;
    target: number | null;
    text: string;
  }) => {
    setError(null);
    try {
      setSaved(await postJson<State>("/api/goals", { kind, period: period.id, ...goal }));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the goal");
      return false;
    }
  };
  const remove = async (id: string) => {
    setError(null);
    try {
      setSaved(await postJson<State>("/api/goals", { id, kind, period: period.id }, "DELETE"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the goal");
    }
  };
  const suggest = async () => {
    const asked = scope;
    setBusy(true);
    setAiError(null);
    try {
      const { goals } = await postJson<{ goals: Suggestion[] }>("/api/ai/suggest-goals", {
        kind,
        period: period.id,
      });
      if (currentScope.current === asked) setSuggested({ scope: asked, goals });
    } catch (cause) {
      if (currentScope.current === asked)
        setAiError(cause instanceof Error ? cause.message : "No suggestions");
    } finally {
      setBusy(false);
    }
  };
  const describe = (g: Pick<Goal, "metric" | "comparator" | "target" | "text">) =>
    g.metric && g.target !== null && g.comparator
      ? `${GOAL_METRICS[g.metric].label} ${g.comparator === "atLeast" ? "at least" : "at most"} `
      : "";

  const met = state?.goals.filter((g) => g.status === "met").length ?? 0;
  return (
    <SectionCard
      id="journal-period-reviews"
      title="Monthly and quarterly reviews"
      summary={state ? `${period.label}: ${met} of ${state.goals.length} goals met` : undefined}
      contentClassName="space-y-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Review period kind"
          value={kind}
          onChange={(e) => {
            const next = e.target.value as PeriodKind;
            setKind(next);
            setPeriodId(periodOf(next, today).id);
            setAiError(null);
          }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
        </select>
        <select
          aria-label="Review period"
          value={period.id}
          onChange={(e) => {
            setPeriodId(e.target.value);
            setAiError(null);
          }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {period.from} to {period.to}, all accounts
        </span>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Goals
        </h3>
        {state && state.goals.length === 0 && (
          <p className="text-xs text-muted-foreground">No goals for {period.label} yet.</p>
        )}
        {state && state.goals.length > 0 && (
          <ul className="divide-y rounded-md border" aria-label="Goals">
            {state.goals.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <Badge
                  variant={
                    g.status === "met" ? "profit" : g.status === "missed" ? "loss" : "secondary"
                  }
                >
                  {g.status === "met"
                    ? "MET"
                    : g.status === "missed"
                      ? "MISSED"
                      : g.metric
                        ? "NO DATA"
                        : "WRITTEN"}
                </Badge>
                <span className="min-w-0 flex-1">
                  {describe(g)}
                  {g.metric && g.target !== null && <Value metric={g.metric} value={g.target} />}
                  {g.metric && (
                    <span className="text-muted-foreground">
                      {" "}
                      · now <Value metric={g.metric} value={g.value} />
                    </span>
                  )}
                  {g.text && (
                    <span className={g.metric ? "block text-xs text-muted-foreground" : ""}>
                      {g.text}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Remove goal"
                  onClick={() => void remove(g.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const number = Number(target);
            void add(
              metric
                ? {
                    metric,
                    comparator,
                    target: percent ? number / 100 : number,
                    text: text.trim(),
                  }
                : { metric: null, comparator: null, target: null, text: text.trim() },
            ).then((ok) => {
              if (ok) {
                setTarget("");
                setText("");
              }
            });
          }}
        >
          <select
            aria-label="Goal metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as GoalMetric | "")}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {GOAL_METRICS[m].label}
              </option>
            ))}
            <option value="">Written goal</option>
          </select>
          {metric && (
            <>
              <select
                aria-label="Goal comparison"
                value={comparator}
                onChange={(e) => setComparator(e.target.value as "atLeast" | "atMost")}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="atLeast">at least</option>
                <option value="atMost">at most</option>
              </select>
              <input
                aria-label="Goal target"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={percent ? "60 (%)" : "target"}
                className="h-8 w-24 rounded-md border bg-background px-2 text-sm"
              />
            </>
          )}
          <input
            aria-label="Goal note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={metric ? "why (optional)" : "No trades in the first 15 minutes"}
            className="h-8 min-w-40 flex-1 rounded-md border bg-background px-2 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={metric ? !target.trim() || !Number.isFinite(Number(target)) : !text.trim()}
          >
            <Plus />
            Add goal
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void suggest()}
          >
            <Sparkles />
            {busy ? "Thinking…" : "Suggest goals"}
          </Button>
        </form>
        {suggestions && (
          <ul className="space-y-1.5" aria-label="Suggested goals">
            {suggestions.length === 0 && (
              <li className="text-xs text-muted-foreground">No suggestions this time.</li>
            )}
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="flex flex-wrap items-start gap-2 rounded-md border border-dashed px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  {describe(s)}
                  {s.metric && s.target !== null && <Value metric={s.metric} value={s.target} />}
                  {s.text && <span className={s.metric ? "block text-xs" : ""}>{s.text}</span>}
                  <span className="block text-xs text-muted-foreground">{s.reason}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void add(s).then(
                      (ok) => ok && setSuggestions((list) => list.filter((x) => x !== s)),
                    )
                  }
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {aiError && (
          <AiNotice
            error={aiError}
            onRetry={() => void suggest()}
            onDismiss={() => setAiError(null)}
          />
        )}
      </div>

      {state && (
        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {period.label} against {state.previous.label}
          </summary>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {METRICS.map((m) => (
                <tr key={m} className="border-t">
                  <td className="py-1 pr-2">{GOAL_METRICS[m].label}</td>
                  <td className="tnum py-1 pr-2 text-right">
                    <Value metric={m} value={state.measures[m]} />
                  </td>
                  <td className="tnum py-1 text-right text-muted-foreground">
                    <Value metric={m} value={state.previousMeasures[m]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <JournalChat
        key={`${kind}:${period.id}:${timeZone}`}
        target={{ kind: "journal", filters: { from: period.from, to: period.to }, timeZone }}
        placeholder={`Ask about ${period.label}`}
        starter={{
          label: `Write the ${kind === "month" ? "monthly" : "quarterly"} review`,
          display: `${kind === "month" ? "Monthly" : "Quarterly"} review for ${period.label}`,
          url: "/api/ai/period-review",
          body: { kind, period: period.id, timeZone },
        }}
        intro="The review measures each goal and compares with the period before; follow-ups keep its dates."
      />
    </SectionCard>
  );
}
