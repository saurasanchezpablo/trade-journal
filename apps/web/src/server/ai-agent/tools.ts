import { eq } from "drizzle-orm";
import {
  DIMENSIONS,
  FILTER_KEYS,
  analyzeGroups,
  computeMetrics,
  dayKeyOf,
  detectBehaviours,
  matchesFilters,
  plannedR,
  tradeR,
  type AnalysisFilters,
  type AnnotatedTrade,
  type Dimension,
} from "@luxalgo/journal-core";
import { jsonSchema, tool, type ToolSet } from "ai";
import { db, journalDays, playbooks, tradeExcursions } from "@/db";
import { RESOLUTIONS, isResolution, type MarketBar, type Resolution } from "@/lib/market-data";
import { matchKeys, symbolKey } from "@/lib/symbol-match";
import { describePlan } from "@/lib/analysis-plan";
import { RequestError } from "../api";
import { parseAiFilters, type readAiRequest } from "../ai-scope";
import { analysesPrompt, describeAnalysis, linkedAnalyses } from "../ai-analyses";
import { getAnalysis, listAnalyses } from "../chart-analyses";
import { listExecutions } from "../executions";
import { connectionKey, providerFor } from "../market-data/connections";
import { queryTrades, type TradeRow } from "../trades-query";
import { lessonHistory } from "../lessons";
import { describeLesson } from "@/lib/lesson-tracking";

/**
 * Read-only journal tools for the AI chat. Every tool starts from the conversation's scope
 * (the accounts and filters it was opened with) and can only narrow it: a tool's filters
 * are applied on top of the scope's trades, never instead of them. Nothing here writes.
 */

export type AiScope = ReturnType<typeof readAiRequest>;

/** Tool results are cut to this size so one call cannot flood the model's context. */
export const MAX_TOOL_RESULT_CHARS = 16_000;
export const MAX_TRADES_LISTED = 50;
export const MAX_GROUPS_LISTED = 40;
export const MAX_CANDLES = 150;
const MAX_NOTE_CHARS = 4000;
const CANDLE_TIMEOUT_MS = 10_000;

