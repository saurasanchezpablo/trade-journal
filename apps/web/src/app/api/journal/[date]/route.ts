import { readFilters } from "@luxalgo/journal-core";
import { eq, inArray } from "drizzle-orm";
import { computeMetrics, dayKeyOf, intradayCurve } from "@luxalgo/journal-core";
import { db, executions, journalDays } from "@/db";
import { bad, handler, ok } from "@/server/api";
import { nowIso } from "@/server/ids";
import { optionalString, requireObject } from "@/server/request-fields";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";

type Params = { params: Promise<{ date: string }> };

/** Generous: recaps and external summaries are appended to the day's note. */
const MAX_DAY_NOTE = 1_000_000;

export const GET = handler(async (request: Request, { params }: Params) => {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const url = new URL(request.url);
  const timeZone = getTimeZone();

  const { rows, trades } = queryTrades(readFilters(url.searchParams));
  const dayTradeIndexes = trades
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => trade.closedAt && dayKeyOf(trade.closedAt, timeZone) === date);
  const dayTrades = dayTradeIndexes.map(({ trade }) => trade);

  // The intraday curve needs exit timestamps: read only the day's trades' own fills.
  const times = new Map<string, string>();
  const fillIds = [...new Set(dayTrades.flatMap((trade) => trade.executionIds))];
  for (let i = 0; i < fillIds.length; i += 500)
    for (const fill of db
      .select({ id: executions.id, executedAt: executions.executedAt })
      .from(executions)
      .where(inArray(executions.id, fillIds.slice(i, i + 500)))
      .all())
      times.set(fill.id, fill.executedAt);

  const note = db.select().from(journalDays).where(eq(journalDays.date, date)).get();
  return ok({
    date,
    metrics: computeMetrics(dayTrades, { timeZone }),
    trades: dayTradeIndexes.map(({ index }) => rows[index]),
    intraday: intradayCurve(dayTrades, times, date, timeZone),
    note: note?.note ?? "",
  });
});

export const PUT = handler(async (request: Request, { params }: Params) => {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const body = requireObject(await request.json(), "Enter a valid day note.");
  const note =
    optionalString(
      body.note,
      MAX_DAY_NOTE,
      `Day notes must be at most ${MAX_DAY_NOTE.toLocaleString("en-US")} characters.`,
    ) ?? "";
  db.insert(journalDays)
    .values({ date, note, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: journalDays.date,
      set: { note, updatedAt: nowIso() },
    })
    .run();
  return ok({ saved: true });
});
