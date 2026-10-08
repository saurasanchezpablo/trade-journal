import type { Vela } from "@luxalgo/vela";
import { extraSymbolsFor } from "@/lib/chart-extra-symbols";
import type { ChartOverlayData, OverlayOptions } from "@/lib/chart-overlays";
import { parseWorkspaceSymbol, type WorkspaceSource } from "@/lib/chart-workspace";
import type { EconomicEvent } from "@/lib/economic-calendar";
import { createChartOverlays, type ChartOverlays } from "./chart-overlays";
import { JOURNAL_OVERLAYS_TYPE } from "./vela-view-limits";

/**
 * The journal on each workspace chart, as on the Charts page: your trades (fills, entry to
 * exit with the result, open positions with stop and target), missed trades, market
 * sessions and economic events, following the chart's symbol and your overlay switches.
 *
 * They are drawn by a hidden native indicator (`createChartOverlays`). The workspace keeps
 * its own books of a chart's indicators (its picker, the indicators it saves and restores,
 * the object tree, "remove indicators"), so that indicator is taken out of what the chart
 * reports to it: the workspace never lists, saves, removes or re-creates it.
 */

type VelaModule = Parameters<typeof createChartOverlays>[0];

export interface OverlayEnvironment {
  options: () => OverlayOptions;
  events: () => EconomicEvent[];
  privacy: () => boolean;
  onOpenTrade: (key: string) => void;
  onOpenMissed: (id: string) => void;
}

export interface WorkspaceOverlay {
  /** The switches, events or privacy changed. */
  update(): void;
  /** The theme changed: label ink follows it. */
  repaint(): void;
  dispose(): void;
}

const EMPTY: ChartOverlayData = { symbols: [], trades: [], missed: [] };
const isJournal = (type: unknown) =>
  typeof type === "string" && type.startsWith(JOURNAL_OVERLAYS_TYPE);
const hidden = new WeakSet<Vela>();

/** Leave the journal's indicator out of what a chart reports (once per chart). */
export function hideJournalIndicators(chart: Vela): void {
  if (hidden.has(chart)) return;
  hidden.add(chart);
  const indicators = chart.indicators.bind(chart);
  const available = chart.availableNativeIndicators.bind(chart);
  chart.indicators = () => indicators().filter((h) => !isJournal(h.nativeType));
  chart.availableNativeIndicators = async () =>
    (await available()).filter((n) => !isJournal(n.type));
}

/** Overlay data per chart symbol, shared by the charts showing it, read again after a minute. */
const FRESH_MS = 60_000;
const loaded = new Map<string, { at: number; value: Promise<ChartOverlayData> }>();

function overlayData(symbol: string, extra: string): Promise<ChartOverlayData> {
  const key = `${symbol}\n${extra}`;
  const hit = loaded.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.value;
  const params = new URLSearchParams({ symbol, extra });
  const value = fetch(`/api/chart-overlays?${params}`).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<ChartOverlayData>;
  });
  loaded.set(key, { at: Date.now(), value });
  // A failure is not kept: the next chart (or symbol change) asks again.
  return value.catch(() => {
    if (loaded.get(key)?.value === value) loaded.delete(key);
    return EMPTY;
  });
}

/** Put the journal on one workspace chart; `host` is the chart's element (clicks). */
export function attachJournalOverlays(
  vela: VelaModule,
  chart: Vela,
  host: HTMLElement,
  sources: readonly WorkspaceSource[],
  env: OverlayEnvironment,
): WorkspaceOverlay {
  hideJournalIndicators(chart);
  let data = EMPTY;
  let disposed = false;
  const state = () => ({
    data,
    options: env.options(),
    zones: [],
    events: env.events(),
    privacy: env.privacy(),
    pendingZone: null,
  });
  const drawn: ChartOverlays = createChartOverlays(
    vela,
    chart,
    host,
    {
      onOpenTrade: env.onOpenTrade,
      onOpenMissed: env.onOpenMissed,
      onZoneStats: () => {},
      // The workspace has no click-to-place modes.
      onChartClick: () => false,
      drawingActive: () => chart.drawings.getTool() !== null || chart.drawings.getMode() !== null,
    },
    state(),
  );

  /** The chart's journal symbol: its symbol on the source, or none for another prefix. */
  let shown = "";
  const load = () => {
    const parsed = parseWorkspaceSymbol(chart.market.symbol ?? "", sources);
    const symbol = parsed?.symbol ?? "";
    if (symbol === shown) return;
    shown = symbol;
    data = EMPTY;
    drawn.set({ data });
    if (!parsed) return;
    const extra = extraSymbolsFor(`${parsed.source.provider}|${parsed.symbol}`);
    void overlayData(symbol, extra).then((next) => {
      // A later symbol on this chart (or a removed chart) wins over a late answer.
      if (disposed || shown !== symbol) return;
      data = next;
      drawn.set({ data });
    });
  };
  const offMarket = chart.on("market:changed", load);
  load();
  return {
    update: () => drawn.set(state()),
    repaint: () => drawn.repaint(),
    dispose: () => {
      disposed = true;
      offMarket();
      drawn.dispose();
    },
  };
}
