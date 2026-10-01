import { VELA_TIMEFRAME } from "./chart-analysis";
import { INDICATOR_LIBRARY } from "./indicator-library";
import type { ChartScript } from "./chart-indicators";
import { velaProviderName } from "./live-market";
import { RESOLUTIONS, type MarketConnection, type Resolution } from "./market-data";
import { providerInfo } from "./market-providers";
import type { RecentSymbol } from "./recent-symbols";

/**
 * The chart workspace: several charts on one full-screen grid (Vela's workspace), each with
 * its own symbol and candle size, linked as you choose (crosshair, time window, symbol,
 * candle size, drawings, style). Its candles come from the journal's market data sources,
 * one Vela provider per source and market (Bybit spot and Bybit perpetuals are two), so a
 * chart's symbol reads `bybit_spot:BTCUSDT`.
 */

/** One source a workspace chart can show, as Vela names it. */
export interface WorkspaceSource {
  /** The Vela provider name, the prefix of a chart's symbol. */
  name: string;
  provider: string;
  dataset: string | null;
  label: string;
  /** The source can search its listing (`/api/market-data/symbols`). */
  searchable: boolean;
  resolutions: Resolution[];
}

const ALL_RESOLUTIONS = Object.keys(RESOLUTIONS) as Resolution[];

/** The Vela provider name of a source and market. */
export const workspaceSourceName = (provider: string, dataset: string | null) =>
  dataset
    ? `${velaProviderName(provider)}_${velaProviderName(dataset)}`
    : velaProviderName(provider);

/**
 * Every source the workspace can use: the configured connections, one per market for
 * sources that have several (a CSV source uses its automatically matching file).
 */
export function workspaceSources(connections: readonly MarketConnection[]): WorkspaceSource[] {
  const sources: WorkspaceSource[] = [];
  for (const connection of connections) {
    if (!connection.configured) continue;
    const info = providerInfo(connection.id);
    const markets = info?.datasets?.filter((d) => d.value) ?? [];
    const base = {
      provider: connection.id,
      searchable: Boolean(info?.searchable),
      resolutions: info?.resolutions ?? ALL_RESOLUTIONS,
    };
    if (!markets.length)
      sources.push({
        ...base,
        name: workspaceSourceName(connection.id, null),
        dataset: null,
        label: connection.name,
      });
    else
      for (const market of markets)
        sources.push({
          ...base,
          name: workspaceSourceName(connection.id, market.value),
          dataset: market.value,
          label: `${connection.name} · ${market.label}`,
        });
  }
  return sources;
}

/** The source and symbol of a workspace chart's `name:TICKER`, or null for another name. */
export function parseWorkspaceSymbol(
  value: string,
  sources: readonly WorkspaceSource[],
): { source: WorkspaceSource; symbol: string } | null {
  const at = value.indexOf(":");
  if (at <= 0) return null;
  const name = value.slice(0, at).toLowerCase();
  const symbol = value.slice(at + 1).trim();
  const source = sources.find((s) => s.name === name);
  return source && symbol ? { source, symbol } : null;
}

export interface WorkspaceMarket {
  provider: string;
  dataset: string | null;
  symbol: string;
}

/** The workspace source showing a market, if it is configured. */
export const sourceFor = (sources: readonly WorkspaceSource[], market: WorkspaceMarket) =>
  sources.find((s) => s.provider === market.provider && s.dataset === (market.dataset || null)) ??
  null;

/** Candle sizes the four starting charts show: the same market from the day down. */
const SEED_RESOLUTIONS: Resolution[] = ["1d", "4h", "1h", "15m"];

export const WORKSPACE_CELLS = ["chart-1", "chart-2", "chart-3", "chart-4"] as const;

/**
 * What a new workspace starts with: one market on four charts, from the daily candle down
 * to 15 minutes (a source with fewer candle sizes repeats its finest). Null when there is
 * no market to show yet.
 */
export function seedCells(
  sources: readonly WorkspaceSource[],
  market: WorkspaceMarket | null,
): Record<string, { symbol: string; timeframe: string }> | null {
  const source = market ? sourceFor(sources, market) : null;
  if (!source || !market) return null;
  const sizes = SEED_RESOLUTIONS.map((wanted) =>
    source.resolutions.includes(wanted) ? wanted : finestAtLeast(source.resolutions, wanted),
  );
  return Object.fromEntries(
    WORKSPACE_CELLS.map((cell, i) => [
      cell,
      { symbol: `${source.name}:${market.symbol}`, timeframe: VELA_TIMEFRAME[sizes[i]!] },
    ]),
  );
}

