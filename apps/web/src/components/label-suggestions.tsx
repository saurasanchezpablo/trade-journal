"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { postJson } from "@/lib/use-api";
import { formatTimestamp } from "@/lib/timezone";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";

export interface LabelSuggestion {
  key: string;
  symbol: string;
  openedAt: string;
  tags: string[];
  mistakes: string[];
  newLabels: string[];
  rating: number | null;
  currentTags: string[];
  currentMistakes: string[];
  currentRating: number | null;
  reason: string;
}

export interface LabelPatch {
  tags?: string[];
  mistakes?: string[];
  rating?: number;
}

const request = (keys: string[]) =>
  postJson<{ suggestions: LabelSuggestion[] }>("/api/ai/suggest-labels", { keys });

/** Everything a suggestion adds, as one patch for the trade. */
export const wholePatch = (s: LabelSuggestion): LabelPatch => ({
  ...(s.tags.length ? { tags: [...s.currentTags, ...s.tags] } : {}),
  ...(s.mistakes.length ? { mistakes: [...s.currentMistakes, ...s.mistakes] } : {}),
  ...(s.rating !== null && s.rating !== s.currentRating ? { rating: s.rating } : {}),
});

function Chips({
  suggestion,
  onApply,
}: {
  suggestion: LabelSuggestion;
  onApply: (patch: LabelPatch) => void;
}) {
  const chip = (label: string, kind: "tags" | "mistakes") => (
    <button
      key={`${kind}-${label}`}
      type="button"
      onClick={() =>
        onApply({
          [kind]: [
            ...(kind === "tags" ? suggestion.currentTags : suggestion.currentMistakes),
            label,
          ],
        })
      }
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
      aria-label={`Add ${kind === "tags" ? "tag" : "mistake"} ${label}`}
    >
      + {kind === "mistakes" ? "mistake: " : ""}
      {label}
      {suggestion.newLabels.includes(label) && <span className="text-muted-foreground">(new)</span>}
    </button>
  );
  const nothing =
    !suggestion.tags.length &&
    !suggestion.mistakes.length &&
    (suggestion.rating === null || suggestion.rating === suggestion.currentRating);
  return (
    <div className="space-y-1.5">
      {nothing ? (
        <p className="text-xs text-muted-foreground">Nothing to add.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {suggestion.tags.map((t) => chip(t, "tags"))}
          {suggestion.mistakes.map((m) => chip(m, "mistakes"))}
          {suggestion.rating !== null && suggestion.rating !== suggestion.currentRating && (
            <button
              type="button"
              onClick={() => onApply({ rating: suggestion.rating! })}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
            >
              Rate {suggestion.rating} of 5
            </button>
          )}
        </div>
      )}
      {suggestion.reason && <p className="text-xs text-muted-foreground">{suggestion.reason}</p>}
    </div>
  );
}

/** Suggested labels for one trade, applied a chip at a time or all at once. */
export function TradeLabelSuggestions({
  tradeKey,
  onApply,
}: {
  tradeKey: string;
  onApply: (patch: LabelPatch) => Promise<void> | void;
}) {
  const [suggestion, setSuggestion] = useState<LabelSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setSuggestion((await request([tradeKey])).suggestions[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No suggestions");
    } finally {
      setBusy(false);
    }
  };
  const apply = async (patch: LabelPatch) => {
    await onApply(patch);
    // What was applied is no longer suggested.
    setSuggestion((s) =>
      s
        ? {
            ...s,
            currentTags: patch.tags ?? s.currentTags,
            currentMistakes: patch.mistakes ?? s.currentMistakes,
            currentRating: patch.rating ?? s.currentRating,
            tags: s.tags.filter((t) => !patch.tags?.includes(t)),
            mistakes: s.mistakes.filter((m) => !patch.mistakes?.includes(m)),
          }
        : s,
    );
  };
  const all = suggestion ? wholePatch(suggestion) : {};
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void ask()}
        >
          <Sparkles />
          {busy ? "Thinking…" : "Suggest labels"}
        </Button>
        {Object.keys(all).length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void apply(all)}>
            Apply all
          </Button>
        )}
      </div>
      {error && (
        <AiNotice error={error} onRetry={() => void ask()} onDismiss={() => setError(null)} />
      )}
      {suggestion && <Chips suggestion={suggestion} onApply={(p) => void apply(p)} />}
    </div>
  );
}

/** Suggestions for the selected trades on the Trades page, applied per trade or all at once. */
export function BulkLabelSuggestions({
  keys,
  timeZone,
  onChanged,
}: {
  keys: string[];
  timeZone: string;
  onChanged: () => void;
}) {
  const [list, setList] = useState<LabelSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setList((await request(keys)).suggestions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No suggestions");
    } finally {
      setBusy(false);
    }
  };
  const patch = async (s: LabelSuggestion, body: LabelPatch) => {
    await postJson(`/api/trades/${encodeURIComponent(s.key)}`, body, "PATCH");
    setList((current) => current?.filter((x) => x.key !== s.key) ?? null);
    onChanged();
  };
  const applyAll = async () => {
    for (const s of list ?? []) {
      const body = wholePatch(s);
      if (Object.keys(body).length) await patch(s, body);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || keys.length === 0 || keys.length > 20}
          title={keys.length > 20 ? "Select at most 20 trades" : undefined}
          onClick={() => void ask()}
        >
          <Sparkles />
          {busy ? "Thinking…" : "Suggest labels"}
        </Button>
        {list && list.some((s) => Object.keys(wholePatch(s)).length) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void applyAll()}>
            Apply all suggestions
          </Button>
        )}
      </div>
      {error && (
        <AiNotice error={error} onRetry={() => void ask()} onDismiss={() => setError(null)} />
      )}
      {list && (
        <ul className="divide-y rounded-md border" aria-label="Label suggestions">
          {list.map((s) => (
            <li key={s.key} className="space-y-1 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {s.symbol}{" "}
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(s.openedAt, timeZone).slice(0, 16)}
                  </span>
                </span>
                {Object.keys(wholePatch(s)).length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void patch(s, wholePatch(s))}
                  >
                    Apply
                  </Button>
                )}
              </div>
              <Chips suggestion={s} onApply={(body) => void patch(s, body)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
