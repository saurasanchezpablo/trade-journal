"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { postJson } from "@/lib/use-api";
import { acquireJson } from "@/lib/api-request";
import { formatTimestamp } from "@/lib/timezone";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";
import { useI18n } from "./i18n";

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

const labelList = (json: unknown): string[] => {
  if (typeof json !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** The trade's tags and mistakes as saved now, not as they were when the AI answered. */
async function savedLabels(key: string): Promise<{ tags: string[]; mistakes: string[] }> {
  const read = acquireJson<{ trade: { tagsJson?: unknown; mistakesJson?: unknown } }>(
    `/api/trades/${encodeURIComponent(key)}`,
    { fresh: true },
  );
  try {
    const { trade } = await read.promise;
    return { tags: labelList(trade.tagsJson), mistakes: labelList(trade.mistakesJson) };
  } finally {
    read.release();
  }
}

/**
 * A patch built from a suggestion, moved onto the labels the trade has now. A patch replaces
 * the whole list, so it keeps what was added since the suggestion (a bulk tag action, an
 * edit) and adds only what the suggestion adds.
 */
export function rebasePatch(
  s: Pick<LabelSuggestion, "currentTags" | "currentMistakes">,
  patch: LabelPatch,
  saved: { tags: string[]; mistakes: string[] },
): LabelPatch {
  const merge = (now: string[], before: string[], wanted: string[]) => [
    ...new Set([...now, ...wanted.filter((label) => !before.includes(label))]),
  ];
  return {
    ...patch,
    ...(patch.tags ? { tags: merge(saved.tags, s.currentTags, patch.tags) } : {}),
    ...(patch.mistakes
      ? { mistakes: merge(saved.mistakes, s.currentMistakes, patch.mistakes) }
      : {}),
  };
}

const rebased = async (key: string, s: LabelSuggestion, wanted: LabelPatch) =>
  wanted.tags || wanted.mistakes ? rebasePatch(s, wanted, await savedLabels(key)) : wanted;

const applyFailed = (cause: unknown, t: (text: string) => string) =>
  cause instanceof Error ? cause.message : t("Could not apply the labels");

function Chips({
  suggestion,
  onApply,
}: {
  suggestion: LabelSuggestion;
  onApply: (patch: LabelPatch) => void;
}) {
  const { t } = useI18n();
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
      aria-label={
        kind === "tags" ? t("Add tag {label}", { label }) : t("Add mistake {label}", { label })
      }
    >
      + {kind === "mistakes" ? t("mistake: ") : ""}
      {label}
      {suggestion.newLabels.includes(label) && (
        <span className="text-muted-foreground">{t("(new)")}</span>
      )}
    </button>
  );
  const nothing =
    !suggestion.tags.length &&
    !suggestion.mistakes.length &&
    (suggestion.rating === null || suggestion.rating === suggestion.currentRating);
  return (
    <div className="space-y-1.5">
      {nothing ? (
        <p className="text-xs text-muted-foreground">{t("Nothing to add.")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {suggestion.tags.map((tag) => chip(tag, "tags"))}
          {suggestion.mistakes.map((m) => chip(m, "mistakes"))}
          {suggestion.rating !== null && suggestion.rating !== suggestion.currentRating && (
            <button
              type="button"
              onClick={() => onApply({ rating: suggestion.rating! })}
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
            >
              {t("Rate {rating} of 5", { rating: suggestion.rating })}
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
  const { t } = useI18n();
  const [suggestion, setSuggestion] = useState<LabelSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setSuggestion((await request([tradeKey])).suggestions[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("No suggestions"));
    } finally {
      setBusy(false);
    }
  };
  const [applyError, setApplyError] = useState<string | null>(null);
  const apply = async (wanted: LabelPatch) => {
    if (!suggestion) return;
    setApplyError(null);
    let patch: LabelPatch;
    try {
      patch = await rebased(tradeKey, suggestion, wanted);
      await onApply(patch);
    } catch (cause) {
      setApplyError(applyFailed(cause, t));
      return;
    }
    // What was applied is no longer suggested.
    setSuggestion((s) =>
      s
        ? {
            ...s,
            currentTags: patch.tags ?? s.currentTags,
            currentMistakes: patch.mistakes ?? s.currentMistakes,
            currentRating: patch.rating ?? s.currentRating,
            tags: s.tags.filter((tag) => !patch.tags?.includes(tag)),
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
          {busy ? t("Thinking…") : t("Suggest labels")}
        </Button>
        {Object.keys(all).length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void apply(all)}>
            {t("Apply all")}
          </Button>
        )}
      </div>
      {error && (
        <AiNotice error={error} onRetry={() => void ask()} onDismiss={() => setError(null)} />
      )}
      {applyError && (
        <p role="alert" className="text-xs text-destructive">
          {applyError}
        </p>
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
  const { t } = useI18n();
  const [list, setList] = useState<LabelSuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setList((await request(keys)).suggestions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("No suggestions"));
    } finally {
      setBusy(false);
    }
  };
  const [applyError, setApplyError] = useState<string | null>(null);
  const send = async (s: LabelSuggestion, wanted: LabelPatch) => {
    const body = await rebased(s.key, s, wanted);
    await postJson(`/api/trades/${encodeURIComponent(s.key)}`, body, "PATCH");
    setList((current) => current?.filter((x) => x.key !== s.key) ?? null);
  };
  /** Apply one trade's labels, or every trade's in turn, then reload the table. */
  const patch = async (...items: [LabelSuggestion, LabelPatch][]) => {
    setApplyError(null);
    try {
      for (const [s, body] of items) if (Object.keys(body).length) await send(s, body);
    } catch (cause) {
      setApplyError(applyFailed(cause, t));
    } finally {
      onChanged();
    }
  };
  const applyAll = () =>
    patch(...(list ?? []).map((s) => [s, wholePatch(s)] as [LabelSuggestion, LabelPatch]));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || keys.length === 0 || keys.length > 20}
          title={keys.length > 20 ? t("Select at most 20 trades") : undefined}
          onClick={() => void ask()}
        >
          <Sparkles />
          {busy ? t("Thinking…") : t("Suggest labels")}
        </Button>
        {list && list.some((s) => Object.keys(wholePatch(s)).length) && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void applyAll()}>
            {t("Apply all suggestions")}
          </Button>
        )}
      </div>
      {error && (
        <AiNotice error={error} onRetry={() => void ask()} onDismiss={() => setError(null)} />
      )}
      {applyError && (
        <p role="alert" className="text-xs text-destructive">
          {applyError}
        </p>
      )}
      {list && (
        <ul className="divide-y rounded-md border" aria-label={t("Label suggestions")}>
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
                    onClick={() => void patch([s, wholePatch(s)])}
                  >
                    {t("Apply")}
                  </Button>
                )}
              </div>
              <Chips suggestion={s} onApply={(body) => void patch([s, body])} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
