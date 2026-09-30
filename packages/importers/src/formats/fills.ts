import { hasHeaders, parseCsv, pick, toRecords, type Row } from "../csv";
import { legacyParseTimestamp, parseTimestamp, parseDateAndTime } from "../dates";
import {
  decimalSeparatorOf,
  isAmbiguousNumber,
  legacyParseMoney,
  legacyParseQuantity,
  parseMoney,
  parseQuantity,
} from "../numbers";
import type { ImportFormat, ImportOptions, ImportedExecution, ParsedImport } from "../types";

export interface FillsColumnMap {
  symbol: string[];
  side: string[];
  quantity: string[];
  price: string[];
  /** Each alias group is summed (commission + fees, etc.). */
  fees?: string[][];
  timestamp?: string[];
  date?: string[];
  time?: string[];
}

export interface FillsFormatSpec {
  id: string;
  label: string;
  /** Header alias groups that must ALL be present for detection. */
  required: string[][];
  columns: FillsColumnMap;
  /** Skip rows that aren't fills (unfilled orders, section noise). */
  rowFilter?: (row: Row) => boolean;
  normalizeSymbol?: (symbol: string) => string;
}

export const parseSide = (value: string | undefined): "buy" | "sell" | null => {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  // "bid"/"ask" per TopstepX fills exports: bid = buy interest, ask = sell.
  // DAS and other day-trading platforms mark short sales "SS" and covers "BC".
  if (
    /^(buy|bot|bought|long|b|bid|btc|bc|cover|buytoopen|buytoclose|buytocover|buy to open|buy to close|buy to cover)$/.test(
      text,
    ) ||
    /^buy/.test(text)
  )
    return "buy";
  if (
    /^(sell|sld|sold|short|s|ss|ask|stc|shortsell|short sell|selltoopen|selltoclose|sell to open|sell to close)$/.test(
      text,
    ) ||
    /^sell/.test(text)
  )
    return "sell";
  return null;
};

/**
 * Order fills that share an instant by the file's row order, when the file
 * lists fills chronologically: oldest first, or newest first (then the order
 * is reversed). A file whose rows go both ways proves no order, and its tied
 * fills stay unordered. The order is a reconstruction fact outside the dedup
 * hash, so fills imported before it existed still deduplicate.
 */
export const withFileOrder = (executions: ImportedExecution[]): ImportedExecution[] => {
  const previous = new Map<string, number>();
  let forward = 0;
  let backward = 0;
  for (const execution of executions) {
    const at = Date.parse(execution.executedAt);
    const before = previous.get(execution.symbol);
    if (before !== undefined) {
      if (at > before) forward++;
      else if (at < before) backward++;
    }
    previous.set(execution.symbol, at);
  }
  if (forward && backward) return executions;
  const last = executions.length - 1;
  return executions.map((execution, index) => ({
    ...execution,
    reconstruction: { ...execution.reconstruction, order: backward ? last - index : index },
  }));
};

export const rowsToFills = (
  records: Row[],
  columns: FillsColumnMap,
  options: ImportOptions,
  spec: Pick<FillsFormatSpec, "rowFilter" | "normalizeSymbol"> = {},
): { executions: ImportedExecution[]; skippedRows: number; warnings: string[] } => {
  const executions: ImportedExecution[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  // The file's own values decide how an ambiguous "1,500" reads.
  const numericCells = records.flatMap((row) => [
    pick(row, columns.quantity),
    pick(row, columns.price),
    ...(columns.fees ?? []).map((aliases) => pick(row, aliases)),
  ]);
  const decimal = decimalSeparatorOf(numericCells);
  const ambiguous = decimal ? undefined : numericCells.find(isAmbiguousNumber);
  if (ambiguous)
    warnings.push(
      `Values such as "${ambiguous}" can mean a thousands separator or a decimal comma, and nothing else in the file tells which; they were read with a thousands separator. Check the quantities and prices in the preview.`,
    );

  const unknownSides = new Set<string>();

  for (const row of records) {
    if (spec.rowFilter && !spec.rowFilter(row)) {
      skippedRows++;
      continue;
    }
    const symbolRaw = pick(row, columns.symbol);
    const sideText = pick(row, columns.side);
    const side = parseSide(sideText);
    if (sideText && !side) unknownSides.add(sideText.trim());
    const quantityText = pick(row, columns.quantity);
    const priceText = pick(row, columns.price);
    const quantity = parseQuantity(quantityText, decimal);
    const price = parseMoney(priceText, decimal);
    // Try the single timestamp column first; fall back to separate date+time
    // columns (some exports put only a wall-clock time in their "time" field).
    let executedAt = columns.timestamp
      ? parseTimestamp(pick(row, columns.timestamp), options.timeZone)
      : null;
    if (!executedAt && (columns.date || columns.time)) {
      executedAt = parseDateAndTime(
        pick(row, columns.date ?? []),
        pick(row, columns.time ?? []),
        options.timeZone,
      );
    }

    // How the earlier timestamp parser read the same cells.
    const legacyExecutedAt =
      (columns.timestamp
        ? legacyParseTimestamp(pick(row, columns.timestamp), options.timeZone)
        : null) ??
      (columns.date || columns.time
        ? legacyParseTimestamp(
            [pick(row, columns.date ?? []), pick(row, columns.time ?? [])]
              .filter(Boolean)
              .join(" "),
            options.timeZone,
          )
        : null);

    if (
      !symbolRaw ||
      !side ||
      !executedAt ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price)
    ) {
      skippedRows++;
      continue;
    }

    const fee = (columns.fees ?? [])
      .map((aliases) => Math.abs(parseMoney(pick(row, aliases), decimal)))
      .filter((value) => Number.isFinite(value))
      .reduce((total, value) => total + value, 0);

    const symbol = (spec.normalizeSymbol ?? ((s: string) => s.trim().toUpperCase()))(symbolRaw);
    // Earlier imports read some decimal commas as thousands separators.
    const legacyQuantity = legacyParseQuantity(quantityText);
    const legacyPrice = legacyParseMoney(priceText);
    const legacy = {
      ...(Number.isFinite(legacyQuantity) && legacyQuantity > 0 && legacyQuantity !== quantity
        ? { quantity: legacyQuantity }
        : {}),
      ...(Number.isFinite(legacyPrice) && legacyPrice !== price ? { price: legacyPrice } : {}),
    };
    executions.push({
      symbol,
      side,
      quantity,
      price,
      fee,
      executedAt,
      ...(legacyExecutedAt && legacyExecutedAt !== executedAt ? { legacyExecutedAt } : {}),
      ...(Object.keys(legacy).length ? { legacy } : {}),
    });
  }
  if (unknownSides.size)
    warnings.push(
      `Rows with an unrecognized side (${[...unknownSides]
        .slice(0, 5)
        .map((side) => `"${side}"`)
        .join(", ")}) were skipped; a fill's side is never guessed.`,
    );
  return { executions: withFileOrder(executions), skippedRows, warnings };
};

/** Build an ImportFormat from a declarative column spec — the path for most broker CSVs. */
export const makeFillsFormat = (spec: FillsFormatSpec): ImportFormat => ({
  id: spec.id,
  label: spec.label,
  detect: (headers) => hasHeaders(headers, spec.required),
  parse: (content, options): ParsedImport => {
    const records = toRecords(parseCsv(content));
    const { executions, skippedRows, warnings } = rowsToFills(records, spec.columns, options, spec);
    return { format: spec.id, executions, skippedRows, warnings };
  },
});
