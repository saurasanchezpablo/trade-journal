/**
 * Searching your own notes (day notes, trade notes, notebook notes). Two ways, the same
 * results shape:
 *
 * - **By meaning**: notes are cut into passages, each turned into an embedding (a list of
 *   numbers) by the AI provider, and passages closest to the question win, so "froze after a
 *   loss" finds "couldn't pull the trigger after the stop-out".
 * - **By words**: when no embedding provider is set, a local word match (BM25) that needs
 *   no network.
 */

export interface SearchDoc {
  kind: "day" | "trade" | "note";
  id: string;
  title: string;
  url: string;
  /** "YYYY-MM-DD" the note belongs to, for sorting and exclusions. */
  date: string | null;
  text: string;
}

export interface SearchHit {
  kind: SearchDoc["kind"];
  id: string;
  title: string;
  url: string;
  date: string | null;
  snippet: string;
  score: number;
}

/** Markdown reduced to its words: no images, link targets, code fences or markup. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>|~]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export const CHUNK_CHARS = 900;

/** Passages of about `CHUNK_CHARS`, cut at paragraph and then sentence ends. */
export function chunkText(text: string, size = CHUNK_CHARS): string[] {
  const clean = plainText(text);
  if (!clean) return [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const paragraph of clean.split(/\n\s*\n/)) {
    const pieces =
      paragraph.length > size ? (paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? [paragraph]) : [paragraph];
    for (const piece of pieces) {
      if (piece.length > size) {
        // A single sentence longer than a passage is cut where it must be.
        push();
        for (let i = 0; i < piece.length; i += size) chunks.push(piece.slice(i, i + size).trim());
        continue;
      }
      if (current && current.length + piece.length > size) push();
      current += (current && !current.endsWith("\n") ? " " : "") + piece.trim();
    }
    // Paragraphs stay apart within a passage.
    if (current) current += "\n";
  }
  push();
  return chunks;
}

const WORD = /[a-z0-9%]+/g;
const STOP = new Set(
  "a an the to of and or in on at for with my i me is am are was were be been it its this that than then so as by from".split(
    " ",
  ),
);
const words = (text: string) =>
  (text.toLowerCase().match(WORD) ?? []).filter((w) => !STOP.has(w) && w.length > 1);

/** BM25 scores of `query` against each passage (0 when no word matches). */
export function wordScores(query: string, passages: string[]): number[] {
  const terms = [...new Set(words(query))];
  if (!terms.length || !passages.length) return passages.map(() => 0);
  const docs = passages.map(words);
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length || 1;
  const df = new Map(terms.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
  const k1 = 1.2;
  const b = 0.75;
  return docs.map((doc) => {
    let score = 0;
    for (const term of terms) {
      const tf = doc.filter((w) => w === term).length;
      if (!tf) continue;
      const n = df.get(term)!;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / avg));
    }
    return score;
  });
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** The best passage per note, best notes first. */
export function rankDocs(
  passages: { doc: SearchDoc; text: string; score: number }[],
  limit: number,
  minScore: number,
): SearchHit[] {
  const best = new Map<string, { doc: SearchDoc; text: string; score: number }>();
  for (const p of passages) {
    if (p.score < minScore) continue;
    const key = `${p.doc.kind}:${p.doc.id}`;
    const current = best.get(key);
    if (!current || p.score > current.score) best.set(key, p);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || (b.doc.date ?? "").localeCompare(a.doc.date ?? ""))
    .slice(0, limit)
    .map(({ doc, text, score }) => ({
      kind: doc.kind,
      id: doc.id,
      title: doc.title,
      url: doc.url,
      date: doc.date,
      snippet: text.length > 280 ? `${text.slice(0, 280)}…` : text,
      score: Number(score.toFixed(4)),
    }));
}
