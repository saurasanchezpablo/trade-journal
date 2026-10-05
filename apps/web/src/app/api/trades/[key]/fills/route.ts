import { bad, handler, ok } from "@/server/api";
import { correctTradeFills, fillCorrections } from "@/server/fill-corrections";
import { getTradeByKey } from "@/server/trades-query";

type Params = { params: Promise<{ key: string }> };

/** The corrections made to this trade's fills, newest first. */
export const GET = handler(async (_request: Request, { params }: Params) => {
  const { key } = await params;
  if (!getTradeByKey(key)) return bad("Trade not found", 404);
  return ok({ corrections: fillCorrections(key) });
});

/**
 * Correct the trade's fills: `{ fills }` is the whole corrected list (rows with an `id` are
 * that fill, rows without one are added, fills left out are removed). Answers the trade's
 * key afterwards, which changes with its first fill's time, symbol or side.
 */
export const PUT = handler(async (request: Request, { params }: Params) => {
  const { key } = await params;
  if (!getTradeByKey(key)) return bad("Trade not found", 404);
  const body = (await request.json().catch(() => null)) as { fills?: unknown } | null;
  return ok(correctTradeFills(key, body?.fills));
});
