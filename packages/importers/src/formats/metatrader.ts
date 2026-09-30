import { parseTimestamp } from "../dates";
import { parseHistory } from "./history";
import { parseMoney, parseQuantity } from "../numbers";
import {
  tradeToExecutions,
  type ImportFormat,
  type ImportOptions,
  type ImportedTrade,
  type ParsedImport,
} from "../types";

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();

const rowCells = (rowHtml: string): string[] =>
  [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]!));

/**
 * The earlier positional reading of MT4 closed-transaction rows. It stays the
 * fill identity (symbol, side, size, prices, times) of these statements, so a
 * statement imported before still deduplicates against the rows it saved, and
 * the fallback for rows whose header the history adapter does not recognize.
 */
const parsePositional = (
  content: string,
  options: ImportOptions,
): ParsedImport & { swapCreditDropped: boolean } => {
  const rows = [...content.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => rowCells(m[1]!));
  const executions: ParsedImport["executions"] = [];
  let skippedRows = 0;
  let swapCreditDropped = false;

  for (const cells of rows) {
    // MT4 closed-transaction shape: Ticket, Open Time, Type, Size, Item, Price, S/L, T/P, Close Time, Price, Commission, Taxes, Swap, Profit
    if (cells.length < 10) continue;
    const type = (cells[2] ?? "").toLowerCase();
    if (type !== "buy" && type !== "sell") continue;

    const openedAt = parseTimestamp(cells[1], options.timeZone);
    const quantity = parseQuantity(cells[3]);
    const symbol = (cells[4] ?? "").trim().toUpperCase();
    const entryPrice = parseMoney(cells[5]);

    // Find the close-time cell: first parseable timestamp after the entry price.
    let closeIndex = -1;
    for (let i = 6; i < cells.length; i++) {
      if (parseTimestamp(cells[i], options.timeZone)) {
        closeIndex = i;
        break;
      }
    }
    if (
      !openedAt ||
      closeIndex === -1 ||
      !symbol ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(entryPrice)
    ) {
      skippedRows++;
      continue;
    }
    const closedAt = parseTimestamp(cells[closeIndex], options.timeZone)!;
    const exitPrice = parseMoney(cells[closeIndex + 1]);
    if (!Number.isFinite(exitPrice)) {
      skippedRows++;
      continue;
    }
    const commission = Math.abs(parseMoney(cells[closeIndex + 2]) || 0);
    // Swap is signed: a charge is a cost, a credit reduces the costs. Fees are
    // never negative, so a credit larger than the commission is dropped (and
    // the user told) rather than written as a negative fee.
    const swap = parseMoney(cells[closeIndex + 4] ?? cells[closeIndex + 3]) || 0;
    const cost = commission - swap;
    if (cost < 0) swapCreditDropped = true;

    const trade: ImportedTrade = {
      symbol,
      direction: type === "buy" ? "long" : "short",
      quantity,
      entryPrice,
      exitPrice,
      openedAt,
      closedAt,
      fees: Math.max(0, cost),
      assetClass: "forex",
    };
    executions.push(...tradeToExecutions(trade));
  }
  return { format: "metatrader", executions, skippedRows, warnings: [], swapCreditDropped };
};

/**
 * MetaTrader 4 statement (.htm/.html). Closed-trade rows carry ticket, open
 * time, type (buy/sell), size, item/symbol, open price, close time, close
 * price, commission, taxes, swap and profit. Trade-level, so each row becomes a
 * reconstructed entry + exit execution pair. The statement's own Profit is the
 * trade's gross P&L (so no contract size is needed) and Commission and Swap are
 * signed adjustments, read by the history adapter through the statement's
 * header. MT5 reports, which the positional reading cannot parse, fall through
 * to the history adapters unchanged.
 */
export const metatrader: ImportFormat = {
  id: "metatrader",
  label: "MetaTrader 4/5 (HTML statement)",
  detect: (_headers, content) =>
    /<html/i.test(content) &&
    /(MetaTrader|MetaQuotes|Closed Transactions|Strategy Tester)/i.test(content),
  parse: (content, options): ParsedImport => {
    const { swapCreditDropped, ...positional } = parsePositional(content, options);
    if (!positional.executions.length) return positional;
    const history = parseHistory(content, options);
    if (history?.format !== "history-metatrader") {
      return {
        ...positional,
        warnings: [
          "MetaTrader statements are trade-level; entry/exit executions were reconstructed at the reported prices. The statement's columns were not recognized, so P&L comes from prices (set a contract multiplier per symbol) and commission and swap are the fees.",
          ...(swapCreditDropped
            ? ["A swap credit larger than the commission was recorded as a zero fee."]
            : []),
        ],
      };
    }
    // Same fills, with the statement's P&L carried as reconstruction facts
    // (outside the dedup hash, so earlier imports of this file still match).
    const executions = history.executions.map(({ importMetadata, ...fill }) => {
      if (!importMetadata) return fill;
      const { id: _id, ninjaTrader: _ninjaTrader, ...reconstruction } = importMetadata;
      return { ...fill, reconstruction };
    });
    return {
      format: "metatrader",
      executions,
      skippedRows: history.skippedRows,
      warnings: [
        "MetaTrader statements are trade-level; entry/exit executions were reconstructed at the reported prices. Net P&L is the statement's Profit plus Commission and Swap.",
        ...history.warnings,
      ],
      ...(history.errors ? { errors: history.errors } : {}),
      ...(history.needsSymbol ? { needsSymbol: true } : {}),
    };
  },
};
