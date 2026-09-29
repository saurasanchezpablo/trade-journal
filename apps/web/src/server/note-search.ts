import { createHash } from "node:crypto";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { db, journalDays, notes, trades } from "@/db";
import {
  chunkText,
  cosine,
  rankDocs,
  wordScores,
  type SearchDoc,
  type SearchHit,
} from "@/lib/note-search";
import { aiFailure } from "./ai";
import { getAiKey, getAiProvider } from "./settings";

/**
 * Note search. Passages and their embeddings are kept in a table of their own (created on
 * first use), keyed by the passage's text, so only new or edited passages are sent to the
 * provider; deleted notes drop out on the next search. The notes stay the only source.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS note_passages (
 hash TEXT NOT NULL, model TEXT NOT NULL, vector BLOB NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY (hash, model)
);
`;
const ready = new WeakSet<object>();
const client = () => {
  if (!ready.has(db)) {
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

/** Embedding models by provider; Anthropic has none, so it searches by words. */
const MODELS = { openai: "text-embedding-3-small", google: "gemini-embedding-001" } as const;
const BATCH = 96;
const MAX_NEW_PER_SEARCH = 2000;

export function embeddingProvider() {
  const provider = getAiProvider();
  if (provider !== "openai" && provider !== "google") return null;
  const apiKey = getAiKey(provider);
  if (!apiKey) return null;
  const id = MODELS[provider];
  return {
    name: provider === "openai" ? "OpenAI" : "Google Gemini",
    model: `${provider}:${id}`,
    embedding:
      provider === "openai"
        ? createOpenAI({ apiKey }).embedding(id)
        : createGoogleGenerativeAI({ apiKey }).embedding(id),
  };
}

const safeList = (json: string | null) => {
  try {
    const v = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Every note: day notes, trade notes (with their labels) and notebook notes. */
export function collectDocs(options: { tradeKeys?: Set<string>; withShared?: boolean } = {}) {
  const docs: SearchDoc[] = [];
  const shared = options.withShared !== false;
  if (shared)
    for (const d of db.select().from(journalDays).all())
      if (d.note.trim())
        docs.push({
          kind: "day",
          id: d.date,
          title: `Day ${d.date}`,
          url: `/journal/${d.date}`,
          date: d.date,
          text: d.note,
        });
  for (const t of db
    .select({
      key: trades.key,
      symbol: trades.symbol,
      direction: trades.direction,
      openedAt: trades.openedAt,
      notes: trades.notes,
      tagsJson: trades.tagsJson,
      mistakesJson: trades.mistakesJson,
    })
    .from(trades)
    .all()) {
    if (!t.notes?.trim() || (options.tradeKeys && !options.tradeKeys.has(t.key))) continue;
    const labels = [...safeList(t.tagsJson), ...safeList(t.mistakesJson)];
    docs.push({
      kind: "trade",
      id: t.key,
      title: `${t.symbol} ${t.direction} ${t.openedAt.slice(0, 10)}`,
      url: `/trades/${encodeURIComponent(t.key)}`,
      date: t.openedAt.slice(0, 10),
      text: `${t.notes}${labels.length ? `\n\nLabels: ${labels.join(", ")}` : ""}`,
    });
  }
  if (shared)
    for (const n of db.select().from(notes).all())
      if (n.content.trim())
        docs.push({
          kind: "note",
          id: n.id,
          title: n.title || "Untitled note",
          url: "/notebook",
          date: n.dayDate ?? n.updatedAt.slice(0, 10),
          text: `${n.title}\n\n${n.content}`,
        });
  return docs;
}

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");
const toBlob = (v: number[]) => Buffer.from(new Float32Array(v).buffer);
const fromBlob = (b: Buffer) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

export interface SearchResult {
  mode: "meaning" | "words";
  /** Why it searched by words, when it did. */
  note: string | null;
  results: SearchHit[];
}

export async function searchNotes(
  query: string,
  options: {
    limit?: number;
    /** Leave these notes out, such as the day being compared. */
    exclude?: (doc: SearchDoc) => boolean;
    tradeKeys?: Set<string>;
    withShared?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<SearchResult> {
  const limit = options.limit ?? 8;
  const docs = collectDocs(options).filter((d) => !options.exclude?.(d));
  const passages = docs.flatMap((doc) => chunkText(doc.text).map((text) => ({ doc, text })));
  const byWords = (note: string | null): SearchResult => {
    const scores = wordScores(
      query,
      passages.map((p) => p.text),
    );
    return {
      mode: "words",
      note,
      results: rankDocs(
        passages.map((p, i) => ({ ...p, score: scores[i]! })),
        limit,
        0.0001,
      ),
    };
  };
  const provider = embeddingProvider();
  if (!provider)
    return byWords(
      "Searching by words: meaning search needs OpenAI or Google Gemini as the AI provider (Anthropic has no embeddings).",
    );
  if (!passages.length) return { mode: "meaning", note: null, results: [] };
  try {
    const sql = client();
    const stored = new Map(
      (
        sql
          .prepare("SELECT hash, vector FROM note_passages WHERE model = ?")
          .all(provider.model) as {
          hash: string;
          vector: Buffer;
        }[]
      ).map((r) => [r.hash, fromBlob(r.vector)]),
    );
    const hashes = passages.map((p) => hashOf(p.text));
    const missing = [...new Set(hashes.filter((h) => !stored.has(h)))].slice(0, MAX_NEW_PER_SEARCH);
    const textOf = new Map(hashes.map((h, i) => [h, passages[i]!.text]));
    const insert = sql.prepare(
      "INSERT OR REPLACE INTO note_passages (hash, model, vector, updated_at) VALUES (?, ?, ?, ?)",
    );
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const { embeddings } = await embedMany({
        model: provider.embedding,
        values: batch.map((h) => textOf.get(h)!),
        abortSignal: options.signal,
      });
      const now = new Date().toISOString();
      sql.transaction(() => {
        batch.forEach((h, j) => {
          insert.run(h, provider.model, toBlob(embeddings[j]!), now);
          stored.set(h, new Float32Array(embeddings[j]!));
        });
      })();
    }
    const { embeddings } = await embedMany({
      model: provider.embedding,
      values: [query],
      abortSignal: options.signal,
    });
    const q = embeddings[0]!;
    return {
      mode: "meaning",
      note: null,
      results: rankDocs(
        passages.map((p, i) => ({
          ...p,
          score: stored.has(hashes[i]!) ? cosine(q, stored.get(hashes[i]!)!) : 0,
        })),
        limit,
        0.2,
      ),
    };
  } catch (error) {
    return byWords(`Searching by words: ${aiFailure(error).message}`);
  }
}

/** Drop stored passages no note uses any more (called after a search now and then). */
export function prunePassages(): number {
  const live = new Set(collectDocs().flatMap((d) => chunkText(d.text).map((text) => hashOf(text))));
  const sql = client();
  const rows = sql.prepare("SELECT hash FROM note_passages").all() as { hash: string }[];
  const del = sql.prepare("DELETE FROM note_passages WHERE hash = ?");
  let n = 0;
  sql.transaction(() => {
    for (const r of rows) if (!live.has(r.hash)) n += del.run(r.hash).changes;
  })();
  return n;
}
