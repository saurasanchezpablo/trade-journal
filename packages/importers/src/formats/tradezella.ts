import { hasHeaders, parseCsv, pick, toRecords, type Row } from "../csv";
import { parseDateAndTime, parseTimestamp } from "../dates";
import { parseMoney, parseQuantity } from "../numbers";
import {
  tradeToExecutions,
  type ImportFormat,
  type ImportedTrade,
  type ParsedImport,
} from "../types";

/**
 * TradeZella trades export, the one-click migration path. TradeZella exports
 * round trips (not fills), so each row is reconstructed as an entry + exit
 * execution pair at the reported average prices. The row's stated net P&L is
 * kept exactly (commissions are the fee, the rest is the gross), so the
 * journal agrees with the trader's old numbers to the cent, contract
 * multipliers or not. A row without a recognizable side is skipped: the
 * direction is never assumed.
 */
export const tradezella: ImportFormat = {
  id: "tradezella",
  label: "TradeZella (trades export)",
  detect: (headers) =>
    hasHeaders(headers, [
      ["opendate", "opentime", "entrydate"],
      ["closedate", "closetime", "exitdate"],
      ["symbol", "instrument"],
      ["netpnl", "netpl", "netprofit"],
    ]),
  parse: (content, options): ParsedImport => {
    const records = toRecords(parseCsv(content));
    const executions: ParsedImport["executions"] = [];
    let skippedRows = 0;
    let missingSide = 0;
    const warnings = [
      "TradeZella exports are trade-level; entry/exit executions were reconstructed at the reported average prices. Net P&L is preserved exactly.",
    ];
    // A date column and a time column are combined; a time column that holds a
    // full timestamp is read on its own.
    const when = (row: Row, dates: string[], times: string[]) => {
      const date = pick(row, dates);
      const time = pick(row, times);
      if (date && time)
        return (
          parseTimestamp(time, options.timeZone) ?? parseDateAndTime(date, time, options.timeZone)
        );
      return parseTimestamp(date ?? time, options.timeZone);
    };

    for (const row of records) {
      const symbol = pick(row, ["symbol", "instrument"])?.trim().toUpperCase();
      const sideText = (pick(row, ["side", "direction", "type"]) ?? "").toLowerCase();
      const direction = /short|sell/.test(sideText)
        ? "short"
        : /long|buy/.test(sideText)
          ? "long"
          : null;
      const quantity = parseQuantity(pick(row, ["volume", "quantity", "qty", "size"]));
      const entryPrice = parseMoney(
        pick(row, ["entryprice", "avgentry", "averageentry", "openprice"]),
      );
      const exitPrice = parseMoney(
        pick(row, ["exitprice", "avgexit", "averageexit", "closeprice"]),
      );
      const openedAt = when(row, ["opendate", "entrydate"], ["opentime", "entrytime"]);
      const closedAt = when(row, ["closedate", "exitdate"], ["closetime", "exittime"]);
      // The earlier parser read only the first date-or-time column (a date alone is midnight).
      const legacyOpenedAt = parseTimestamp(
        pick(row, ["opendate", "opentime", "entrydate"]),
        options.timeZone,
      );
      const legacyClosedAt = parseTimestamp(
        pick(row, ["closedate", "closetime", "exitdate"]),
        options.timeZone,
      );
      const netPnl = parseMoney(pick(row, ["netpnl", "netpl", "netprofit"]));
      const commissions =
        Math.abs(parseMoney(pick(row, ["commissions", "commission"])) || 0) +
        Math.abs(parseMoney(pick(row, ["fees", "fee", "totalfees"])) || 0);

      if (!direction) missingSide++;
      if (
        !symbol ||
        !direction ||
        !openedAt ||
        !closedAt ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(entryPrice) ||
        !Number.isFinite(exitPrice)
      ) {
        skippedRows++;
        continue;
      }

      const trade: ImportedTrade = {
        symbol,
        direction,
        quantity,
        entryPrice,
        exitPrice,
        openedAt,
        closedAt,
        fees: Number.isFinite(commissions) ? commissions : 0,
        ...(Number.isFinite(netPnl) ? { reportedNetPnl: netPnl } : {}),
        ...(legacyOpenedAt ? { legacyOpenedAt } : {}),
        ...(legacyClosedAt ? { legacyClosedAt } : {}),
      };
      executions.push(...tradeToExecutions(trade));
    }
    if (missingSide)
      warnings.push(
        `${missingSide} row(s) have no Long/Short side and were skipped; the direction of a trade is never assumed. Export the Side column.`,
      );

    return { format: "tradezella", executions, skippedRows, warnings };
  },
};
