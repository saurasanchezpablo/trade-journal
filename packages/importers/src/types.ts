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
  fees: number;
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

/** Turn a trade-level row into its two synthetic executions (fees on the exit). */
export const tradeToExecutions = (trade: ImportedTrade): ImportedExecution[] => [
  {
    symbol: trade.symbol,
    side: trade.direction === "long" ? "buy" : "sell",
    quantity: trade.quantity,
    price: trade.entryPrice,
    fee: 0,
    executedAt: trade.openedAt,
    assetClass: trade.assetClass,
  },
  {
    symbol: trade.symbol,
    side: trade.direction === "long" ? "sell" : "buy",
    quantity: trade.quantity,
    price: trade.exitPrice,
    fee: trade.fees,
    executedAt: trade.closedAt,
    assetClass: trade.assetClass,
  },
];
