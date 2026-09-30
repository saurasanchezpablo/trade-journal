"use client";

import { useEffect, useRef, useState } from "react";
import { dayKeyOf } from "@luxalgo/journal-core";
import { postAiStream } from "@/lib/ai-stream";
import { Markdown } from "./rich-editor";
import { Button } from "./ui/button";
import { SectionCard } from "./section-card";

/** An AI review of a week of journal days: trades, plan grades and your Keep/Fix lessons. */
export function WeeklyReview({ timeZone }: { timeZone: string }) {
  // Today in the journal's time zone (which loads after the page) until you pick a week.
  const [picked, setEnd] = useState<string | null>(null);
  const end = picked ?? dayKeyOf(new Date().toISOString(), timeZone);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ review: string; from: string; to: string } | null>(null);
  const [error, setError] = useState("");
  // The review as it is written.
  const [writing, setWriting] = useState("");
  // Leaving the page stops the review being written.
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const write = async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setWriting("");
    try {
      const result = await postAiStream<{ review: string; from: string; to: string }>(
        "/api/ai/weekly",
        { end },
        (text) => !request.signal.aborted && setWriting(text),
        request.signal,
      );
      if (!request.signal.aborted) setReview(result);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Could not write the review.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  return (
    <SectionCard
      id="journal-weekly-review"
      title="Weekly review"
      contentClassName="space-y-2 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Week ending
          <input
            type="date"
            value={end}
            onChange={(e) => e.target.value && setEnd(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void write()}
        >
          {busy ? "Writing…" : "Write the review"}
        </Button>
        {review && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void navigator.clipboard?.writeText(review.review)}
          >
            Copy
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Uses the week&apos;s trades (all accounts), your plan grades and trade links, and the Keep
        and Fix lists in your day notes.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {busy && writing && (
        <article
          className="rounded-md border p-3"
          aria-label="Review being written"
          aria-live="polite"
        >
          <Markdown externalImages="ask">{writing}</Markdown>
        </article>
      )}
      {review && !busy && (
        <article
          className="rounded-md border p-3"
          aria-label={`Review of ${review.from} to ${review.to}`}
        >
          <Markdown externalImages="ask">{review.review}</Markdown>
        </article>
      )}
    </SectionCard>
  );
}
