import { bad, handler, ok } from "@/server/api";
import { tradeMarketSource } from "@/server/trade-market-source";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";

/** The candle source the trade page opens with, chosen automatically (or why there is none). */
export const GET = handler(
  async (request: Request, { params }: { params: Promise<{ key: string }> }) => {
    const { key } = await params;
    const row = getTradeByKey(key);
    if (!row) return bad("Trade not found", 404);
    return ok(await tradeMarketSource(rowToTrade(row), request.signal));
  },
);
