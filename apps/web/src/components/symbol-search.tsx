"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "./ui/input";

interface Match {
  symbol: string;
  description: string;
}

/**
 * The chart's symbol field. For a source that lists its instruments, what you type is
 * searched there and matches are offered as you type (the browser's own suggestion list);
 * any exact symbol can still be typed.
 */
export function SymbolSearchInput({
  id,
  value,
  onChange,
  provider,
  dataset,
  searchable,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  provider: string;
  dataset: string;
  searchable: boolean;
}) {
  const listId = useId();
  const [matches, setMatches] = useState<Match[]>([]);
  const query = value.trim();
  useEffect(() => {
    if (!searchable || !query) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ provider, q: query });
      if (dataset) params.set("dataset", dataset);
      fetch(`/api/market-data/symbols?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { symbols: [] }))
        .then((body: { symbols?: Match[] }) => setMatches(body.symbols ?? []))
        .catch(() => {
          // An aborted or failed search leaves the previous suggestions.
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, provider, dataset, query]);
  return (
    <>
      <Input
        id={id}
        value={value}
        placeholder={searchable ? "Search: BTC" : "AAPL"}
        autoCapitalize="characters"
        autoComplete="off"
        list={searchable ? listId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {searchable && (
        <datalist id={listId}>
          {matches.map((match) => (
            <option key={match.symbol} value={match.symbol}>
              {match.description}
            </option>
          ))}
        </datalist>
      )}
    </>
  );
}
