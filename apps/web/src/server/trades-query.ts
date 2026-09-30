import { and, asc, eq, inArray } from "drizzle-orm";
import { matchesFilters, type AnalysisFilters, type AnnotatedTrade } from "@luxalgo/journal-core";
import { getTimeZone, getMultipliers, getJournalDefaults } from "./settings";
import { db, trades } from "@/db";

export type TradeFilters = AnalysisFilters & { accountIds?: string[] };

export type TradeRow = typeof trades.$inferSelect;

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

/** Settings that turn a stored trade into what the journal shows: multipliers and breakeven. */
export type TradeStatusConfig = ReturnType<typeof tradeStatusConfig>;
export const tradeStatusConfig = () => ({
  multipliers: getMultipliers(),
  defaults: getJournalDefaults(),
});
const context = tradeStatusConfig;

/** The stored columns a trade's shown status depends on. */
export type TradeStatusFields = Pick<
  TradeRow,
  "status" | "netPnl" | "avgEntry" | "quantity" | "symbol" | "assetClass"
>;

/**
 * The status the journal shows: the stored status only says open or closed; a closed trade
 * within the user's breakeven tolerance (an amount, or a percent of its notional) is
 * breakeven. Every reader of trade rows uses this so lists, filters and reviews agree.
 */
export const tradeStatus = (
  row: TradeStatusFields,
  config: TradeStatusConfig = context(),
): AnnotatedTrade["status"] => {
  if (row.status === "open") return "open";
  const multiplier = config.multipliers[row.symbol];
  const defaults = config.defaults;
  const missingMultiplier =
    multiplier == null && ["futures", "option", "forex", "cfd"].includes(row.assetClass ?? "");
  const notional = missingMultiplier
    ? 0
    : Math.abs(row.avgEntry * row.quantity * (multiplier ?? 1));
  const tolerance =
    defaults.breakevenMode === "percent"
      ? (notional * defaults.breakeven) / 100
      : defaults.breakeven;
  return Math.abs(row.netPnl) <= Math.max(1e-9, tolerance)
    ? "breakeven"
    : row.netPnl > 0
      ? "win"
      : "loss";
};

export const rowToTrade = (row: TradeRow, config = context()): AnnotatedTrade => {
  const multiplier = config.multipliers[row.symbol];
  const status = tradeStatus(row, config);
  return {
    key: row.key,
    accountId: row.accountId,
    symbol: row.symbol,
    assetClass: (row.assetClass ?? undefined) as AnnotatedTrade["assetClass"],
    direction: row.direction,
    status,
    contractMultiplier: multiplier,
    openedAt: row.openedAt,
    closedAt: row.closedAt ?? undefined,
    quantity: row.quantity,
    openQuantity: row.openQuantity,
    avgEntry: row.avgEntry,
    avgExit: row.avgExit ?? undefined,
    grossPnl: row.grossPnl,
    fees: row.fees,
    netPnl: row.netPnl,
    executionCount: row.executionCount,
    executionIds: parseJsonArray(row.executionIdsJson),
    exits: JSON.parse(row.exitsJson) as AnnotatedTrade["exits"],
    durationMs: row.durationMs ?? undefined,
    annotations: {
      tags: parseJsonArray(row.tagsJson),
      mistakes: parseJsonArray(row.mistakesJson),
      playbook: row.playbookId ?? undefined,
      rating: row.rating ?? undefined,
      stopLoss: row.stopLoss ?? undefined,
      profitTarget: row.profitTarget ?? undefined,
      reviewed: row.reviewedAt !== null,
    },
  };
};

/**
 * Narrow indexed identity fields before decoding rows. The core predicate
 * remains authoritative for timezone, risk and breakeven semantics.
 */
export const queryTrades = (
  filters: TradeFilters = {},
): { rows: TradeRow[]; trades: AnnotatedTrade[] } => {
  const effective = { ...filters, accounts: filters.accounts ?? filters.accountIds?.join(",") };
  const accountIds = effective.accounts
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const all = db
    .select()
    .from(trades)
    .where(
      and(
        accountIds?.length ? inArray(trades.accountId, accountIds) : undefined,
        effective.playbookId ? eq(trades.playbookId, effective.playbookId) : undefined,
        effective.direction
          ? eq(trades.direction, effective.direction as "long" | "short")
          : undefined,
        effective.assetClass ? eq(trades.assetClass, effective.assetClass) : undefined,
      ),
    )
    .orderBy(asc(trades.openedAt))
    .all();
  const timeZone = getTimeZone();
  const config = context();
  const pairs = all
    .map((row) => ({ row, trade: rowToTrade(row, config) }))
    .filter(({ trade }) => matchesFilters(trade, effective, timeZone));
  return {
    rows: pairs.map(({ row, trade }) => ({ ...row, status: trade.status })),
    trades: pairs.map((p) => p.trade),
  };
};

export const getTradeByKey = (key: string): TradeRow | undefined =>
  db.select().from(trades).where(eq(trades.key, key)).get();
