import type { ImportedExecution } from "@luxalgo/journal-importers";
import { bad, handler, ok, requireValue } from "@/server/api";
import { EXPLICIT_INSTANT, insertExecutions } from "@/server/executions";

interface ManualBody {
  accountId: string;
  executions: ImportedExecution[];
  notes?: string;
}

/** Manual trade entry: the client sends raw fills (entry legs + exit legs). */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as ManualBody;
  requireValue(
    body?.notes === undefined || (typeof body.notes === "string" && body.notes.length <= 100000),
    "Notes must be at most 100,000 characters.",
  );
  if (!body.accountId || !Array.isArray(body.executions) || body.executions.length === 0) {
    return bad("accountId and a non-empty executions array are required");
  }
  for (const row of body.executions) {
    if (
      !row ||
      typeof row.symbol !== "string" ||
      !row.symbol.trim() ||
      !["buy", "sell"].includes(row.side) ||
      typeof row.executedAt !== "string" ||
      !Number.isFinite(Date.parse(row.executedAt)) ||
      !Number.isFinite(row.quantity) ||
      !(row.quantity > 0) ||
      !Number.isFinite(row.price) ||
      !Number.isFinite(row.fee ?? 0)
    ) {
      return bad("every execution needs symbol, side, quantity > 0, price, executedAt");
    }
    // Without an offset the time would be read in the server's timezone, not the trader's.
    if (!EXPLICIT_INSTANT.test(row.executedAt.trim()))
      return bad(
        "executedAt needs a UTC offset or Z, for example 2026-01-05T15:30:00Z or 2026-01-05T10:30:00-05:00",
      );
  }
  const rows = body.executions.map((row) => ({
    ...row,
    symbol: row.symbol.trim().toUpperCase(),
    fee: row.fee ?? 0,
  }));
  return ok(insertExecutions(body.accountId, rows, "manual", body.notes));
});