const round = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}… [${text.length - max} more characters]` : text;

/** Fit a result into the budget: lists are shortened before anything is cut mid-way. */
export function boundResult(value: unknown): unknown {
  const text = JSON.stringify(value);
  if (text.length <= MAX_TOOL_RESULT_CHARS) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = { ...(value as Record<string, unknown>) };
    const listKey = Object.keys(record).find((key) => Array.isArray(record[key]));
    if (listKey) {
      const list = record[listKey] as unknown[];
      let keep = list.length;
      while (
        keep > 1 &&
        JSON.stringify({ ...record, [listKey]: list.slice(0, keep) }).length > MAX_TOOL_RESULT_CHARS
      )
        keep = Math.floor(keep * 0.7);
      const shortened = {
        ...record,
        [listKey]: list.slice(0, keep),
        note: `Showing ${keep} of ${list.length}; narrow the filters or lower the limit for the rest.`,
      };
      if (JSON.stringify(shortened).length <= MAX_TOOL_RESULT_CHARS) return shortened;
    }
  }
  return { truncated: true, text: clip(text, MAX_TOOL_RESULT_CHARS - 200) };
}

// ── Inputs ──

const FILTER_HELP: Partial<Record<(typeof FILTER_KEYS)[number], string>> = {
  accounts: "Comma-separated account ids (from journal_overview).",
  from: "First local day, YYYY-MM-DD (by close day, open day for open trades).",
  to: "Last local day, YYYY-MM-DD.",
  symbol: "Comma-separated symbols to include.",
  excludeSymbol: "Comma-separated symbols to exclude.",
  tag: "Comma-separated tags; a trade must carry all of them.",
  mistake: "Comma-separated mistakes; a trade must carry all of them.",
  playbookId: "Strategy id (from journal_overview).",
  direction: "long or short.",
  status: "closed, open, win, loss or breakeven.",
  assetClass: "equity, futures, forex, option, crypto, cfd or other.",
  reviewed: "yes or no.",
  durationMin: "Minimum holding time in minutes.",
  durationMax: "Maximum holding time in minutes.",
  rMin: "Minimum realized R (trades with a stop only).",
  rMax: "Maximum realized R.",
  pnlMin: "Minimum net P&L in account currency.",
  pnlMax: "Maximum net P&L in account currency.",
  weekdays: "Comma-separated weekday numbers of the open day, 0 Sunday to 6 Saturday.",
  entryAfter: "Entry clock time from, HH:MM in the journal timezone.",
  entryBefore: "Entry clock time to, HH:MM (a window may wrap past midnight).",
  exitAfter: "Exit clock time from, HH:MM.",
  exitBefore: "Exit clock time to, HH:MM.",
};

const filtersSchema = {
  type: "object",
  description:
    "Optional journal filters, applied on top of the conversation's scope (they can only narrow it). Values are strings.",
  properties: Object.fromEntries(
    FILTER_KEYS.map((key) => [
      key,
      { type: "string", ...(FILTER_HELP[key] ? { description: FILTER_HELP[key] } : {}) },
    ]),
  ),
  additionalProperties: false,
} as const;

const DIMENSION_KEYS = Object.keys(DIMENSIONS) as Dimension[];

/** Models sometimes send numbers for numeric filters; accept them as their decimal text. */
export function readToolFilters(value: unknown): AnalysisFilters {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new RequestError("filters must be an object");
  const normalized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([k, v]) => [k, typeof v === "number" || typeof v === "boolean" ? String(v) : v]),
  );
  return parseAiFilters(normalized);
}

// ── Scope ──

interface ScopeData {
  trades: AnnotatedTrade[];
  rows: Map<string, TradeRow>;
  playbookNames: Map<string, string>;
  accountNames: Map<string, string>;
}

export function scopeData(scope: AiScope): () => ScopeData {
  let cached: ScopeData | null = null;
  return () => {
    if (cached) return cached;
    const { rows, trades } = queryTrades(scope.filters);
    cached = {
      trades,
      rows: new Map(rows.map((row) => [row.key, row])),
      playbookNames: new Map(
        db
          .select({ id: playbooks.id, name: playbooks.name })
          .from(playbooks)
          .all()
          .map((p) => [p.id, p.name]),
      ),
      accountNames: new Map(scope.accounts.map((a) => [a.id, a.name])),
    };
    return cached;
  };
}

/** Day notes and cross-account plan data are shared: only for an unfiltered, all-account scope. */
const sharedScope = (scope: AiScope) =>
  Object.keys(scope.filters).every((key) => key === "from" || key === "to");

// ── Formatting ──

function compactTrade(trade: AnnotatedTrade, data: ScopeData, timeZone: string) {
  const row = data.rows.get(trade.key);
  return {
    key: trade.key,
    account: data.accountNames.get(trade.accountId) ?? trade.accountId,
    symbol: trade.symbol,
    direction: trade.direction,
    status: trade.status,
    openedAt: trade.openedAt,
    closedAt: trade.closedAt ?? null,
    day: dayKeyOf(trade.closedAt ?? trade.openedAt, timeZone),
    quantity: trade.quantity,
    avgEntry: trade.avgEntry,
    avgExit: trade.avgExit ?? null,
    netPnl: round(trade.netPnl),
    fees: round(trade.fees),
    heldMinutes: trade.durationMs == null ? null : Math.round(trade.durationMs / 60_000),
    realizedR: round(tradeR(trade)),
    plannedR: round(plannedR(trade)),
    stopLoss: trade.annotations?.stopLoss ?? null,
    profitTarget: trade.annotations?.profitTarget ?? null,
    tags: trade.annotations?.tags ?? [],
    mistakes: trade.annotations?.mistakes ?? [],
    strategy: trade.annotations?.playbook
      ? (data.playbookNames.get(trade.annotations.playbook) ?? trade.annotations.playbook)
      : null,
    rating: trade.annotations?.rating ?? null,
    reviewed: Boolean(trade.annotations?.reviewed),
    hasNotes: Boolean(row?.notes?.trim()),
  };
}

function metricsSummary(trades: AnnotatedTrade[], timeZone: string) {
  const m = computeMetrics(trades, { timeZone });
  const pct = (v: number | null) => (v === null ? null : round(v * 100, 1));
  return {
    closedTrades: m.closedTrades,
    openTrades: m.openTrades,
    wins: m.wins,
    losses: m.losses,
    breakevens: m.breakevens,
    netPnl: round(m.netPnl),
    fees: round(m.fees),
    winRatePct: pct(m.winRate),
    profitFactor: m.profitFactorIsInfinite ? "no losses" : round(m.profitFactor),
    avgWin: round(m.avgWin),
    avgLoss: round(m.avgLoss),
    expectancy: round(m.expectancy),
    largestWin: round(m.largestWin),
    largestLoss: round(m.largestLoss),
    maxDrawdown: round(m.maxDrawdown),
    tradingDays: m.tradingDays,
    dayWinRatePct: pct(m.dayWinRate),
    maxWinStreak: m.maxWinStreak,
    maxLossStreak: m.maxLossStreak,
    avgHeldMinutes: m.avgDurationMs === null ? null : Math.round(m.avgDurationMs / 60_000),
    avgRealizedR: round(m.avgRealizedR),
    tradesWithStop: m.tradesWithRisk,
  };
}

const counts = (values: string[]) =>
  [...values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, trades]) => ({ name, trades }));

const SORTS = ["openedAt", "closedAt", "netPnl", "realizedR", "heldMinutes"] as const;
type Sort = (typeof SORTS)[number];
const sortValue = (trade: AnnotatedTrade, sort: Sort): number => {
  switch (sort) {
    case "openedAt":
      return Date.parse(trade.openedAt);
    case "closedAt":
      return trade.closedAt ? Date.parse(trade.closedAt) : Infinity;
    case "netPnl":
      return trade.netPnl;
    case "realizedR":
      return tradeR(trade) ?? NaN;
    case "heldMinutes":
      return trade.durationMs ?? NaN;
  }
};

const integer = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;

// ── Candles ──

/** Where to fetch a trade's candles: a chart analysis of its symbol, or its market replay. */
function candleSource(trade: AnnotatedTrade) {
  const key = symbolKey(trade.symbol);
  const analysis = listAnalyses({ limit: 200 }).find((a) => matchKeys(a.symbol).has(key));
  if (analysis)
    return { provider: analysis.provider, symbol: analysis.symbol, dataset: analysis.dataset };
  const replay = db
    .select()
    .from(tradeExcursions)
    .where(eq(tradeExcursions.tradeKey, trade.key))
    .get();
  if (replay) {
    let datasetId: string | null = null;
    try {
      datasetId = (JSON.parse(replay.estimateJson) as { datasetId?: string }).datasetId ?? null;
    } catch {
      datasetId = null;
    }
    return {
      provider: replay.provider,
      symbol: replay.symbol,
      dataset:
        datasetId ??
        (replay.provider === "alpaca" && trade.assetClass === "crypto" ? "crypto" : null),
    };
  }
  return null;
}

/** A candle size that shows the trade in roughly 40 candles. */
export function candleSizeFor(spanMs: number): Resolution {
  const sizes = Object.entries(RESOLUTIONS) as [Resolution, number][];
  return (sizes.find(([, ms]) => spanMs / ms <= 40) ?? sizes[sizes.length - 1]!)[0];
}

export function describeCandles(trade: AnnotatedTrade, bars: MarketBar[], resolution: Resolution) {
  const opened = Date.parse(trade.openedAt);
  const closed = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const step = RESOLUTIONS[resolution];
  const during = bars.filter((b) => b.time + step > opened && b.time <= closed);
  const high = during.length ? Math.max(...during.map((b) => b.high)) : null;
  const low = during.length ? Math.min(...during.map((b) => b.low)) : null;
  const long = trade.direction === "long";
  return {
    resolution,
    candles: bars.map((b) => [
      new Date(b.time).toISOString(),
      b.open,
      b.high,
      b.low,
      b.close,
      b.volume,
    ]),
    candleFormat: "[open time UTC, open, high, low, close, volume]",
    whileOpen:
      high === null || low === null
        ? null
        : {
            high,
            low,
            /** Furthest price went against the entry, and in favour of it. */
            adverse: long ? low : high,
            favourable: long ? high : low,
            adverseDistance: round(long ? trade.avgEntry - low : high - trade.avgEntry, 8),
            favourableDistance: round(long ? high - trade.avgEntry : trade.avgEntry - low, 8),
          },
  };
}

// ── Tools ──

export interface ToolContext {
  scope: AiScope;
  signal?: AbortSignal;
}

export function journalTools({ scope, signal }: ToolContext): ToolSet {
  const data = scopeData(scope);
  const tz = scope.timeZone;
  const narrowed = (filters: unknown) => {
    const extra = readToolFilters(filters);
    return data().trades.filter((t) => matchesFilters(t, extra, tz));
  };
  const inScope = (key: unknown) => {
    if (typeof key !== "string" || !key) throw new RequestError("key is required");
    const trade = data().trades.find((t) => t.key === key);
    if (!trade) throw new RequestError("No trade with this key in the conversation's scope.");
    return trade;
  };
  /** Errors go back to the model as a result it can correct, never as provider text. */
  const safe =
    <I>(run: (input: I) => unknown | Promise<unknown>) =>
    async (input: I) => {
      try {
        return boundResult(await run(input));
      } catch (error) {
        if (error instanceof RequestError) return { error: error.message };
        if (error instanceof Error && error.name === "AbortError") throw error;
        return { error: "The journal could not answer this call." };
      }
    };

  return {
    journal_overview: tool({
      description:
        "Totals for the conversation's scope (or a narrower slice): P&L, win rate, profit factor, drawdown, R. Also lists the accounts, strategies, tags, mistakes and symbols in scope with their ids, which other tools' filters use.",
      inputSchema: jsonSchema<{ filters?: Record<string, string> }>({
        type: "object",
        properties: { filters: filtersSchema },
        additionalProperties: false,
      }),
      execute: safe(({ filters }: { filters?: Record<string, string> }) => {
        const trades = narrowed(filters);
        const all = data();
        const days = trades.map((t) => dayKeyOf(t.closedAt ?? t.openedAt, tz)).sort();
        return {
          scope: scope.context,
          timeZone: tz,
          firstDay: days[0] ?? null,
          lastDay: days.at(-1) ?? null,
          totals: metricsSummary(trades, tz),
          accounts: scope.accounts.map((account) => ({
            id: account.id,
            name: account.name,
            currency: account.currency,
            ...metricsSummary(
              trades.filter((t) => t.accountId === account.id),
              tz,
            ),
          })),
          mixedCurrencies:
            new Set(scope.accounts.map((a) => a.currency)).size > 1
              ? "Accounts use different currencies; totals are unconverted sums."
              : undefined,
          strategies: [
            ...new Set(
              trades.flatMap((t) => (t.annotations?.playbook ? [t.annotations.playbook] : [])),
            ),
          ].map((id) => ({ id, name: all.playbookNames.get(id) ?? id })),
          symbols: counts(trades.map((t) => t.symbol)),
          tags: counts(trades.flatMap((t) => t.annotations?.tags ?? [])),
          mistakes: counts(trades.flatMap((t) => t.annotations?.mistakes ?? [])),
        };
      }),
    }),

    find_trades: tool({
      description: `List trades in scope matching filters, sorted, at most ${MAX_TRADES_LISTED} per call. Each has its key (for get_trade and get_candles), times (ISO, UTC), prices, net P&L, R, tags, mistakes, strategy and rating.`,
      inputSchema: jsonSchema<{
        filters?: Record<string, string>;
        sort?: Sort;
        order?: "asc" | "desc";
        limit?: number;
        offset?: number;
      }>({
        type: "object",
        properties: {
          filters: filtersSchema,
          sort: { type: "string", enum: [...SORTS], description: "Default openedAt." },
          order: { type: "string", enum: ["asc", "desc"], description: "Default desc." },
          limit: { type: "integer", minimum: 1, maximum: MAX_TRADES_LISTED },
          offset: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      }),
      execute: safe(
        (input: {
          filters?: unknown;
          sort?: unknown;
          order?: unknown;
          limit?: unknown;
          offset?: unknown;
        }) => {
          const trades = narrowed(input.filters);
          const sort: Sort = SORTS.includes(input.sort as Sort) ? (input.sort as Sort) : "openedAt";
          const sign = input.order === "asc" ? 1 : -1;
          const limit = integer(input.limit, 20, 1, MAX_TRADES_LISTED);
          const offset = integer(input.offset, 0, 0, Number.MAX_SAFE_INTEGER);
          const sorted = [...trades].sort((a, b) => {
            const x = sortValue(a, sort);
            const y = sortValue(b, sort);
            // Trades without the value (no stop for R, still open) go last either way.
            if (Number.isNaN(x) || Number.isNaN(y))
              return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : -1;
            return (x - y) * sign || a.openedAt.localeCompare(b.openedAt);
          });
          return {
            total: trades.length,
            offset,
            trades: sorted.slice(offset, offset + limit).map((t) => compactTrade(t, data(), tz)),
          };
        },
      ),
    }),

    behaviour_patterns: tool({
      description:
        "Habits in the trades in scope, each measured against the rest: revenge trades (opened soon after a loss), trading on after two losses in a row that day, sizing up after a loss, size creeping up per symbol, and results fading later in the day. `flagged` means enough trades on both sides and a worse result; `cost` is what the habit lost against the usual result.",
      inputSchema: jsonSchema<{ filters?: Record<string, string>; revengeMinutes?: number }>({
        type: "object",
        properties: {
          filters: filtersSchema,
          revengeMinutes: {
            type: "integer",
            minimum: 1,
            maximum: 240,
            description: "Minutes after a loss that count as revenge. Default 15.",
          },
        },
        additionalProperties: false,
      }),
      execute: safe((input: { filters?: unknown; revengeMinutes?: unknown }) => {
        const trades = narrowed(input.filters);
        const report = detectBehaviours(trades, {
          timeZone: tz,
          revengeMinutes: integer(input.revengeMinutes, 15, 1, 240),
        });
        const byKey = new Map(trades.map((t) => [t.key, t]));
        const side = (s: (typeof report.patterns)[number]["baseline"]) => ({
          trades: s.trades,
          netPnl: round(s.netPnl),
          avgPnl: round(s.avgPnl),
          winRatePct: s.winRate === null ? null : round(s.winRate * 100, 1),
        });
        return {
          closedTrades: report.trades,
          patterns: report.patterns.map((p) => ({
            habit: p.title,
            flagged: p.flagged,
            summary: p.summary,
            theseTrades: side(p.flaggedSide),
            theRest: side(p.baseline),
            cost: round(p.cost),
            ...(p.detail?.length ? { bySymbol: p.detail } : {}),
            examples: p.examples
              .slice(0, 3)
              .map((key) => byKey.get(key))
              .filter((t) => t !== undefined)
              .map((t) => compactTrade(t, data(), tz)),
          })),
        };
      }),
    }),

    group_stats: tool({
      description:
        "Closed trades in scope grouped by one dimension (optionally split by a second): trades, net P&L, win rate, profit factor, average R and holding time per group, best group first.",
      inputSchema: jsonSchema<{
        groupBy: Dimension;
        thenBy?: Dimension;
        filters?: Record<string, string>;
        limit?: number;
      }>({
        type: "object",
        properties: {
          groupBy: {
            type: "string",
            enum: DIMENSION_KEYS,
            description: DIMENSION_KEYS.map((key) => `${key}: ${DIMENSIONS[key]}`).join("; "),
          },
          thenBy: { type: "string", enum: DIMENSION_KEYS },
          filters: filtersSchema,
          limit: { type: "integer", minimum: 1, maximum: MAX_GROUPS_LISTED },
        },
        required: ["groupBy"],
        additionalProperties: false,
      }),
      execute: safe(
        (input: { groupBy?: unknown; thenBy?: unknown; filters?: unknown; limit?: unknown }) => {
          if (!DIMENSION_KEYS.includes(input.groupBy as Dimension))
            throw new RequestError(`groupBy must be one of ${DIMENSION_KEYS.join(", ")}`);
          if (input.thenBy !== undefined && !DIMENSION_KEYS.includes(input.thenBy as Dimension))
            throw new RequestError(`thenBy must be one of ${DIMENSION_KEYS.join(", ")}`);
          const primary = input.groupBy as Dimension;
          const secondary = input.thenBy as Dimension | undefined;
          const names = data().playbookNames;
          const label = (dimension: Dimension | undefined, key: string) =>
            dimension === "playbook" ? (names.get(key) ?? key) : key;
          const groups = analyzeGroups(narrowed(input.filters), primary, secondary, tz);
          const limit = integer(input.limit, MAX_GROUPS_LISTED, 1, MAX_GROUPS_LISTED);
          return {
            groupedBy: secondary
              ? `${DIMENSIONS[primary]} then ${DIMENSIONS[secondary]}`
              : DIMENSIONS[primary],
            note: "A trade with several tags or mistakes counts in each of its groups.",
            groupCount: groups.length,
            groups: groups.slice(0, limit).map((g) => ({
              group: label(primary, g.row),
              ...(secondary ? { subgroup: label(secondary, g.column) } : {}),
              trades: g.trades,
              netPnl: round(g.netPnl),
              winRatePct: g.winRate === null ? null : round(g.winRate * 100, 1),
              profitFactor: g.noLosses ? "no losses" : round(g.profitFactor),
              avgRealizedR: round(g.avgRealizedR),
              avgPlannedR: round(g.avgPlannedR),
              avgHeldMinutes:
                g.avgDurationMs === null ? null : Math.round(g.avgDurationMs / 60_000),
            })),
          };
        },
      ),
    }),

    get_trade: tool({
      description:
        "One trade in scope by key: every fill, the trader's notes, stop and target, tags, mistakes, rating and strategy.",
      inputSchema: jsonSchema<{ key: string }>({
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
        additionalProperties: false,
      }),
      execute: safe(({ key }: { key?: unknown }) => {
        const trade = inScope(key);
        const row = data().rows.get(trade.key);
        const fills = trade.executionIds.length
          ? listExecutions(trade.accountId, trade.executionIds).sort((a, b) =>
              a.executedAt.localeCompare(b.executedAt),
            )
          : [];
        const strategy = trade.annotations?.playbook
          ? db.select().from(playbooks).where(eq(playbooks.id, trade.annotations.playbook)).get()
          : undefined;
        let rules: string[] = [];
        try {
          rules = strategy ? (JSON.parse(strategy.rulesJson) as string[]) : [];
        } catch {
          rules = [];
        }
        return {
          ...compactTrade(trade, data(), tz),
          grossPnl: round(trade.grossPnl),
          fills: fills.map((f) => ({
            at: f.executedAt,
            side: f.side,
            quantity: f.quantity,
            price: f.price,
            fee: f.fee,
          })),
          notes: row?.notes?.trim() ? clip(row.notes.trim(), MAX_NOTE_CHARS) : null,
          strategyRules: rules.slice(0, 20),
        };
      }),
    }),

    get_candles: tool({
      description:
        "Market candles around one trade in scope, from a chart the trader saved on its symbol or its market replay, with how far price went for and against the entry while it was open. Fails when no candle source is known for the symbol.",
      inputSchema: jsonSchema<{ key: string; resolution?: Resolution; candlesAround?: number }>({
        type: "object",
        properties: {
          key: { type: "string" },
          resolution: {
            type: "string",
            enum: Object.keys(RESOLUTIONS),
            description: "Candle size; default fits the trade in about 40 candles.",
          },
          candlesAround: {
            type: "integer",
            minimum: 0,
            maximum: 60,
            description: "Candles before the entry and after the exit. Default 20.",
          },
        },
        required: ["key"],
        additionalProperties: false,
      }),
      execute: safe(
        async (input: { key?: unknown; resolution?: unknown; candlesAround?: unknown }) => {
          const trade = inScope(input.key);
          const source = candleSource(trade);
          if (!source)
            throw new RequestError(
              `No candle source for ${trade.symbol}: save a chart of it, or load the trade's market replay once.`,
            );
          const opened = Date.parse(trade.openedAt);
          const closed = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
          const resolution = isResolution(input.resolution)
            ? input.resolution
            : candleSizeFor(Math.max(closed - opened, 60_000));
          const step = RESOLUTIONS[resolution];
          const around = integer(input.candlesAround, 20, 0, 60);
          let from = opened - around * step;
          let to = Math.min(Date.now(), closed + (around + 1) * step);
          if ((to - from) / step > MAX_CANDLES) {
            // Keep the entry and exit in view; trim the middle of a long trade instead.
            from = opened - Math.min(around, 20) * step;
            to = Math.min(Date.now(), from + MAX_CANDLES * step);
          }
          const provider = providerFor(source.provider);
          const history = await provider.history(
            {
              symbol: source.symbol,
              dataset: source.dataset ?? undefined,
              resolution,
              from,
              to,
              signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(CANDLE_TIMEOUT_MS)])
                : AbortSignal.timeout(CANDLE_TIMEOUT_MS),
            },
            connectionKey(provider.id),
          );
          return {
            source: `${source.symbol} from ${provider.name}`,
            ...(history.quoteCurrency ? { quoteCurrency: history.quoteCurrency } : {}),
            entry: { at: trade.openedAt, price: trade.avgEntry },
            exit: trade.closedAt ? { at: trade.closedAt, price: trade.avgExit ?? null } : null,
            ...describeCandles(trade, history.bars.slice(-MAX_CANDLES), resolution),
          };
        },
      ),
    }),

    get_day: tool({
      description:
        "One journal day (YYYY-MM-DD, local): the day's closed trades in scope and their totals; with an unfiltered all-account scope also the trader's day note (Keep/Fix lessons). The day's chart analyses and plans come with their grades and what price did against their levels.",
      inputSchema: jsonSchema<{ date: string; includeCharts?: boolean }>({
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          includeCharts: {
            type: "boolean",
            description: "Include the day's chart analyses and plans. Default true.",
          },
        },
        required: ["date"],
        additionalProperties: false,
      }),
      execute: safe(async (input: { date?: unknown; includeCharts?: unknown }) => {
        const date = input.date;
        if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
          throw new RequestError("date must be YYYY-MM-DD");
        const trades = data().trades.filter((t) => t.closedAt && dayKeyOf(t.closedAt, tz) === date);
        const shared = sharedScope(scope);
        const note = shared
          ? (db.select().from(journalDays).where(eq(journalDays.date, date)).get()?.note ?? "")
          : null;
        // Same rule as recaps: a filtered scope sees only analyses of symbols it traded.
        const charts =
          input.includeCharts === false
            ? []
            : await linkedAnalyses({
                notes: [note],
                day: date,
                symbols: shared ? undefined : [...new Set(trades.map((t) => t.symbol))],
              });
        return {
          date,
          totals: metricsSummary(trades, tz),
          trades: trades.map((t) => compactTrade(t, data(), tz)),
          dayNote: shared
            ? note?.trim()
              ? clip(note.trim(), MAX_NOTE_CHARS)
              : "none written"
            : "Not available: the day note is shared across accounts and this scope is filtered.",
          chartAnalyses: charts.length ? clip(analysesPrompt(charts), 9000) : "none",
        };
      }),
    }),

    recurring_lessons: tool({
      description:
        "The Keep and Fix lessons in the trader's day notes, grouped when they say the same thing, with the days they appeared, how many weeks, and how many weeks in a row up to the last day. Day notes are shared across accounts, so this needs an unfiltered all-account conversation.",
      inputSchema: jsonSchema<{ from?: string; to?: string }>({
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "First day, YYYY-MM-DD. Default: 8 weeks before `to`.",
          },
          to: { type: "string", description: "Last day, YYYY-MM-DD. Default: today." },
        },
        additionalProperties: false,
      }),
      execute: safe((input: { from?: unknown; to?: unknown }) => {
        if (!sharedScope(scope))
          throw new RequestError(
            "Not available: day notes are shared across accounts and this conversation is filtered.",
          );
        const day = (v: unknown) =>
          typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
        const to = day(input.to) ?? dayKeyOf(new Date().toISOString(), tz);
        const from =
          day(input.from) ??
          new Date(Date.parse(`${to}T12:00:00Z`) - 55 * 86_400_000).toISOString().slice(0, 10);
        const lessons = lessonHistory({ from, to });
        return {
          from,
          to,
          lessons: lessons.slice(0, 40).map((l) => ({
            summary: describeLesson(l),
            kind: l.kind,
            days: l.days,
            weeks: l.weeks,
            weeksInARow: l.streak,
            ...(l.variants.length ? { alsoWrittenAs: l.variants.slice(0, 5) } : {}),
          })),
        };
      }),
    }),

    list_chart_analyses: tool({
      description:
        "The trader's saved chart analyses (drawings, zones, plans), newest first, optionally for one symbol or journal day. Use get_chart_analysis for one in full.",
      inputSchema: jsonSchema<{ symbol?: string; day?: string }>({
        type: "object",
        properties: {
          symbol: { type: "string" },
          day: { type: "string", description: "YYYY-MM-DD the analysis is assigned to." },
        },
        additionalProperties: false,
      }),
      execute: safe((input: { symbol?: unknown; day?: unknown }) => {
        const allowed = chartSymbols();
        const wanted =
          typeof input.symbol === "string" && input.symbol.trim() ? symbolKey(input.symbol) : null;
        const day =
          typeof input.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.day)
            ? input.day
            : undefined;
        const analyses = listAnalyses({ day, limit: 200 })
          .filter((a) => {
            const keys = matchKeys(a.symbol);
            return (
              (!allowed || [...keys].some((k) => allowed.has(k))) && (!wanted || keys.has(wanted))
            );
          })
          .slice(0, 30);
        return {
          analyses: analyses.map((a) => ({
            id: a.id,
            title: a.title || null,
            symbol: a.symbol,
            resolution: a.resolution,
            source: a.provider,
            day: a.dayDate,
            drawings: a.drawingCount,
            updatedAt: a.updatedAt,
          })),
        };
      }),
    }),

    get_chart_analysis: tool({
      description:
        "One saved chart analysis by id: its drawings with exact prices, zones, indicators, notes and trade plan.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      }),
      execute: safe(({ id }: { id?: unknown }) => {
        if (typeof id !== "string" || !id) throw new RequestError("id is required");
        const analysis = getAnalysis(id);
        const allowed = chartSymbols();
        if (!analysis || (allowed && ![...matchKeys(analysis.symbol)].some((k) => allowed.has(k))))
          throw new RequestError("No chart analysis with this id in the conversation's scope.");
        const strategy = analysis.plan.playbookId
          ? data().playbookNames.get(analysis.plan.playbookId)
          : null;
        return {
          id: analysis.id,
          analysis: clip(describeAnalysis(analysis), 10_000),
          plan: describePlan(analysis.plan, { playbook: strategy ?? null }) || "none",
        };
      }),
    }),
  };

  /** A filtered scope sees charts of the symbols it traded only; null means any chart. */
  function chartSymbols(): Set<string> | null {
    if (sharedScope(scope)) return null;
    return new Set(data().trades.map((t) => symbolKey(t.symbol)));
  }
}

