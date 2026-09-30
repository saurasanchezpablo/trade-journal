import type { AssetClass, ImportMetadata, TradeDirection } from "@luxalgo/journal-core";

/** An execution as parsed from a file — the app assigns id/accountId/source on insert. */
export interface ImportedExecution {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
  /** Previous parser timestamp, only for detecting an unsafe reimport after a parsing fix. */
  legacyExecutedAt?: string;
  /**
   * What an earlier parser read for this fill's identity fields, set only where
   * a parsing fix changed them. Only for detecting an unsafe reimport over rows
   * that the earlier parser saved.
   */
  legacy?: Partial<Pick<ImportedExecution, "symbol" | "quantity" | "price" | "executedAt">>;
  assetClass?: AssetClass;
  /** Source identity and reconstruction facts; `id` and `group` are part of the dedup hash. */
  importMetadata?: ImportMetadata;
  /**
   * Reconstruction facts (trade grouping, order among fills at the same instant,
   * reported P&L) for formats whose fills were deduplicated by their economics
   * alone before these facts existed. The journal stores them like
   * `importMetadata`, but they stay out of the dedup hash, so files imported
   * earlier still match the rows they saved. Ignored when `importMetadata` is set.
   */
  reconstruction?: ReconstructionFacts;
  /** Untrusted export labels are resolved to saved source IDs by the import review. */
  ninjaTrader?: {
    sourceKey: string;
    account: string;
    connection: string;
    instrument: string;
    executionId?: string;
    effect?: "entry" | "exit" | "reverse";
    sequence?: number;
    reportedFee?: number;
  };
}

/** Import facts that shape trade reconstruction without being part of a fill's identity. */
export type ReconstructionFacts = Omit<ImportMetadata, "id" | "ninjaTrader">;

/** Stored `id` of reconstruction facts, which carry no source identity of their own. */
export const RECONSTRUCTED_ID = "reconstructed";

/** The import metadata a journal stores for an imported fill (source metadata or reconstruction facts). */
export const storedImportMetadata = (execution: ImportedExecution): ImportMetadata | undefined =>
  execution.importMetadata ??
  (execution.reconstruction ? { id: RECONSTRUCTED_ID, ...execution.reconstruction } : undefined);

/**
 * Trade-level exports (TradeZella, MetaTrader statements) don't carry fills, so
 * each row is reconstructed as one entry + one exit execution at the reported
 * average prices. P&L is preserved exactly; fill-level granularity is not.
 */
export interface ImportedTrade {
  symbol: string;
  direction: TradeDirection;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: string;
  closedAt: string;
  /** Costs, never negative. */
  fees: number;
  /** The export's own net P&L for the trade; the journal keeps it instead of rebuilding it from prices. */
  reportedNetPnl?: number;
  /** Timestamps an earlier parser read, only for detecting an unsafe reimport after a parsing fix. */
  legacyOpenedAt?: string;
  legacyClosedAt?: string;
  assetClass?: AssetClass;
}

export interface ParsedImport {
  format: string;
  executions: ImportedExecution[];
  /** Rows the parser saw but could not turn into executions. */
  skippedRows: number;
  warnings: string[];
  /** Missing source facts or malformed/truncated input block a commit. */
  errors?: string[];
  needsSymbol?: boolean;
}

export interface ImportOptions {
  /**
   * IANA timezone used to interpret timestamps that carry no offset (most
   * broker exports are wall-clock local). Defaults to UTC.
   */
  timeZone?: string;
  /** Used only when the filename explicitly identifies an exchange and symbol. */
  fileName?: string;
  /** User-supplied symbol for single-strategy files that omit it. */
  symbol?: string;
}

export interface ImportFormat {
  id: string;
  label: string;
  /** True when the header/content signature matches this format. */
  detect: (headers: string[], content: string) => boolean;
  parse: (content: string, options: ImportOptions) => ParsedImport;
}

/**
 * Turn a trade-level row into its two synthetic executions (fees on the exit).
 * Each trade is its own reconstruction group, so trades that overlap on one
 * symbol are never netted together, and a reported net P&L is kept exactly.
 * These facts stay outside the dedup hash: the fills keep the identity earlier
 * imports gave them.
 */
export const tradeToExecutions = (trade: ImportedTrade): ImportedExecution[] => {
  const group = JSON.stringify([
    "trade",
    trade.symbol,
    trade.direction,
    trade.openedAt,
    trade.entryPrice,
    trade.closedAt,
    trade.exitPrice,
    trade.quantity,
  ]);
  const reported = trade.reportedNetPnl !== undefined;
  const legacy = (at: string | undefined, current: string) =>
    at && at !== current ? { legacyExecutedAt: at } : {};
  return [
    {
      symbol: trade.symbol,
      side: trade.direction === "long" ? "buy" : "sell",
      quantity: trade.quantity,
      price: trade.entryPrice,
      fee: 0,
      executedAt: trade.openedAt,
      ...legacy(trade.legacyOpenedAt, trade.openedAt),
      assetClass: trade.assetClass,
      reconstruction: { group, order: 0, ...(reported ? { preserveFee: true } : {}) },
    },
    {
      symbol: trade.symbol,
      side: trade.direction === "long" ? "sell" : "buy",
      quantity: trade.quantity,
      price: trade.exitPrice,
      fee: trade.fees,
      executedAt: trade.closedAt,
      ...legacy(trade.legacyClosedAt, trade.closedAt),
      assetClass: trade.assetClass,
      reconstruction: {
        group,
        order: 1,
        ...(reported
          ? { preserveFee: true, reportedGrossPnl: trade.reportedNetPnl! + trade.fees }
          : {}),
      },
    },
  ];
};
