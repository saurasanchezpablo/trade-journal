import { parseCsv, toRecords } from "../csv";
import { rowsToFills } from "./fills";
import type { ImportFormat, ParsedImport } from "../types";

/**
 * ThinkorSwim (Charles Schwab) account statement. The file is a multi-section
 * report; only the "Account Trade History" section carries fills. We scan for
 * that section's header row and parse until the next blank/section boundary.
 */
export const thinkorswim: ImportFormat = {
  id: "thinkorswim",
  label: "ThinkorSwim / Charles Schwab (account statement)",
  detect: (_headers, content) => /Account Trade History/i.test(content),
  parse: (content, options): ParsedImport => {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex((line) => /Account Trade History/i.test(line));
    if (start === -1) {
      return {
        format: "thinkorswim",
        executions: [],
        skippedRows: 0,
        warnings: ["No 'Account Trade History' section found."],
      };
    }

    const section: string[] = [];
    let headerSeen = false;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (!headerSeen) {
        if (/exec time/i.test(line)) {
          headerSeen = true;
          section.push(line);
        }
        continue;
      }
      // Sections are separated by blank lines or a new section title row (real
      // statements follow trade history with Options / Futures / Equities /
      // Profits and Losses — cross-checked against TradeNote's parser).
      const firstCell = (line.split(",")[0] ?? "").trim();
      if (
        line.trim() === "" ||
        /^([A-Za-z ]+History|Profits and Losses|Account Summary|Options|Futures( Statements)?|Equities|Forex)$/i.test(
          firstCell,
        )
      )
        break;
      section.push(line);
    }

    // Option legs carry the underlying in Symbol and the contract in Exp,
    // Strike and Type; the contract is the fill's symbol, so options never
    // net against the stock. A leg without its expiry or strike is skipped.
    let incompleteOptions = 0;
    const optionSymbols = new Map<string, string>();
    const records = toRecords(parseCsv(section.join("\n"))).map((row) => {
      const type = (row["type"] ?? "").trim().toUpperCase();
      if (type !== "CALL" && type !== "PUT") return row;
      const exp = (row["exp"] ?? "").trim();
      const strike = (row["strike"] ?? "").trim();
      const underlying = (row["symbol"] ?? "").trim().toUpperCase();
      if (!exp || !strike || !underlying) {
        incompleteOptions++;
        return { ...row, symbol: "" };
      }
      const symbol = [underlying, exp, strike, type].join(" ").replace(/\s+/g, " ").toUpperCase();
      optionSymbols.set(symbol, underlying);
      return { ...row, symbol };
    });
    const {
      executions: fills,
      skippedRows,
      warnings: numberWarnings,
    } = rowsToFills(
      records,
      {
        symbol: ["symbol"],
        side: ["side"],
        quantity: ["qty", "quantity"],
        price: ["price"],
        timestamp: ["exectime"],
      },
      options,
    );
    const executions = fills.map((fill) => {
      const underlying = optionSymbols.get(fill.symbol);
      if (underlying === undefined) return fill;
      // The earlier parser saved option fills under the underlying's symbol.
      return {
        ...fill,
        assetClass: "option" as const,
        legacy: { ...fill.legacy, symbol: underlying },
      };
    });
    const warnings = [
      ...(executions.length > 0
        ? [
            "ThinkorSwim statements report commissions in a separate section; fees were not attached to fills.",
          ]
        : []),
      ...numberWarnings,
      ...(incompleteOptions
        ? [
            `${incompleteOptions} option row(s) have no expiry or strike and were skipped; the contract is never guessed.`,
          ]
        : []),
    ];
    return { format: "thinkorswim", executions, skippedRows, warnings };
  },
};