/** What the UI shows while a tool runs: a short, plain label. */
export function toolLabel(name: string, input: unknown): string {
  const record = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const filtered =
    record.filters && typeof record.filters === "object" && Object.keys(record.filters).length
      ? " (filtered)"
      : "";
  switch (name) {
    case "journal_overview":
      return `Read the journal totals${filtered}`;
    case "find_trades":
      return `Searched trades${filtered}`;
    case "group_stats": {
      const by = DIMENSIONS[record.groupBy as Dimension] ?? "a dimension";
      const then = DIMENSIONS[record.thenBy as Dimension];
      return `Grouped trades by ${by.toLowerCase()}${then ? ` and ${then.toLowerCase()}` : ""}${filtered}`;
    }
    case "behaviour_patterns":
      return `Checked your habits${filtered}`;
    case "get_trade":
      return "Read a trade's fills and notes";
    case "get_candles":
      return "Fetched the candles around a trade";
    case "get_day":
      return `Read the journal day ${typeof record.date === "string" ? record.date : ""}`.trim();
    case "recurring_lessons":
      return "Read your recurring lessons";
    case "list_chart_analyses":
      return "Listed chart analyses";
    case "get_chart_analysis":
      return "Read a chart analysis";
    default:
      return "Looked something up";
  }
}
