"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Search } from "lucide-react";
import type { SearchHit } from "@/lib/note-search";
import { postJson } from "@/lib/use-api";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { SectionCard } from "./section-card";

interface Result {
  mode: "meaning" | "words";
  note: string | null;
  results: SearchHit[];
}

const KIND = { day: "DAY", trade: "TRADE", note: "NOTE" } as const;

function Hits({ result }: { result: Result }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {result.note ?? (result.mode === "meaning" ? "Searched by meaning." : "Searched by words.")}
      </p>
      {result.results.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing close enough in your notes.</p>
      ) : (
        <ul className="divide-y rounded-md border" aria-label="Search results">
          {result.results.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`} className="space-y-0.5 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{KIND[hit.kind]}</Badge>
                <Link href={hit.url} className="text-sm underline-offset-4 hover:underline">
                  {hit.title}
                </Link>
              </div>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{hit.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Search every note (day, trade and notebook) by meaning, or by words without embeddings. */
export function NoteSearch() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await postJson<Result>("/api/notes-search", { query }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SectionCard
      id="journal-note-search"
      title="Search your notes"
      contentClassName="space-y-2 text-sm"
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="Search your notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Times I froze after a stop-out"
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
        />
        <Button type="submit" size="sm" disabled={busy || !query.trim()}>
          <Search />
          {busy ? "Searching…" : "Search"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        With OpenAI or Gemini as your AI provider, notes are matched by meaning (passages are sent
        once to the provider to be indexed); otherwise by words, on this server only.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {result && <Hits result={result} />}
    </SectionCard>
  );
}

/** Past days or trades like this one, from your notes. */
export function SimilarPast({
  similarTo,
  label,
}: {
  similarTo: { date: string } | { tradeKey: string };
  label: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const find = async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await postJson<Result>("/api/notes-search", { similarTo, limit: 5 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void find()}>
        <History />
        {busy ? "Looking…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {result && <Hits result={result} />}
    </div>
  );
}
