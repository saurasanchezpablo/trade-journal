"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Save, Trash2, X } from "lucide-react";
import { declaredTitle, errorLine, MAX_SCRIPT_NAME } from "@/lib/chart-indicators";
import { cn } from "@/lib/utils";
import { useI18n } from "./i18n";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export interface EditorDraft {
  name: string;
  source: string;
  /** The saved script being edited, if any ("My indicators"). */
  scriptId: string | null;
  /** The chart indicator the editor runs on, once applied. */
  chartIndicatorId: string | null;
}

const INDENT = "    ";
const CODE_NAMES = { input: "input.*()", plotshape: "plotshape()", alert: "alert()" } as const;
/** Lines that open an indented Pine block: control flow, `x = if …`, and `f() =>`. */
const BLOCK_OPENER = /^(if|else|for|while|switch)\b|=\s*(if|switch)\b|=>\s*$/;

/**
 * A Pine Script editor docked under the live chart. **Run on chart** applies the code to
 * the chart (the previous version stays if the new one fails); **Save** stores it in
 * My indicators for every chart. Errors point at their line when the engine reports one.
 */
export function PineEditor({
  draft,
  onRun,
  onSave,
  onDelete,
  onClose,
}: {
  draft: EditorDraft;
  onRun: (draft: EditorDraft) => Promise<{ error?: string; chartIndicatorId?: string }>;
  onSave: (draft: EditorDraft) => Promise<{ error?: string; scriptId?: string }>;
  onDelete?: (scriptId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(draft.name);
  const [source, setSource] = useState(draft.source);
  const [scriptId, setScriptId] = useState(draft.scriptId);
  const [chartIndicatorId, setChartIndicatorId] = useState(draft.chartIndicatorId);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const code = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const current = (): EditorDraft => ({
    name: name.trim() || declaredTitle(source) || t("My indicator"),
    source,
    scriptId,
    chartIndicatorId,
  });
  const badLine = error ? errorLine(error) : null;
  const lines = source.split("\n").length;

  useEffect(() => code.current?.focus(), []);

  // One run, save or delete at a time, also from the keyboard: `busy` only disables the
  // buttons after a render, so a double Ctrl+S would otherwise save two scripts.
  const inFlight = useRef(false);
  const exclusive = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : t("It did not work."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const run = () =>
    source.trim()
      ? exclusive(async () => {
          setStatus(t("Running…"));
          const result = await onRun(current());
          if (result.error) {
            setError(result.error);
            setStatus("");
          } else {
            if (result.chartIndicatorId) setChartIndicatorId(result.chartIndicatorId);
            setStatus(t("Running on the chart."));
          }
        })
      : Promise.resolve();
  const save = () =>
    source.trim()
      ? exclusive(async () => {
          const result = await onSave(current());
          if (result.error) setError(result.error);
          else {
            if (result.scriptId) setScriptId(result.scriptId);
            if (!name.trim()) setName(current().name);
            setStatus(t("Saved to My indicators."));
          }
        })
      : Promise.resolve();

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>{t("Pine Script editor")}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("Close editor")}
          onClick={onClose}
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="pine-name">{t("Name")}</Label>
            <Input
              id="pine-name"
              value={name}
              maxLength={MAX_SCRIPT_NAME}
              placeholder={declaredTitle(source) ?? t("My indicator")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button type="button" disabled={busy || !source.trim()} onClick={() => void run()}>
            <Play /> {t("Run on chart")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !source.trim()}
            onClick={() => void save()}
          >
            <Save /> {scriptId ? t("Save changes") : t("Save to My indicators")}
          </Button>
          {scriptId && onDelete && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => {
                if (
                  !confirm(
                    t("Delete this indicator from My indicators? Charts using it keep their copy."),
                  )
                )
                  return;
                void exclusive(async () => {
                  await onDelete(scriptId);
                  setScriptId(null);
                  setStatus(t("Deleted from My indicators."));
                });
              }}
            >
              <Trash2 /> {t("Delete")}
            </Button>
          )}
        </div>
        <div className="flex max-h-[60vh] min-h-72 overflow-hidden rounded-md border bg-background font-mono text-[13px] leading-5">
          <div
            ref={gutter}
            aria-hidden="true"
            className="shrink-0 select-none overflow-hidden border-r bg-muted/40 px-2 py-2 text-right text-muted-foreground"
          >
            {Array.from({ length: lines }, (_, i) => (
              <div
                key={i}
                className={cn(badLine === i + 1 && "rounded-sm bg-destructive/25 text-destructive")}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={code}
            aria-label={t("Pine Script code")}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            onScroll={(event) => {
              if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onKeyDown={(event) => {
              const el = event.currentTarget;
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void run();
              } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void save();
              } else if (event.key === "Tab" && !event.shiftKey) {
                // Indent instead of leaving the editor; Pine blocks are indentation-based.
                event.preventDefault();
                const { selectionStart: start, selectionEnd: end } = el;
                setSource(source.slice(0, start) + INDENT + source.slice(end));
                requestAnimationFrame(() =>
                  el.setSelectionRange(start + INDENT.length, start + INDENT.length),
                );
              } else if (event.key === "Enter") {
                // Keep the current line's indentation, one level deeper after a block opener.
                event.preventDefault();
                const { selectionStart: start, selectionEnd: end } = el;
                const line = source.slice(source.lastIndexOf("\n", start - 1) + 1, start);
                const indent = line.match(/^\s*/)?.[0] ?? "";
                const deeper = BLOCK_OPENER.test(line.trim()) ? INDENT : "";
                const insert = `\n${indent}${deeper}`;
                setSource(source.slice(0, start) + insert + source.slice(end));
                requestAnimationFrame(() =>
                  el.setSelectionRange(start + insert.length, start + insert.length),
                );
              }
            }}
            className="min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 py-2 outline-none"
          />
        </div>
        {error && (
          <p role="alert" className="whitespace-pre-wrap font-mono text-xs text-destructive">
            {badLine ? t("Line {line}: ", { line: badLine }) : ""}
            {error}
          </p>
        )}
        {status && !error && (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t(
            "Pine Script v5/v6 through PineTS. Ctrl/⌘ + Enter runs, Ctrl/⌘ + S saves. Inputs from {input} appear in the indicator's settings on the chart; {plotshape} marks signals and {alert} sends them to Line alerts.",
          )
            // The function names stay code: each `{name}` becomes its <code> element.
            .split(/\{(input|plotshape|alert)\}/)
            .map((part, i) =>
              i % 2 ? <code key={i}>{CODE_NAMES[part as keyof typeof CODE_NAMES]}</code> : part,
            )}
        </p>
      </CardContent>
    </Card>
  );
}
