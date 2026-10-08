"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useI18n } from "@/components/i18n";
import { SymbolSearchInput } from "@/components/symbol-search";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/ui/option-select";
import type { WatchedSymbol } from "@/lib/chart-preferences";
import type { MarketConnection } from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import { levelPrice, signedPrice } from "@/lib/price-format";
import { cn } from "@/lib/utils";
import {
  MAX_WATCH_ITEMS,
  sortWatchRows,
  watchKey,
  type Quote,
  type QuoteResult,
  type WatchItem,
  type WatchSort,
} from "@/lib/watchlist";

/** Prices are asked again this often while the page is visible. */
const REFRESH_MS = 30_000;

const COLUMNS: { by: WatchSort; label: string; align: "left" | "right" }[] = [
  { by: "symbol", label: "Symbol", align: "left" },
  { by: "price", label: "Last", align: "right" },
  { by: "change", label: "Chg", align: "right" },
  { by: "changePct", label: "Chg%", align: "right" },
];

/**
 * The watchlist, as on TradingView: your starred symbols with their last price and change
 * since the previous daily close, refreshed while the page is visible. Click a row to open
 * it on the chart; sort by any column; add a symbol from any source or remove one. Prices
 * are public market data, so privacy mode leaves them shown.
 */
export function WatchlistPanel({
  items,
  sources,
  current,
  onOpen,
  onAdd,
  onRemove,
  onHide,
}: {
  items: WatchedSymbol[];
  /** The market data sources that are set up. */
  sources: MarketConnection[];
  /** The chart's market, highlighted in the list. */
  current: WatchItem | null;
  onOpen: (item: WatchedSymbol) => void;
  onAdd: (item: WatchItem) => void;
  onRemove: (item: WatchedSymbol) => void;
  onHide: () => void;
}) {
  const { t } = useI18n();
  const [quotes, setQuotes] = useState<Map<string, QuoteResult>>(new Map());
  const [sort, setSort] = useState<{ by: WatchSort; descending: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = items.slice(0, MAX_WATCH_ITEMS);
  // The request follows the list itself, not each re-render.
  const listKey = shown.map(watchKey).join("\n");
  const listRef = useRef(shown);
  listRef.current = shown;

  useEffect(() => {
    if (!listKey) return;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const load = async () => {
      if (stopped || document.hidden) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/market-data/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: listRef.current.map(({ provider, dataset, symbol }) => ({
              provider,
              dataset,
              symbol,
            })),
          }),
          signal: request.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { quotes?: QuoteResult[] };
        if (stopped || request.signal.aborted || !Array.isArray(body.quotes)) return;
        setQuotes(new Map(listRef.current.map((item, i) => [watchKey(item), body.quotes![i]!])));
      } catch {
        // Offline or cancelled: the prices shown stay until the next refresh.
      } finally {
        if (!stopped) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => void load(), REFRESH_MS);
        }
      }
    };
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [listKey]);

  const rows = sortWatchRows(
    shown.map((item) => {
      const result = quotes.get(watchKey(item));
      return {
        item,
        name: item.label || item.symbol,
        quote: result?.ok ? (result as Quote) : null,
        error: result && !result.ok ? result.error : null,
      };
    }),
    sort?.by ?? null,
    sort?.descending ?? false,
  );

  /** A column's first click sorts it (names A to Z, numbers largest first), the second
   *  reverses it, the third goes back to the starred order. */
  const sortBy = (by: WatchSort) =>
    setSort((now) => {
      const first = by !== "symbol";
      if (now?.by !== by) return { by, descending: first };
      return now.descending === first ? { by, descending: !first } : null;
    });
  const isCurrent = (item: WatchedSymbol) =>
    current !== null &&
    current.provider === item.provider &&
    current.symbol === item.symbol &&
    (current.dataset ?? null) === (item.dataset ?? null);

  return (
    <section aria-label={t("Watchlist")} className="rounded-lg border bg-card">
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <h2 className="mr-auto text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {t("Watchlist")}
        </h2>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={t("Add a symbol")}
          aria-expanded={adding}
          disabled={items.length >= MAX_WATCH_ITEMS && !adding}
          title={
            items.length >= MAX_WATCH_ITEMS
              ? t("The watchlist holds at most {max} symbols.", { max: MAX_WATCH_ITEMS })
              : t("Add a symbol")
          }
          onClick={() => setAdding((open) => !open)}
        >
          <Plus className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label={t("Hide the watchlist")}
          onClick={onHide}
        >
          <X className="size-4" />
        </Button>
      </header>
      {adding && (
        <AddSymbol
          sources={sources}
          onAdd={(item) => {
            onAdd(item);
            setAdding(false);
          }}
        />
      )}
      {items.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          {t("Star a symbol on its chart, or add one with +, to watch its price here.")}
        </p>
      ) : (
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="text-muted-foreground">
              {COLUMNS.map((column) => (
                <th
                  key={column.by}
                  scope="col"
                  className={cn(
                    "px-2 py-1.5 font-normal",
                    column.by === "symbol" ? "w-[38%] text-left" : "text-right",
                  )}
                  aria-sort={
                    sort?.by === column.by
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                    onClick={() => sortBy(column.by)}
                  >
                    {t(column.label)}
                    {sort?.by === column.by &&
                      (sort.descending ? (
                        <ArrowDown className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowUp className="size-3" aria-hidden="true" />
                      ))}
                  </button>
                </th>
              ))}
              <th className="w-7">
                <span className="sr-only">{t("Remove")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, name, quote, error }) => {
              const source = providerInfo(item.provider)?.name ?? item.provider;
              const direction = quote?.change ? (quote.change > 0 ? "up" : "down") : null;
              return (
                <tr
                  key={item.key}
                  className={cn(
                    "group cursor-pointer border-t hover:bg-accent/50",
                    isCurrent(item) && "bg-accent/60",
                  )}
                  onClick={() => onOpen(item)}
                >
                  <td className="truncate px-2 py-1.5">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-1.5 text-left"
                      title={t("{symbol} on {source}", { symbol: item.symbol, source })}
                      aria-current={isCurrent(item) ? "true" : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(item);
                      }}
                    >
                      {item.color && (
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {source}
                        </span>
                      </span>
                    </button>
                  </td>
                  {quote ? (
                    <>
                      <td className="tnum px-2 py-1.5 text-right">{levelPrice(quote.price)}</td>
                      <td
                        className={cn(
                          "tnum px-2 py-1.5 text-right",
                          direction === "up" && "text-profit",
                          direction === "down" && "text-loss",
                        )}
                      >
                        {quote.change === null ? "–" : signedPrice(quote.change, quote.price)}
                      </td>
                      <td
                        className={cn(
                          "tnum px-2 py-1.5 text-right",
                          direction === "up" && "text-profit",
                          direction === "down" && "text-loss",
                        )}
                      >
                        {quote.changePct === null
                          ? "–"
                          : `${quote.changePct >= 0 ? "+" : ""}${(quote.changePct * 100).toFixed(2)}%`}
                      </td>
                    </>
                  ) : (
                    <td
                      colSpan={3}
                      className="truncate px-2 py-1.5 text-right text-muted-foreground"
                      title={error ? t(error) : undefined}
                    >
                      {error ? t("No price") : t("Loading…")}
                    </td>
                  )}
                  <td className="px-1 py-1.5 text-right">
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={t("Remove {symbol} from the watchlist", { symbol: item.symbol })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(item);
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {items.length > MAX_WATCH_ITEMS && (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {t("Prices show for the first {max} symbols.", { max: MAX_WATCH_ITEMS })}
        </p>
      )}
    </section>
  );
}

/** Add a symbol: the source, its market where it has several, and the symbol (searchable). */
function AddSymbol({
  sources,
  onAdd,
}: {
  sources: MarketConnection[];
  onAdd: (item: WatchItem) => void;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState(sources[0]?.id ?? "");
  const [dataset, setDataset] = useState("");
  const [symbol, setSymbol] = useState("");
  const info = providerInfo(provider);
  const markets = info?.datasets?.filter((d) => d.value) ?? [];
  const needsDataset = markets.length > 0;
  const ready = provider && symbol.trim() && (!needsDataset || dataset);
  if (!sources.length)
    return (
      <p className="border-b px-3 py-2 text-xs text-muted-foreground">
        {t("Enable a market data source in Settings first.")}
      </p>
    );
  return (
    <form
      className="space-y-2 border-b px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready)
          onAdd({ provider, dataset: needsDataset ? dataset : null, symbol: symbol.trim() });
      }}
    >
      <div className="flex gap-2">
        <OptionSelect
          aria-label={t("Source")}
          className="h-8 min-w-0 flex-1 text-xs"
          value={provider}
          onValueChange={(value) => {
            setProvider(value);
            setDataset("");
          }}
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </OptionSelect>
        {needsDataset && (
          <OptionSelect
            aria-label={t("Market")}
            className="h-8 min-w-0 flex-1 text-xs"
            value={dataset}
            onValueChange={setDataset}
          >
            <option value="" disabled>
              {t("Choose a market")}
            </option>
            {markets.map((market) => (
              <option key={market.value} value={market.value}>
                {t(market.label)}
              </option>
            ))}
          </OptionSelect>
        )}
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <SymbolSearchInput
            id="watchlist-symbol"
            value={symbol}
            onChange={setSymbol}
            provider={provider}
            dataset={dataset}
            searchable={Boolean(info?.searchable) && (!needsDataset || Boolean(dataset))}
          />
        </div>
        <Button type="submit" size="sm" disabled={!ready}>
          {t("Add")}
        </Button>
      </div>
    </form>
  );
}
