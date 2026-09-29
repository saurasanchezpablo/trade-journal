import { detectBehaviours, readFilters } from "@luxalgo/journal-core";
import { accounts, db } from "@/db";
import { handler, ok } from "@/server/api";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";

/** Behaviour patterns (revenge trades, trading on after losses, size, late fade) for the filters. */
export const GET = handler((request: Request) => {
  const params = new URL(request.url).searchParams;
  const { trades } = queryTrades(readFilters(params));
  const timeZone = getTimeZone();
  const report = detectBehaviours(trades, { timeZone });
  const byKey = new Map(trades.map((t) => [t.key, t]));
  const currencies = new Map(
    db
      .select({ id: accounts.id, currency: accounts.currency })
      .from(accounts)
      .all()
      .map((a) => [a.id, a.currency]),
  );
  return ok({
    ...report,
    currencies: [...new Set(trades.map((t) => currencies.get(t.accountId) ?? "USD"))],
    timeZone,
    examples: Object.fromEntries(
      report.patterns
        .flatMap((p) => p.examples)
        .map((key) => byKey.get(key))
        .filter((t) => t !== undefined)
        .map((t) => [
          t.key,
          { symbol: t.symbol, direction: t.direction, openedAt: t.openedAt, netPnl: t.netPnl },
        ]),
    ),
  });
});
