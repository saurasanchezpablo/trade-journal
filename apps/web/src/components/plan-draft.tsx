"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { MAX_SCENARIOS, type AnalysisPlan, type Bias } from "@/lib/analysis-plan";
import { fmtPrice } from "@/lib/analysis-text";
import type { DraftScenario } from "@/lib/plan-draft";
import { postJson } from "@/lib/use-api";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";

interface Draft {
  day: string;
  bias: Bias | null;
  biasReason: string;
  scenarios: DraftScenario[];
}

const newId = () => `sc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const price = (v: number | null) => (v === null ? "none" : fmtPrice(v));

/**
 * A drafted pre-market plan from the chart's levels and the previous session: add the
 * scenarios you agree with to the plan (they save with the analysis), one by one.
 */
export function PlanDraft({
  analysisId,
  plan,
  onAccept,
  disabled,
}: {
  analysisId: string | null;
  plan: AnalysisPlan;
  onAccept: (next: AnalysisPlan) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A draft belongs to the analysis it was asked for: switching analyses drops it, and an
  // answer that arrives after the switch is not offered for the new one.
  const current = useRef(analysisId);
  current.current = analysisId;
  useEffect(() => {
    setDraft(null);
    setError(null);
    setBusy(false);
  }, [analysisId]);
  const ask = async () => {
    if (!analysisId) return;
    const asked = analysisId;
    setBusy(true);
    setError(null);
    try {
      const next = await postJson<Draft>("/api/ai/plan-draft", { analysisId: asked });
      if (current.current === asked) setDraft(next);
    } catch (cause) {
      if (current.current === asked) setError(cause instanceof Error ? cause.message : "No draft");
    } finally {
      if (current.current === asked) setBusy(false);
    }
  };
  const full = plan.scenarios.length >= MAX_SCENARIOS;
  const add = (s: DraftScenario) => {
    const { levelNote, problems: _problems, ...scenario } = s;
    onAccept({
      ...plan,
      scenarios: [
        ...plan.scenarios,
        { ...scenario, id: newId(), note: [scenario.note, levelNote].filter(Boolean).join(" · ") },
      ],
    });
    setDraft((d) => (d ? { ...d, scenarios: d.scenarios.filter((x) => x !== s) } : d));
  };
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy || !analysisId}
        title={analysisId ? undefined : "Save the analysis first"}
        onClick={() => void ask()}
      >
        <Sparkles />
        {busy ? "Drafting…" : "Draft the day's plan"}
      </Button>
      {error && (
        <AiNotice error={error} onRetry={() => void ask()} onDismiss={() => setError(null)} />
      )}
      {draft && (
        <div
          className="space-y-1.5 rounded-md border border-dashed p-2 text-xs"
          aria-label="Plan draft"
        >
          <p className="text-muted-foreground">Draft for {draft.day}. Add what you agree with.</p>
          {draft.bias && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Bias <span className="font-medium">{draft.bias}</span>: {draft.biasReason}
              </span>
              {plan.bias !== draft.bias && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => onAccept({ ...plan, bias: draft.bias })}
                >
                  Use it
                </button>
              )}
            </div>
          )}
          {draft.scenarios.length === 0 && <p>No further scenarios.</p>}
          {draft.scenarios.map((s, i) => (
            <div key={i} className="space-y-0.5 rounded border p-1.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">
                  {s.name || "Scenario"} ({s.direction})
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  disabled={full}
                  title={full ? `A plan holds ${MAX_SCENARIOS} scenarios` : undefined}
                  onClick={() => add(s)}
                >
                  <Plus />
                  Add
                </Button>
              </div>
              <p className="tnum">
                Trigger {price(s.trigger)} · target {price(s.target)} · invalid at{" "}
                {price(s.invalidation)}
              </p>
              {(s.note || s.levelNote) && (
                <p className="text-muted-foreground">
                  {[s.note, s.levelNote].filter(Boolean).join(" · ")}
                </p>
              )}
              {s.problems.length > 0 && (
                <p className="text-muted-foreground">Left out: {s.problems.join("; ")}.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
