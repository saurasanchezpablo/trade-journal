import type { AnnotatedTrade } from "./types";
import { dayKeyOf } from "./time";

/**
 * Behaviour patterns in a trader's own history, each measured against a baseline so the
 * numbers say whether the habit costs money:
 *
 * - **Revenge trades**: opened soon after a losing trade closed (same account).
 * - **Trading on after losses**: trades taken after two losses in a row on the same day.
 * - **Size creep**: position size rising, per symbol, and sizing up right after a loss.
 * - **Late fade**: results of a day's later trades against its first ones.
 *
 * A pattern is `flagged` only with enough trades on both sides and a worse result than the
 * baseline; the rest are still returned, so a report can say a habit is not a problem.
 */

export interface BehaviourOptions {
  timeZone?: string;
  /** Minutes after a loss within which a new trade counts as a revenge trade. */
  revengeMinutes?: number;
  /** Losses in a row, on one day, after which trades count as trading on. */
  lossStreak?: number;
  /** A day's trades from this one on are its later trades. */
  lateFrom?: number;
  /** Fewest trades on each side before a pattern can be flagged. */
  minSample?: number;
}

export interface SideStats {
  trades: number;
  netPnl: number;
  /** Mean net P&L per trade. */
  avgPnl: number | null;
  winRate: number | null;
}

export type BehaviourKind =
  "revenge" | "after-losses" | "size-creep" | "size-after-loss" | "late-fade";

export interface BehaviourPattern {
  kind: BehaviourKind;
  title: string;
  /** One line in plain words, with the numbers. */
  summary: string;
  flagged: boolean;
  /** The trades showing the habit, against the rest. */
  flaggedSide: SideStats;
  baseline: SideStats;
  /** Net P&L lost against the baseline's average: (baseline avg - flagged avg) x flagged trades. */
  cost: number | null;
  /** Keys of the most recent examples, newest first. */
  examples: string[];
  /** Per symbol, for size creep: recent average size over the earlier average. */
  detail?: { symbol: string; earlier: number; recent: number; ratio: number }[];
}

export interface BehaviourReport {
  trades: number;
  patterns: BehaviourPattern[];
}

const closedOnly = (trades: AnnotatedTrade[]) =>
  trades
    .filter((t) => t.status !== "open" && t.closedAt)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.key.localeCompare(b.key));

export function sideStats(trades: AnnotatedTrade[]): SideStats {
  const net = trades.reduce((s, t) => s + t.netPnl, 0);
  const decided = trades.filter((t) => t.status !== "open");
  return {
    trades: trades.length,
    netPnl: net,
    avgPnl: trades.length ? net / trades.length : null,
    winRate: decided.length
      ? decided.filter((t) => t.status === "win").length / decided.length
      : null,
  };
}

const money = (n: number | null) =>
  n === null ? "n/a" : `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(2)}`;
const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

function pattern(
  kind: BehaviourKind,
  title: string,
  flagged: AnnotatedTrade[],
  rest: AnnotatedTrade[],
  describe: (f: SideStats, b: SideStats) => string,
  minSample: number,
): BehaviourPattern {
  const f = sideStats(flagged);
  const b = sideStats(rest);
  const worse = f.avgPnl !== null && b.avgPnl !== null && f.avgPnl < b.avgPnl;
  return {
    kind,
    title,
    summary: describe(f, b),
    flagged: f.trades >= minSample && b.trades >= minSample && worse,
    flaggedSide: f,
    baseline: b,
    cost: f.avgPnl !== null && b.avgPnl !== null ? (b.avgPnl - f.avgPnl) * f.trades : null,
    examples: flagged
      .slice()
      .sort((x, y) => y.openedAt.localeCompare(x.openedAt))
      .slice(0, 5)
      .map((t) => t.key),
  };
}

const compare = (label: string, rest: string) => (f: SideStats, b: SideStats) =>
  f.trades
    ? `${f.trades} ${label}: ${pct(f.winRate)} won, ${money(f.avgPnl)} a trade, against ${pct(b.winRate)} and ${money(b.avgPnl)} for ${rest}.`
    : `No ${label} found.`;

/** Revenge trades: opened within `minutes` of a losing trade's close on the same account. */
export function revengeTrades(trades: AnnotatedTrade[], minutes = 15): Set<string> {
  const flagged = new Set<string>();
  const byAccount = new Map<string, AnnotatedTrade[]>();
  for (const t of closedOnly(trades))
    byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t]);
  for (const list of byAccount.values()) {
    const losses = list
      .filter((t) => t.status === "loss")
      .map((t) => ({ key: t.key, closed: Date.parse(t.closedAt!) }))
      .sort((a, b) => a.closed - b.closed);
    for (const t of list) {
      const opened = Date.parse(t.openedAt);
      // The last loss closed at or before this trade opened (binary search).
      let lo = 0;
      let hi = losses.length - 1;
      let at = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (losses[mid]!.closed <= opened) {
          at = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      for (let i = at; i >= 0 && opened - losses[i]!.closed <= minutes * 60_000; i -= 1)
        if (losses[i]!.key !== t.key) {
          flagged.add(t.key);
          break;
        }
    }
  }
  return flagged;
}

