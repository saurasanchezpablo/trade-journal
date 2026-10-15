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
import { parsePositionAction, positionGroup } from "../position-fills";

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
  positionId?: string[];
  executionId?: string[];
  sequence?: string[];
  /** Exact contract, when a legacy format normally uses a root product symbol. */
  contract?: string[];
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
  spec: Pick<FillsFormatSpec, "rowFilter" | "normalizeSymbol"> & { positionActions?: boolean } = {},
): Pick<ParsedImport, "executions" | "skippedRows" | "warnings" | "errors"> => {
  const executions: ImportedExecution[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  const errors: string[] = [];
  const activeRows = records.filter((row) => !spec.rowFilter || spec.rowFilter(row));
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
  const action = (row: Row) =>
    spec.positionActions ? parsePositionAction(pick(row, columns.side)) : undefined;
  const symbolOf = (row: Row) => {
    const raw = pick(row, columns.symbol);
    return raw ? (spec.normalizeSymbol ?? ((s: string) => s.trim().toUpperCase()))(raw) : "";
  };
  const positionSymbols = new Set(activeRows.filter((row) => action(row)).map(symbolOf));
  const optional = (row: Row, aliases: string[]) => ({
    present: aliases.some((key) => key in row),
    value: pick(row, aliases),
  });
  const sourceAccounts = new Set<string>();

  for (const row of records) {
    if (spec.rowFilter && !spec.rowFilter(row)) {
      skippedRows++;
      continue;
    }
    const position = action(row);
    const symbol = symbolOf(row);
    const sideText = pick(row, columns.side);
    const side = position
      ? (position.direction === "long") === (position.effect === "open")
        ? "buy"
        : "sell"
      : parseSide(sideText);
    if (!position && sideText && !side) unknownSides.add(sideText.trim());
    if (!position && positionSymbols.has(symbol))
      errors.push(
        `${symbol}: this file mixes Open/Close position labels with other actions. Export explicit Open/Close Long/Short labels for every fill of this contract.`,
      );
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
      !symbol ||
      !side ||
      !executedAt ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price)
    ) {
      skippedRows++;
      if (position)
        errors.push(
          `${symbol || "Position row"}: an Open/Close fill needs a symbol, positive quantity, price and valid timestamp.`,
        );
      continue;
    }

    const fee = (columns.fees ?? [])
      .map((aliases) => Math.abs(parseMoney(pick(row, aliases), decimal)))
      .filter((value) => Number.isFinite(value))
      .reduce((total, value) => total + value, 0);

    // Earlier imports read some decimal commas as thousands separators.
    const legacyQuantity = legacyParseQuantity(quantityText);
    const legacyPrice = legacyParseMoney(priceText);
    const legacy = {
      ...(Number.isFinite(legacyQuantity) && legacyQuantity > 0 && legacyQuantity !== quantity
        ? { quantity: legacyQuantity }
        : {}),
      ...(Number.isFinite(legacyPrice) && legacyPrice !== price ? { price: legacyPrice } : {}),
    };
    const fill: ImportedExecution = {
      symbol,
      side,
      quantity,
      price,
      fee,
      executedAt,
      ...(legacyExecutedAt && legacyExecutedAt !== executedAt ? { legacyExecutedAt } : {}),
      ...(Object.keys(legacy).length ? { legacy } : {}),
    };
    if (position) {
      const contract = optional(row, columns.contract ?? ["contract", "contractname"]);
      if (contract.present && (!contract.value || contract.value.length > 500))
        errors.push(
          `${symbol}: Contract must be present on every position row and no longer than 500 characters.`,
        );
      if (contract.value) position.contract = contract.value.trim().toUpperCase();
      const positionId = optional(row, columns.positionId ?? ["positionid"]);
      const executionId = optional(row, columns.executionId ?? ["executionid", "fillid"]);
      const sequence = optional(
        row,
        columns.sequence ?? ["sequence", "executionsequence", "fillsequence"],
      );
      for (const [label, field] of [
        ["Position ID", positionId],
        ["Execution ID", executionId],
      ] as const)
        if (field.present && (!field.value || field.value.length > 500))
          errors.push(
            `${symbol}: ${label} must be present on every position row and no longer than 500 characters.`,
          );
      if (positionId.value) position.positionId = positionId.value;
      if (executionId.value) position.executionId = executionId.value;
      if (sequence.present) {
        const value = Number(sequence.value);
        if (!sequence.value || !/^\d+$/.test(sequence.value) || !Number.isSafeInteger(value))
          errors.push(
            `${symbol}: Sequence must be a non-negative whole number on every position row.`,
          );
        else position.sequence = value;
      }
      const feeValues = (columns.fees ?? []).map((aliases) => pick(row, aliases));
      if (
        feeValues.some(
          (value) => value !== undefined && !Number.isFinite(parseMoney(value, decimal)),
        )
      )
        errors.push(`${symbol}: invalid fee on an Open/Close fill.`);
      if (!Number.isFinite(fee)) errors.push(`${symbol}: total fees are too large.`);
      fill.importMetadata = {
        id: position.executionId ? `execution:${position.executionId}` : position.effect,
        group: positionGroup(position),
        order: position.sequence ?? 0,
        position,
        preserveFee: feeValues.some((value) => value !== undefined),
      };
      const source = pick(row, ["account", "accountid", "accountname", "clientaccountid"]);
      if (source) sourceAccounts.add(source);
    }
    executions.push(fill);
  }
  if (sourceAccounts.size > 1)
    errors.push(
      "These position rows contain multiple source accounts. Export and import one account at a time.",
    );
  if (unknownSides.size)
    warnings.push(
      `Rows with an unrecognized side (${[...unknownSides]
        .slice(0, 5)
        .map((side) => `"${side}"`)
        .join(", ")}) were skipped; a fill's side is never guessed.`,
    );
  if (positionSymbols.size)
    warnings.push(
      "Open/Close position labels keep long and short positions separate. Closes are checked against the selected account when saving. For futures, configure the multiplier for each imported symbol in Settings.",
    );
  return {
    executions: withFileOrder(executions),
    skippedRows,
    warnings,
    ...(errors.length ? { errors: [...new Set(errors)] } : {}),
  };
};

/** Build an ImportFormat from a declarative column spec — the path for most broker CSVs. */
export const makeFillsFormat = (spec: FillsFormatSpec): ImportFormat => ({
  id: spec.id,
  label: spec.label,
  detect: (headers) => hasHeaders(headers, spec.required),
  parse: (content, options): ParsedImport => {
    const records = toRecords(parseCsv(content));
    return {
      format: spec.id,
      ...rowsToFills(records, spec.columns, options, { ...spec, positionActions: true }),
    };
  },
});