/** The nearest size the source serves: the next larger one, else its largest. */
function finestAtLeast(available: readonly Resolution[], wanted: Resolution): Resolution {
  const sorted = [...available].sort((a, b) => RESOLUTIONS[a] - RESOLUTIONS[b]);
  return sorted.find((r) => RESOLUTIONS[r] >= RESOLUTIONS[wanted]) ?? sorted.at(-1) ?? wanted;
}

/** The market to start a new workspace on: the chart you came from, else the latest one. */
export function startingMarket(
  sources: readonly WorkspaceSource[],
  linked: WorkspaceMarket | null,
  recent: readonly RecentSymbol[],
): WorkspaceMarket | null {
  if (linked && sourceFor(sources, linked)) return linked;
  for (const item of recent) {
    const market = { provider: item.provider, dataset: item.dataset ?? null, symbol: item.symbol };
    if (sourceFor(sources, market)) return market;
  }
  return null;
}

/** One row of the workspace's symbol search (Vela's `SymbolDescriptor`). */
export interface WorkspaceSymbolRow {
  ticker: string;
  provider: string;
  description?: string;
}

/**
 * The rows the symbol search starts from: what the charts show now and your recent symbols,
 * per source, most recent first. Search results from the sources are added as you type.
 */
export function baselineSymbols(
  sources: readonly WorkspaceSource[],
  shown: readonly string[],
  recent: readonly RecentSymbol[],
): WorkspaceSymbolRow[] {
  const rows: WorkspaceSymbolRow[] = [];
  const seen = new Set<string>();
  const add = (source: WorkspaceSource, ticker: string, description: string) => {
    const key = `${source.name}:${ticker.toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ticker, provider: source.name, description });
  };
  for (const value of shown) {
    const parsed = parseWorkspaceSymbol(value, sources);
    if (parsed) add(parsed.source, parsed.symbol, `On a chart · ${parsed.source.label}`);
  }
  for (const item of recent) {
    const source = sourceFor(sources, {
      provider: item.provider,
      dataset: item.dataset ?? null,
      symbol: item.symbol,
    });
    if (source) add(source, item.symbol, `Recent · ${source.label}`);
  }
  return rows;
}

/**
 * A symbol search query: the term, and the sources it asks (`yahoo:AAPL` asks Yahoo only,
 * as Vela's picker reads it).
 */
export function searchScope(sources: readonly WorkspaceSource[], query: string) {
  const text = query.trim();
  const at = text.indexOf(":");
  if (at < 0) return { term: text, sources: [...sources] };
  const scope = text.slice(0, at).toLowerCase();
  return {
    term: text.slice(at + 1).trim(),
    sources: sources.filter((s) => s.name === scope || s.name.startsWith(`${scope}_`)),
  };
}

/**
 * Rows for text typed in the symbol search that no listing matched: the symbol as typed,
 * once per source that has no listing to search (a CSV file, a broker feed).
 */
export function typedSymbols(
  sources: readonly WorkspaceSource[],
  query: string,
): WorkspaceSymbolRow[] {
  const scoped = searchScope(sources, query);
  const ticker = scoped.term.toUpperCase();
  if (!/^[A-Z0-9^=._/!-]{1,40}$/.test(ticker)) return [];
  return scoped.sources
    .filter((s) => !s.searchable)
    .map((s) => ({ ticker, provider: s.name, description: `Open as typed · ${s.label}` }));
}

/** The indicator picker's list: the journal's library and your saved scripts, all off. */
export function workspaceIndicators(scripts: readonly ChartScript[]) {
  return [
    ...INDICATOR_LIBRARY.map((item) => ({
      name: item.name,
      script: item.source,
      language: "pine",
      enabled: false,
      category: item.category,
    })),
    ...scripts.map((script) => ({
      name: script.name,
      script: script.source,
      language: "pine",
      enabled: false,
      category: "My scripts",
    })),
  ];
}

/** A saved workspace is Vela's state document as text; refused beyond this size. */
export const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;

/** Why a workspace document can't be saved, or null when it can. */
export function workspaceStateProblem(value: unknown): string | null {
  if (typeof value !== "string" || !value) return "The workspace must be sent as text.";
  if (new TextEncoder().encode(value).length > MAX_WORKSPACE_BYTES)
    return "This workspace is too large to save (over 4 MB). Remove some drawings.";
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return "The workspace is not valid JSON.";
  }
  const doc = parsed as { version?: unknown; layout?: unknown; charts?: unknown } | null;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return "Invalid workspace.";
  if (doc.version !== 1 || typeof doc.layout !== "string" || !Array.isArray(doc.charts))
    return "Invalid workspace.";
  return null;
}