/** Trades taken on a day after `streak` losses in a row that day (same account). */
export function afterLossStreak(
  trades: AnnotatedTrade[],
  streak = 2,
  timeZone = "UTC",
): Set<string> {
  const flagged = new Set<string>();
  const days = new Map<string, AnnotatedTrade[]>();
  for (const t of closedOnly(trades)) {
    const key = `${t.accountId}|${dayKeyOf(t.openedAt, timeZone)}`;
    days.set(key, [...(days.get(key) ?? []), t]);
  }
  for (const list of days.values()) {
    for (const t of list) {
      const opened = Date.parse(t.openedAt);
      // The losses in a row among trades closed before this one opened.
      const before = list
        .filter((x) => x.key !== t.key && Date.parse(x.closedAt!) <= opened)
        .sort((a, b) => a.closedAt!.localeCompare(b.closedAt!));
      let run = 0;
      for (let i = before.length - 1; i >= 0 && before[i]!.status === "loss"; i -= 1) run += 1;
      if (run >= streak) flagged.add(t.key);
    }
  }
  return flagged;
}

/** Each trade's position in its day (1 for the day's first trade), per account. */
export function dayOrder(trades: AnnotatedTrade[], timeZone = "UTC"): Map<string, number> {
  const order = new Map<string, number>();
  const count = new Map<string, number>();
  for (const t of closedOnly(trades)) {
    const key = `${t.accountId}|${dayKeyOf(t.openedAt, timeZone)}`;
    const n = (count.get(key) ?? 0) + 1;
    count.set(key, n);
    order.set(t.key, n);
  }
  return order;
}

export function detectBehaviours(
  trades: AnnotatedTrade[],
  options: BehaviourOptions = {},
): BehaviourReport {
  const tz = options.timeZone ?? "UTC";
  const minutes = options.revengeMinutes ?? 15;
  const streak = options.lossStreak ?? 2;
  const lateFrom = options.lateFrom ?? 4;
  const min = options.minSample ?? 5;
  const closed = closedOnly(trades);
  const split = (keys: Set<string>) =>
    [closed.filter((t) => keys.has(t.key)), closed.filter((t) => !keys.has(t.key))] as const;

  const patterns: BehaviourPattern[] = [];

  const [revenge, calm] = split(revengeTrades(closed, minutes));
  patterns.push(
    pattern(
      "revenge",
      "Revenge trades",
      revenge,
      calm,
      compare(`trades opened within ${minutes} minutes of a loss`, "the rest"),
      min,
    ),
  );

  const [tilted, fresh] = split(afterLossStreak(closed, streak, tz));
  patterns.push(
    pattern(
      "after-losses",
      "Trading on after losses",
      tilted,
      fresh,
      compare(`trades after ${streak} losses in a row that day`, "the rest"),
      min,
    ),
  );

  // Sizing up right after a loss, on the same symbol and account.
  const previous = new Map<string, AnnotatedTrade>();
  const upAfterLoss: AnnotatedTrade[] = [];
  const otherNext: AnnotatedTrade[] = [];
  for (const t of closed) {
    const key = `${t.accountId}|${t.symbol}`;
    const last = previous.get(key);
    if (last)
      (last.status === "loss" && t.quantity > last.quantity ? upAfterLoss : otherNext).push(t);
    previous.set(key, t);
  }
  patterns.push(
    pattern(
      "size-after-loss",
      "Sizing up after a loss",
      upAfterLoss,
      otherNext,
      compare("trades sized up right after a loss on the same symbol", "the other trades"),
      min,
    ),
  );

  // Size creep: per symbol with enough trades, the latest third's size against the rest.
  const bySymbol = new Map<string, AnnotatedTrade[]>();
  for (const t of closed) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
  const detail: NonNullable<BehaviourPattern["detail"]> = [];
  const recentAll: AnnotatedTrade[] = [];
  const earlierAll: AnnotatedTrade[] = [];
  for (const [symbol, list] of bySymbol) {
    if (list.length < 3 * min) continue;
    const cut = Math.floor((list.length * 2) / 3);
    const earlier = list.slice(0, cut);
    const recent = list.slice(cut);
    const mean = (xs: AnnotatedTrade[]) => xs.reduce((s, t) => s + t.quantity, 0) / xs.length;
    const ratio = mean(recent) / mean(earlier);
    if (ratio >= 1.25) {
      detail.push({ symbol, earlier: mean(earlier), recent: mean(recent), ratio });
      recentAll.push(...recent);
      earlierAll.push(...earlier);
    }
  }
  const creep = pattern(
    "size-creep",
    "Size creeping up",
    recentAll,
    earlierAll,
    (f, b) =>
      detail.length
        ? `Recent size is up on ${detail
            .map((d) => `${d.symbol} (${d.earlier.toPrecision(3)} to ${d.recent.toPrecision(3)})`)
            .join(
              ", ",
            )}; those recent trades make ${money(f.avgPnl)} a trade, against ${money(b.avgPnl)} before.`
        : "Position sizes are steady on every symbol with enough trades.",
    min,
  );
  creep.detail = detail.sort((a, b) => b.ratio - a.ratio);
  // Bigger size is only a problem when it comes with worse results.
  creep.flagged = creep.flagged && detail.length > 0;
  patterns.push(creep);

  const order = dayOrder(closed, tz);
  const [late, early] = [
    closed.filter((t) => (order.get(t.key) ?? 1) >= lateFrom),
    closed.filter((t) => (order.get(t.key) ?? 1) < lateFrom),
  ];
  patterns.push(
    pattern(
      "late-fade",
      "Results fading later in the day",
      late,
      early,
      compare(`trades from the ${ordinal(lateFrom)} of a day on`, `the first ${lateFrom - 1}`),
      min,
    ),
  );

  return { trades: closed.length, patterns };
}

function ordinal(n: number) {
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}
