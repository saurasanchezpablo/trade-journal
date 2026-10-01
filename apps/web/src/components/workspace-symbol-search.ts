import {
  baselineSymbols,
  searchScope,
  typedSymbols,
  type WorkspaceSource,
  type WorkspaceSymbolRow,
} from "@/lib/chart-workspace";
import type { RecentSymbol } from "@/lib/recent-symbols";

/**
 * The workspace's symbol search, fed by the journal's sources. Vela's picker filters a list
 * it holds in the browser, built from each provider's full listing; the journal's sources
 * search on the server instead (Yahoo has no listing at all, Binance's is megabytes). So the
 * picker's list is replaced with what the charts show, your recent symbols and, as you type,
 * each source's own search results, plus the typed symbol for sources without a search.
 *
 * Reaches into the picker's internals (its list source, its field and `refresh`, which runs
 * on every change of the query: typed into the field, typed at the chart, or the seed it
 * opens with), which Vela does not export; when they are missing the picker keeps its own
 * list (recent symbols only, from the providers' `listSymbols`).
 */
interface PickerInternals {
  input?: HTMLInputElement;
  setSource?: (source: () => WorkspaceSymbolRow[]) => void;
  refresh?: () => void;
  isOpen?: boolean;
}

const DEBOUNCE_MS = 250;

export function attachSymbolSearch(
  workspace: unknown,
  sources: readonly WorkspaceSource[],
  context: { shown: () => string[]; recent: () => RecentSymbol[] },
): () => void {
  const picker = (workspace as { symbolPicker?: PickerInternals }).symbolPicker;
  const input = picker?.input;
  if (!picker || !input || typeof picker.setSource !== "function" || !picker.refresh)
    return () => {};
  const refresh = picker.refresh.bind(picker);
  let found: WorkspaceSymbolRow[] = [];
  /** The query the results in `found` (or the search on its way) are for. */
  let query = "";
  picker.setSource(() => {
    const rows = [
      ...found,
      ...baselineSymbols(sources, context.shown(), context.recent()),
      // The field itself: Vela refreshes on input before this module hears of it.
      ...typedSymbols(sources, input.value),
    ];
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = `${row.provider}:${row.ticker.toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  const search = () => {
    const next = input.value.trim();
    if (next === query) return;
    query = next;
    if (timer) clearTimeout(timer);
    controller?.abort();
    if (!query) {
      found = [];
      return;
    }
    timer = setTimeout(() => {
      const current = new AbortController();
      controller = current;
      const asked = query;
      const scoped = searchScope(sources, asked);
      void Promise.all(
        scoped.sources
          .filter((s) => s.searchable && scoped.term)
          .map(async (source) => {
            const params = new URLSearchParams({ provider: source.provider, q: scoped.term });
            if (source.dataset) params.set("dataset", source.dataset);
            try {
              const response = await fetch(`/api/market-data/symbols?${params}`, {
                signal: current.signal,
              });
              if (!response.ok) return [];
              const body = (await response.json()) as {
                symbols?: { symbol: string; description: string }[];
              };
              return (body.symbols ?? []).slice(0, 30).map((match): WorkspaceSymbolRow => ({
                ticker: match.symbol,
                provider: source.name,
                description: `${match.description} · ${source.label}`,
              }));
            } catch {
              return [];
            }
          }),
      ).then((lists) => {
        if (current.signal.aborted || asked !== query) return;
        found = lists.flat();
        if (picker.isOpen !== false) refresh();
      });
    }, DEBOUNCE_MS);
  };
  picker.refresh = () => {
    refresh();
    search();
  };
  return () => {
    picker.refresh = refresh;
    if (timer) clearTimeout(timer);
    controller?.abort();
  };
}
