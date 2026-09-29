import { parseCsv } from "@luxalgo/journal-importers";
import { handler, ok, requireValue } from "@/server/api";
import { read, runAiObject } from "@/server/ai-structured";

const FIELDS = ["symbol", "side", "quantity", "price", "fee", "timestamp"] as const;
const REQUIRED = new Set(["symbol", "side", "quantity", "price", "timestamp"]);
const SAMPLE_ROWS = 5;
const MAX_CONTENT = 20 * 1024 * 1024;

/**
 * A suggested column mapping for a statement the importers don't recognise. Only the header
 * row and the first few rows are sent to the AI provider. The suggestion fills the column
 * mapper; the file is imported only after you preview and confirm it, as with a mapping you
 * chose yourself.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { content?: unknown };
  requireValue(
    body && typeof body.content === "string" && body.content.length <= MAX_CONTENT,
    "content is required",
  );
  requireValue(
    Object.keys(body).every((k) => k === "content"),
    "Unknown field",
  );
  const rows = parseCsv(body.content);
  const headers = (rows[0] ?? []).map((h) => h.trim());
  requireValue(headers.filter(Boolean).length >= 2, "The file has no header row to map.");
  const sample = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .slice(0, SAMPLE_ROWS)
    .map((row) => headers.map((_, i) => (row[i] ?? "").trim().slice(0, 40)));

  const prompt = `A trader is importing a broker statement the journal does not recognise. Map its columns to
the journal's fields, using the exact header text, or null when no column fits:
- symbol: the instrument traded
- side: buy or sell (or a signed quantity column, when that is the only side information)
- quantity: the size filled
- price: the fill price
- fee: commissions and fees (optional)
- timestamp: the fill's date and time (one column)
Only map what the headers and sample values show. In "note", say in one or two sentences what
you were unsure of, for the trader to check.

Headers: ${JSON.stringify(headers)}
First rows:
${sample.map((row) => JSON.stringify(row)).join("\n") || "(none)"}`;

  const answer = await runAiObject({
    prompt,
    name: "column_mapping",
    maxOutputTokens: 500,
    schema: {
      type: "object",
      properties: {
        ...Object.fromEntries(FIELDS.map((f) => [f, { type: ["string", "null"] }])),
        note: { type: "string" },
      },
      required: [...FIELDS, "note"],
      additionalProperties: false,
    },
    read: (value) => {
      const o = read.object(value);
      const mapping: Record<string, string> = {};
      const used = new Set<string>();
      for (const field of FIELDS) {
        const column = o[field];
        // Only a real header counts, and each column maps to one field.
        if (
          typeof column === "string" &&
          headers.includes(column.trim()) &&
          !used.has(column.trim())
        ) {
          mapping[field] = column.trim();
          used.add(column.trim());
        }
      }
      return { mapping, note: typeof o.note === "string" ? read.text(o.note, 400) : "" };
    },
  });
  return ok({
    mapping: answer.mapping,
    missing: FIELDS.filter((f) => REQUIRED.has(f) && !answer.mapping[f]),
    note: answer.note,
  });
});
