import { dayKeyOf, plannedR, tradeR } from "@luxalgo/journal-core";
import { db, trades as tradesTable } from "@/db";
import { handler, ok, requireValue } from "@/server/api";
import { read, runAiObject } from "@/server/ai-structured";
import { getTimeZone } from "@/server/settings";
import { tradeMarketContext } from "@/server/trade-context";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";

const MAX_SUGGEST = 20;
const MAX_LABELS = 5;

/** The labels already in use, most used first: the AI reuses these before inventing any. */
function vocabulary() {
  const count = (column: "tagsJson" | "mistakesJson") => {
    const counts = new Map<string, number>();
    for (const row of db.select({ v: tradesTable[column] }).from(tradesTable).all()) {
      try {
        for (const label of JSON.parse(row.v ?? "[]") as unknown[])
          if (typeof label === "string" && label.trim())
            counts.set(label, (counts.get(label) ?? 0) + 1);
      } catch {
        // A malformed row adds nothing.
      }
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([label]) => label);
  };
  return { tags: count("tagsJson"), mistakes: count("mistakesJson") };
}

const labelList = (value: unknown) =>
  [
    ...new Set(
      read
        .array(value, MAX_LABELS * 2)
        .map((v) => read.text(v, 40))
        .filter(Boolean),
    ),
  ].slice(0, MAX_LABELS);

/**
 * Suggested tags, mistakes and a rating for up to 20 trades, from their fills, notes, R and
 * (for a single trade) the market around it. Suggestions only: labels change when you apply
 * them.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { keys?: unknown };
  requireValue(
    body &&
      Array.isArray(body.keys) &&
      body.keys.length >= 1 &&
      body.keys.length <= MAX_SUGGEST &&
      body.keys.every((k) => typeof k === "string"),
    `keys: 1 to ${MAX_SUGGEST} trade keys`,
  );
  requireValue(
    Object.keys(body).every((k) => k === "keys"),
    "Unknown field",
  );
  const keys = [...new Set(body.keys as string[])];
  const rows = keys.map((key) => getTradeByKey(key));
  requireValue(rows.every(Boolean), "A trade no longer exists. Refresh and try again.");
  const timeZone = getTimeZone();
  const words = vocabulary();
  const single = rows.length === 1;
  const lines = await Promise.all(
    rows.map(async (row, i) => {
      const trade = rowToTrade(row!);
      const market = single ? await tradeMarketContext(trade, timeZone, request.signal) : null;
      const r = tradeR(trade);
      const planned = plannedR(trade);
      return [
        `Trade ${i + 1}: ${trade.symbol} ${trade.direction}, ${trade.status}, net ${trade.netPnl.toFixed(2)}${r === null ? "" : `, ${r.toFixed(2)}R`}${planned === null ? "" : `, planned ${planned.toFixed(2)}R`}`,
        `  day ${dayKeyOf(trade.openedAt, timeZone)}, opened ${trade.openedAt}, held ${Math.round((trade.durationMs ?? 0) / 60_000)} min, ${trade.executionCount} fills, quantity ${trade.quantity}`,
        `  stop ${row!.stopLoss ?? "none"}, target ${row!.profitTarget ?? "none"}, rating ${row!.rating ?? "none"}`,
        `  current tags: ${(trade.annotations?.tags ?? []).join(", ") || "none"}; mistakes: ${(trade.annotations?.mistakes ?? []).join(", ") || "none"}`,
        `  notes: ${row!.notes?.trim().replace(/\s+/g, " ").slice(0, 600) || "none"}`,
        market?.ok ? `  market: ${market.text.replace(/\n/g, " ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  );
  const prompt = `Suggest labels for each trade below, for the trader to accept or not.
- tags: what the trade was (setup, context), up to ${MAX_LABELS}.
- mistakes: only mistakes the facts show (for example no stop, held past the stop, oversized,
  chased the entry, exited early against the plan); none is a fine answer.
- rating: 1 to 5 for execution quality (not the P&L), or null when the facts can't tell.
- reason: one short sentence citing the facts.
Reuse the trader's existing labels, spelled the same, whenever one fits; only suggest a new
label when none does. Leave out labels the trade already has.

Tags in use: ${words.tags.join(", ") || "none yet"}
Mistakes in use: ${words.mistakes.join(", ") || "none yet"}

${lines.join("\n\n")}`;

  const answer = await runAiObject({
    prompt,
    name: "trade_labels",
    maxOutputTokens: 400 + 200 * rows.length,
    schema: {
      type: "object",
      properties: {
        trades: {
          type: "array",
          items: {
            type: "object",
            properties: {
              trade: { type: "integer", description: "The trade's number." },
              tags: { type: "array", items: { type: "string" } },
              mistakes: { type: "array", items: { type: "string" } },
              rating: { type: ["integer", "null"], minimum: 1, maximum: 5 },
              reason: { type: "string" },
            },
            required: ["trade", "tags", "mistakes", "rating", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["trades"],
      additionalProperties: false,
    },
    read: (value) => {
      const byIndex = new Map<
        number,
        { tags: string[]; mistakes: string[]; rating: number | null; reason: string }
      >();
      for (const item of read.array(read.object(value).trades, MAX_SUGGEST * 2)) {
        const o = read.object(item);
        const index = read.number(o.trade);
        if (!Number.isInteger(index) || index < 1 || index > rows.length) continue;
        const rating = o.rating === null ? null : read.number(o.rating);
        byIndex.set(index, {
          tags: labelList(o.tags),
          mistakes: labelList(o.mistakes),
          rating:
            rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5
              ? rating
              : null,
          reason: read.text(o.reason, 300),
        });
      }
      return byIndex;
    },
  });

  const known = { tags: new Set(words.tags), mistakes: new Set(words.mistakes) };
  return ok({
    suggestions: rows.map((row, i) => {
      const trade = rowToTrade(row!);
      const s = answer.get(i + 1) ?? { tags: [], mistakes: [], rating: null, reason: "" };
      const fresh = (list: string[], have: string[] = []) =>
        list.filter((l) => !have.some((h) => h.toLowerCase() === l.toLowerCase()));
      const tags = fresh(s.tags, trade.annotations?.tags);
      const mistakes = fresh(s.mistakes, trade.annotations?.mistakes);
      return {
        key: row!.key,
        symbol: trade.symbol,
        openedAt: trade.openedAt,
        tags,
        mistakes,
        // Labels nobody has used yet are marked, so a typo doesn't start a new category.
        newLabels: [
          ...tags.filter((t) => !known.tags.has(t)),
          ...mistakes.filter((m) => !known.mistakes.has(m)),
        ],
        rating: s.rating,
        currentTags: trade.annotations?.tags ?? [],
        currentMistakes: trade.annotations?.mistakes ?? [],
        currentRating: row!.rating ?? null,
        reason: s.reason,
      };
    }),
  });
});
