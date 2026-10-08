/**
 * Journal symbols you also want on a chart (MES trades on an ES chart), per chart market
 * (`provider|symbol`), remembered per browser. The Charts page edits them; the workspace's
 * charts read them too.
 */
const EXTRA_SYMBOLS_KEY = "journal-chart-extra-symbols-v1";

export function extraSymbolsFor(chartKey: string): string {
  try {
    const map = JSON.parse(localStorage.getItem(EXTRA_SYMBOLS_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    const value = map[chartKey];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function saveExtraSymbols(chartKey: string, value: string) {
  try {
    const map = JSON.parse(localStorage.getItem(EXTRA_SYMBOLS_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    if (value.trim()) map[chartKey] = value;
    else delete map[chartKey];
    localStorage.setItem(EXTRA_SYMBOLS_KEY, JSON.stringify(map));
  } catch {
    // Remembered for this page only.
  }
}
