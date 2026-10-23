import { crossing, rsi, type CrossDirection } from "@luxalgo/journal-core";
import { RESOLUTIONS, type Resolution } from "@/lib/market-data";

/**
 * Indicator alerts watched by the server (no page needs to be open): for now RSI crossing a
 * level, on a symbol and timeframe of any enabled market data source.
 *
 * - `close`: checked on each finished candle (the RSI of the candle that closed against the
 *   one before), as TradingView's "once per bar close": it never fires and then un-fires.
 * - `live`: checked as the candle forms (the forming candle's RSI against the last close), at
 *   most once per candle, as "once per bar": sooner, but the cross may undo itself by the close.
 */
export const INDICATOR_CONDITIONS = ["crosses-above", "crosses-below", "crosses"] as const;
export type IndicatorCondition = (typeof INDICATOR_CONDITIONS)[number];
export const INDICATOR_TRIGGERS = ["close", "live"] as const;
export type IndicatorTrigger = (typeof INDICATOR_TRIGGERS)[number];

export interface IndicatorAlertRule {
  provider: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
  indicator: "rsi";
  length: number;
  condition: IndicatorCondition;
  level: number;
  trigger: IndicatorTrigger;
  /** Sent as urgent (hard to miss, repeated until acknowledged), whatever the kind's setting. */
  urgent: boolean;
  /** Your note, added to the notification. */
  note: string;
}

export const MAX_INDICATOR_RULES = 50;
const SYMBOL = /^[A-Za-z0-9._:/=^-]{1,40}$/;
const ID = /^[a-z0-9_-]{1,40}$/;

/** A rule from a request, checked by hand, or the reason it can't be saved. */
export function readIndicatorRule(
  value: unknown,
): { rule: IndicatorAlertRule } | { problem: string } {
  const v = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null;
  if (!v) return { problem: "Invalid indicator alert." };
  if (typeof v.provider !== "string" || !ID.test(v.provider))
    return { problem: "Choose a market data source." };
  if (
    v.dataset !== null &&
    v.dataset !== undefined &&
    (typeof v.dataset !== "string" || !ID.test(v.dataset))
  )
    return { problem: "Invalid market." };
  if (typeof v.symbol !== "string" || !SYMBOL.test(v.symbol.trim()))
    return { problem: "Enter a symbol." };
  if (typeof v.resolution !== "string" || !(v.resolution in RESOLUTIONS))
    return { problem: "Choose a timeframe." };
  if (v.indicator !== undefined && v.indicator !== "rsi")
    return { problem: "Only RSI alerts are available." };
  const length = v.length ?? 14;
  if (!Number.isInteger(length) || (length as number) < 2 || (length as number) > 200)
    return { problem: "The RSI length must be a whole number from 2 to 200." };
  if (!INDICATOR_CONDITIONS.includes(v.condition as IndicatorCondition))
    return { problem: "Choose crosses above, crosses below or crosses." };
  if (typeof v.level !== "number" || !Number.isFinite(v.level) || v.level <= 0 || v.level >= 100)
    return { problem: "The RSI level must be between 0 and 100." };
  const trigger = v.trigger ?? "close";
  if (!INDICATOR_TRIGGERS.includes(trigger as IndicatorTrigger))
    return { problem: "Choose on candle close or as it happens." };
  if (v.urgent !== undefined && typeof v.urgent !== "boolean")
    return { problem: "Urgent must be true or false." };
  if (v.note !== undefined && (typeof v.note !== "string" || v.note.length > 300))
    return { problem: "The note is at most 300 characters." };
  return {
    rule: {
      provider: v.provider,
      dataset: (v.dataset as string | null | undefined) || null,
      symbol: v.symbol.trim().toUpperCase(),
      resolution: v.resolution as Resolution,
      indicator: "rsi",
      length: length as number,
      condition: v.condition as IndicatorCondition,
      level: v.level,
      trigger: trigger as IndicatorTrigger,
      urgent: v.urgent === true,
      note: ((v.note as string | undefined) ?? "").trim(),
    },
  };
}

/** Closed and forming candles needed for an RSI that matches the chart to a few hundredths. */
export const barsNeeded = (rule: Pick<IndicatorAlertRule, "length">) =>
  Math.max(300, rule.length * 12);

export interface RuleState {
  /** The candle last evaluated (open time), null before the first check. */
  lastBarTime: number | null;
  /** The candle that last fired. */
  firedBarTime: number | null;
}

export interface RuleEvaluation {
  /** The candle evaluated (closed, or forming for `live`), null without enough data. */
  barTime: number | null;
  value: number | null;
  previous: number | null;
  close: number | null;
  /** The direction it crossed in, when that fires the rule. */
  fired: CrossDirection | null;
}

const matches = (condition: IndicatorCondition, direction: CrossDirection | null) =>
  direction !== null &&
  (condition === "crosses" || (condition === "crosses-above") === (direction === "above"));

/**
 * Evaluate a rule on the candles the source returned (oldest first; the last may be forming).
 * Fires at most once per candle. A `close` rule's first check only records where the RSI is,
 * so switching a rule on never alerts on a cross that happened before.
 */
export function evaluateRule(
  rule: IndicatorAlertRule,
  bars: readonly { time: number; close: number }[],
  state: RuleState,
  now: number,
): RuleEvaluation {
  const step = RESOLUTIONS[rule.resolution];
  const closed = bars.filter((b) => b.time + step <= now);
  const forming = bars.find((b) => b.time + step > now && b.time <= now) ?? null;
  const series = rule.trigger === "live" && forming ? [...closed, forming] : closed;
  const none: RuleEvaluation = {
    barTime: null,
    value: null,
    previous: null,
    close: null,
    fired: null,
  };
  if (series.length < rule.length + 2) return none;
  const values = rsi(
    series.map((b) => b.close),
    rule.length,
  );
  const last = series[series.length - 1]!;
  const value = values[values.length - 1] ?? null;
  const previous = values[values.length - 2] ?? null;
  const result = { barTime: last.time, value, previous, close: last.close, fired: null };
  if (state.firedBarTime === last.time) return result;
  if (rule.trigger === "close" && (state.lastBarTime === null || state.lastBarTime === last.time))
    return result;
  const direction = crossing(previous, value, rule.level);
  return matches(rule.condition, direction) ? { ...result, fired: direction } : result;
}

export const CONDITION_LABELS: Record<IndicatorCondition, string> = {
  "crosses-above": "crosses above",
  "crosses-below": "crosses below",
  crosses: "crosses",
};
