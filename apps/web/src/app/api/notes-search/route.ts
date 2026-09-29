import { eq } from "drizzle-orm";
import { dayKeyOf } from "@luxalgo/journal-core";
import { db, journalDays } from "@/db";
import { handler, ok, requireValue } from "@/server/api";
import { isDay } from "@/server/ai-scope";
import { prunePassages, searchNotes } from "@/server/note-search";
import { getTimeZone } from "@/server/settings";
import { getTradeByKey, queryTrades, rowToTrade } from "@/server/trades-query";

const MAX_QUERY = 4000;
let searches = 0;

/**
 * Search the notes by meaning (or by words without an embedding provider). `similarTo` a day
 * or a trade finds past situations like it: its note and trades are the question, and it is
 * left out of the answers.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as {
    query?: unknown;
    similarTo?: { date?: unknown; tradeKey?: unknown };
    limit?: unknown;
  };
  requireValue(
    body && Object.keys(body).every((k) => ["query", "similarTo", "limit"].includes(k)),
    "Unknown search field",
  );
  const limit =
    typeof body.limit === "number" && Number.isInteger(body.limit)
      ? Math.min(20, Math.max(1, body.limit))
      : 8;
  let query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY) : "";
  let exclude: ((doc: { kind: string; id: string; date: string | null }) => boolean) | undefined;
  const timeZone = getTimeZone();
  if (body.similarTo?.date !== undefined) {
    const date = body.similarTo.date;
    requireValue(isDay(date), "similarTo.date must be YYYY-MM-DD");
    const note = db.select().from(journalDays).where(eq(journalDays.date, date)).get()?.note ?? "";
    const dayTrades = queryTrades({ from: date, to: date }).trades;
    query = [
      note,
      dayTrades
        .map(
          (t) =>
            `${t.symbol} ${t.direction} ${t.status}${t.annotations?.tags?.length ? `, ${t.annotations.tags.join(", ")}` : ""}${t.annotations?.mistakes?.length ? `, mistakes ${t.annotations.mistakes.join(", ")}` : ""}`,
        )
        .join("; "),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_QUERY);
    // The day itself, and its own trades, are not "similar past days".
    exclude = (doc) => doc.date === date;
  } else if (body.similarTo?.tradeKey !== undefined) {
    requireValue(typeof body.similarTo.tradeKey === "string", "similarTo.tradeKey is required");
    const row = getTradeByKey(body.similarTo.tradeKey);
    requireValue(row, "Trade not found");
    const trade = rowToTrade(row);
    query = [
      row.notes ?? "",
      `${trade.symbol} ${trade.direction} ${trade.status}`,
      (trade.annotations?.tags ?? []).join(", "),
      (trade.annotations?.mistakes ?? []).join(", "),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_QUERY);
    const day = dayKeyOf(trade.openedAt, timeZone);
    exclude = (doc) => doc.id === trade.key || (doc.kind === "day" && doc.id === day);
  }
  requireValue(query, "Write what to look for, or write a note first");
  const result = await searchNotes(query, { limit, exclude, signal: request.signal });
  // Now and then, forget passages of notes that were edited or deleted.
  if (++searches % 25 === 0) prunePassages();
  return ok({ query: body.query === undefined ? null : query, ...result });
});
