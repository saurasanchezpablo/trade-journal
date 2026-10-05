import { parseDecimalInput } from "./number-input";

/**
 * The trade page's fill editor: rows as typed (text fields), turned into the corrected
 * fill list `PUT /api/trades/[key]/fills` takes. Times are typed in the journal's timezone,
 * to the second; a time left as it was goes back exactly as stored.
 */
export interface FillRow {
  /** The fill's id; absent for a fill being added. */
  id?: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fee: string;
  /** `YYYY-MM-DDTHH:mm:ss` in the journal's timezone. */
  time: string;
  /** The stored time, sent back untouched when `time` still shows it. */
  original?: { time: string; executedAt: string };
}

export interface StoredFill {
  id: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

const parts = (time: number, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(time))
      .map((part) => [part.type, part.value]),
  );

/** An instant as the journal-timezone wall time a `datetime-local` field shows, to the second. */
export function fillTimeInput(iso: string, timeZone: string): string {
  const p = parts(Date.parse(iso), timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** The instant a typed wall time (seconds optional) names in a timezone, or null. */
export function fillTimeFromInput(text: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map((v) => Number(v ?? 0)) as number[];
  const wall = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!);
  let time = wall;
  // Twice: the offset at the guess, then at the corrected time (a DST change in between).
  for (let i = 0; i < 2; i++) {
    const p = parts(time, timeZone);
    const shown = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
    time -= shown - wall;
  }
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function rowOf(fill: StoredFill, timeZone: string): FillRow {
  const time = fillTimeInput(fill.executedAt, timeZone);
  return {
    id: fill.id,
    side: fill.side,
    quantity: String(fill.quantity),
    price: String(fill.price),
    fee: String(fill.fee),
    time,
    original: { time, executedAt: fill.executedAt },
  };
}

/** A new fill for the editor: the trade's last time, the opposite side of its first fill. */
export function newRow(rows: readonly FillRow[]): FillRow {
  const last = rows.at(-1);
  return {
    side: rows[0]?.side === "buy" ? "sell" : "buy",
    quantity: "",
    price: "",
    fee: "0",
    time: last?.time ?? "",
  };
}

export type FillRequest =
  | {
      fills: {
        id?: string;
        symbol: string;
        side: "buy" | "sell";
        quantity: number;
        price: number;
        fee: number;
        executedAt: string;
      }[];
    }
  | { error: string };

/**
 * The corrected list to send, or what to fix first (naming the row). The symbol goes back as
 * stored unless it was changed; a changed one is upper-cased, as typed trades are.
 */
export function fillRequest(
  rows: readonly FillRow[],
  symbol: string,
  storedSymbol: string,
  timeZone: string,
): FillRequest {
  const typed = symbol.trim();
  const name = typed === storedSymbol ? storedSymbol : typed.toUpperCase();
  if (!name) return { error: "Enter the symbol." };
  if (!rows.length)
    return { error: "A trade needs at least one fill. To remove it, delete the trade." };
  const fills: Extract<FillRequest, { fills: unknown }>["fills"] = [];
  for (const [i, row] of rows.entries()) {
    const label = `Fill ${i + 1}`;
    const quantity = parseDecimalInput(row.quantity);
    const price = parseDecimalInput(row.price);
    const fee = parseDecimalInput(row.fee);
    if (quantity == null || !(quantity > 0))
      return { error: `${label}: enter a quantity above 0.` };
    if (price == null) return { error: `${label}: enter the price.` };
    if (fee === undefined) return { error: `${label}: the fee must be a number.` };
    const executedAt =
      row.original && row.time === row.original.time
        ? row.original.executedAt
        : fillTimeFromInput(row.time, timeZone);
    if (!executedAt) return { error: `${label}: enter the date and time.` };
    fills.push({
      ...(row.id ? { id: row.id } : {}),
      symbol: name,
      side: row.side,
      quantity,
      price,
      fee: fee ?? 0,
      executedAt,
    });
  }
  return { fills };
}
