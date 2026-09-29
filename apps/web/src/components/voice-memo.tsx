"use client";

import { useState } from "react";
import { AudioLines, Sparkles } from "lucide-react";
import { postAiStream } from "@/lib/ai-stream";
import { Button } from "./ui/button";
import { AiNotice } from "./ai-notice";
import { Markdown } from "./rich-editor";
import { VoiceNote } from "./voice-note";

/**
 * A voice memo made into a note: dictate (or type) freely, let the AI sort it into sections
 * with Keep and Fix lists, check the result, then add it to the note. Nothing is added
 * until you choose.
 */
export function VoiceMemo({
  kind,
  onInsert,
}: {
  kind: "day" | "trade";
  onInsert: (markdown: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const structure = async () => {
    setBusy(true);
    setError(null);
    setNote("");
    try {
      const result = await postAiStream<{ note: string }>(
        "/api/ai/structure-note",
        { text: memo, kind },
        setNote,
      );
      setNote(result.note);
    } catch (cause) {
      setNote("");
      setError(cause instanceof Error ? cause.message : "Could not make the note");
    } finally {
      setBusy(false);
    }
  };
  if (!open)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <AudioLines />
        Voice memo
      </Button>
    );
  return (
    <div className="space-y-2 rounded-md border p-3" role="region" aria-label="Voice memo">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Voice memo</span>
        <span className="text-xs text-muted-foreground">
          Talk it through; the AI sorts it into a note you check before adding.
        </span>
      </div>
      <div className="flex items-start gap-2">
        <textarea
          aria-label="Memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={4}
          placeholder="Dictate or type what happened, how you felt, what to keep and fix…"
          className="min-h-20 flex-1 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
        />
        <VoiceNote
          onPrepare={() => {}}
          onText={(text) => setMemo((m) => (m ? `${m}${m.endsWith(" ") ? "" : " "}${text}` : text))}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || !memo.trim()}
          onClick={() => void structure()}
        >
          <Sparkles />
          {busy ? "Writing…" : "Make it a note"}
        </Button>
        {note && !busy && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onInsert(note);
              setNote("");
              setMemo("");
              setOpen(false);
            }}
          >
            Add to note
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      {error && (
        <AiNotice error={error} onRetry={() => void structure()} onDismiss={() => setError(null)} />
      )}
      {note && (
        <article
          className="rounded-md border bg-muted/20 p-3 text-sm"
          aria-label="Note preview"
          aria-live="polite"
        >
          <Markdown>{note}</Markdown>
        </article>
      )}
    </div>
  );
}
