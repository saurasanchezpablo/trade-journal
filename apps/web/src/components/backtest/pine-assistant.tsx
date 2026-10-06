"use client";

import { useRef, useState } from "react";
import { Check, Save, Sparkles, Wrench, X } from "lucide-react";
import { useI18n } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import { postAiStream } from "@/lib/ai-stream";
import { isStrategyScript, readPineAnswer, type PineAiMode } from "@/lib/pine-ai";
import { postJson } from "@/lib/use-api";

/**
 * Ask the AI for a strategy: write a new one from what you describe, change or complete
 * the one in the editor, or fix the one that failed to run. The script is written as it
 * arrives and replaces the editor's only when you choose; it can be saved to My scripts.
 */
export function PineAssistant({
  current,
  failure,
  onUse,
  onSaved,
}: {
  current: string;
  /** Why the last run failed, if it did. */
  failure: string | null;
  onUse: (script: string) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<PineAiMode | null>(null);
  const [answer, setAnswer] = useState<{ script: string; notes: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const stop = useRef<AbortController | null>(null);

  const ask = async (mode: PineAiMode) => {
    if (mode !== "fix" && !request.trim()) {
      setError(t("Describe what the strategy should do."));
      return;
    }
    stop.current?.abort();
    const controller = new AbortController();
    stop.current = controller;
    setBusy(mode);
    setError("");
    setMessage("");
    setAnswer({ script: "", notes: "" });
    try {
      const result = await postAiStream<{ script: string; notes: string }>(
        "/api/ai/pine-script",
        { mode, request, current, ...(mode === "fix" ? { error: failure ?? "" } : {}) },
        (text) => setAnswer(readPineAnswer(text)),
        controller.signal,
      );
      setAnswer(result);
      if (!result.script) setError(t("The answer has no script. Try describing it differently."));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setAnswer(null);
      setError(cause instanceof Error ? cause.message : t("AI request failed."));
    } finally {
      if (stop.current === controller) {
        stop.current = null;
        setBusy(null);
      }
    }
  };

  const save = async () => {
    if (!answer?.script) return;
    const title = /strategy\(\s*"([^"]{1,80})"/.exec(answer.script)?.[1] ?? t("AI strategy");
    try {
      await postJson("/api/chart-scripts", { name: title, source: answer.script });
      setMessage(t('Saved to My scripts as "{name}".', { name: title }));
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the script."));
    }
  };

  const ready = answer && !busy && isStrategyScript(answer.script);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <label htmlFor="pine-ai-request" className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="size-4" aria-hidden="true" /> {t("Ask the AI for a strategy")}
      </label>
      <textarea
        id="pine-ai-request"
        className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        placeholder={t(
          "For example: buy when the 9 EMA crosses above the 21 EMA and RSI is above 50, stop 1.5 ATR below, target 2R; only long.",
        )}
        maxLength={4000}
        value={request}
        onChange={(e) => setRequest(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy !== null} onClick={() => void ask("create")}>
          <Sparkles /> {busy === "create" ? t("Writing…") : t("Write a new strategy")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null || !current.trim()}
          title={t("Change or complete the script in the editor as you describe")}
          onClick={() => void ask("edit")}
        >
          {busy === "edit" ? t("Writing…") : t("Change this script")}
        </Button>
        {failure && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            title={failure}
            onClick={() => void ask("fix")}
          >
            <Wrench /> {busy === "fix" ? t("Writing…") : t("Fix the error")}
          </Button>
        )}
        {busy && (
          <Button type="button" size="sm" variant="ghost" onClick={() => stop.current?.abort()}>
            {t("Stop")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "The AI writes Pine Script v5 for this tester. Check the code and its results before trusting it: a strategy that looks good on past candles can still lose money.",
        )}
      </p>
      {answer && (answer.script || busy) && (
        <div className="space-y-2">
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs">
            {answer.script || t("Writing…")}
          </pre>
          {answer.notes && <p className="whitespace-pre-line text-xs">{answer.notes}</p>}
          {!busy && answer.script && !isStrategyScript(answer.script) && (
            <p className="text-xs text-destructive">
              {t("This is not a Pine Script v5 strategy; it may not run.")}
            </p>
          )}
          {!busy && answer.script && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => onUse(answer.script)}>
                <Check /> {t("Use this script")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!ready}
                onClick={() => void save()}
              >
                <Save /> {t("Save to My scripts")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAnswer(null)}>
                <X /> {t("Discard")}
              </Button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
