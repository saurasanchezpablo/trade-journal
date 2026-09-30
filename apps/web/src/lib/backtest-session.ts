import {
  DEFAULT_BACKTEST_CONFIG,
  newBacktest,
  type BacktestConfig,
  type BacktestState,
} from "@luxalgo/journal-core";
import type { Resolution } from "./market-data";

/**
 * A replay backtest session as it is saved: where it replays (source, symbol, candle size),
 * how far it got, its account settings, and the engine's state (the open position, pending
 * orders and every closed trade). The same checks run on the server before a save and in the
 * browser when a session loads.
 */

export interface SessionSettings extends BacktestConfig {
  /** How an order's size is worked out from its stop: a share of the balance, or an amount. */
  riskMode: "percent" | "amount";
  /** 1 = 1% of the balance, or 1 unit of money. */
  riskValue: number;
  /** Size rounded down to this lot (0.001 for a coin, 1 for shares); 0 leaves it exact. */
  lotStep: number;
  /** The account's currency, for amounts (ISO 4217). */
  currency: string;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  ...DEFAULT_BACKTEST_CONFIG,
  riskMode: "percent",
  riskValue: 1,
  lotStep: 0,
  currency: "USD",
};

export interface BacktestSession {
  id: string;
  name: string;
  provider: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
  /** Where the replay started, and the open time of the last revealed candle. */
  startAt: number;
  cursorAt: number;
  settings: SessionSettings;
  state: BacktestState;
  /** Vela's drawings document, as the chart saved it. */
  drawings: unknown;
  notes: string;
  playbookId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BacktestSessionSummary {
  id: string;
  name: string;
  provider: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
  startAt: number;
  cursorAt: number;
  updatedAt: string;
  initialBalance: number;
  currency: string;
  trades: number;
  netProfit: number;
  winRate: number | null;
  open: boolean;
}

export const MAX_BACKTEST_TRADES = 5_000;
export const MAX_BACKTEST_ORDERS = 50;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const time = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const level = (v: unknown) => v === null || (finite(v) && v > 0);
const side = (v: unknown) => v === "long" || v === "short";
const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v);

/** Why settings cannot be saved, or null. */
export function settingsProblem(value: unknown): string | null {
  if (!isObject(value)) return "Invalid backtest settings.";
  const s = value as Partial<SessionSettings>;
  if (!finite(s.initialBalance) || s.initialBalance <= 0 || s.initialBalance > 1e12)
    return "The starting balance must be above zero.";
  for (const [key, label] of [
    ["commissionPerFill", "The commission per fill"],
    ["commissionRate", "The commission rate"],
    ["slippage", "The slippage"],
    ["lotStep", "The lot size"],
  ] as const)
    if (!finite(s[key]) || (s[key] as number) < 0) return `${label} cannot be negative.`;
  if ((s.commissionRate as number) >= 0.1) return "The commission rate must be under 10%.";
  if (!finite(s.multiplier) || s.multiplier <= 0)
    return "The contract multiplier must be above zero.";
  if (s.sameCandle !== "stop-first" && s.sameCandle !== "target-first")
    return "Choose which level counts when a candle reaches both.";
  if (s.riskMode !== "percent" && s.riskMode !== "amount") return "Choose how orders are sized.";
  if (!finite(s.riskValue) || s.riskValue <= 0) return "The risk per trade must be above zero.";
  if (s.riskMode === "percent" && s.riskValue > 100)
    return "The risk per trade must be 100% or less.";
  if (typeof s.currency !== "string" || !/^[A-Z]{3}$/.test(s.currency))
    return "Choose the account currency as a three-letter code, such as USD.";
  return null;
}

/** Saved settings, with defaults for anything missing or unreadable. */
export function readSettings(value: unknown): SessionSettings {
  const merged = { ...DEFAULT_SESSION_SETTINGS, ...(isObject(value) ? value : {}) };
  return settingsProblem(merged) === null ? (merged as SessionSettings) : DEFAULT_SESSION_SETTINGS;
}

function orderProblem(o: unknown): string | null {
  if (!isObject(o)) return "an order is unreadable";
  if (!id(o.id) || !side(o.side) || (o.type !== "limit" && o.type !== "stop"))
    return "an order is unreadable";
  if (!finite(o.qty) || o.qty <= 0 || !finite(o.price) || o.price <= 0)
    return "an order has no size or price";
  if (!level(o.stop) || !level(o.target) || !time(o.placedAt))
    return "an order's levels are unreadable";
  return null;
}

function positionProblem(p: unknown): string | null {
  if (p === null) return null;
  if (!isObject(p) || !id(p.id) || !side(p.side)) return "the position is unreadable";
  if (![p.qty, p.entryPrice].every((v) => finite(v) && (v as number) > 0))
    return "the position has no size or price";
  if (!time(p.entryTime) || !level(p.stop) || !level(p.target))
    return "the position's levels are unreadable";
  if (!(p.risk === null || finite(p.risk)) || ![p.entryFees, p.mae, p.mfe].every(finite))
    return "the position's amounts are unreadable";
  if (!Number.isSafeInteger(p.bars) || typeof p.ambiguous !== "boolean")
    return "the position is unreadable";
  return null;
}

function tradeProblem(t: unknown): string | null {
  if (!isObject(t) || !id(t.id) || !side(t.side)) return "a trade is unreadable";
  if (![t.qty, t.entryPrice, t.exitPrice].every((v) => finite(v) && (v as number) > 0))
    return "a trade has no size or price";
  if (!time(t.entryTime) || !time(t.exitTime) || (t.exitTime as number) < (t.entryTime as number))
    return "a trade's times are unreadable";
  if (!["stop", "target", "manual", "end"].includes(t.exitReason as string))
    return "a trade's exit is unreadable";
  if (!level(t.stop) || !level(t.target)) return "a trade's levels are unreadable";
  if (![t.grossPnl, t.fees, t.netPnl, t.mae, t.mfe].every(finite) || !(t.r === null || finite(t.r)))
    return "a trade's amounts are unreadable";
  if (!Number.isSafeInteger(t.bars) || typeof t.ambiguous !== "boolean")
    return "a trade is unreadable";
  if (typeof t.note !== "string" || t.note.length > 10_000) return "a trade note is too long";
  return null;
}

/** Why an engine state cannot be saved, or null. */
export function stateProblem(value: unknown): string | null {
  if (!isObject(value)) return "Invalid backtest state.";
  const s = value;
  if (!finite(s.balance) || !Number.isSafeInteger(s.sequence) || (s.sequence as number) < 0)
    return "Invalid backtest state.";
  if (!Array.isArray(s.orders) || s.orders.length > MAX_BACKTEST_ORDERS)
    return `Keep at most ${MAX_BACKTEST_ORDERS} pending orders.`;
  if (!Array.isArray(s.trades) || s.trades.length > MAX_BACKTEST_TRADES)
    return `A session holds at most ${MAX_BACKTEST_TRADES.toLocaleString("en-US")} trades.`;
  const problem =
    positionProblem(s.position ?? null) ??
    s.orders.map(orderProblem).find(Boolean) ??
    s.trades.map(tradeProblem).find(Boolean);
  return problem ? `Invalid backtest state: ${problem}.` : null;
}

/** A saved state, or a fresh one when it is unreadable. */
export function readState(value: unknown, initialBalance: number): BacktestState {
  return stateProblem(value) === null ? (value as BacktestState) : newBacktest({ initialBalance });
}
