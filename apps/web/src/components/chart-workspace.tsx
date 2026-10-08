"use client";

import { useEffect, useRef, useState } from "react";
import type { Vela } from "@luxalgo/vela";
import type { VelaWorkspace, VelaWorkspaceOptions } from "@luxalgo/vela/workspace";
import { VELA_TIMEFRAME } from "@/lib/chart-analysis";
import { tr } from "@/lib/i18n";
import type { ChartScript } from "@/lib/chart-indicators";
import {
  baselineSymbols,
  parseWorkspaceSymbol,
  workspaceIndicators,
  type WorkspaceSource,
} from "@/lib/chart-workspace";
import { JournalMarketProvider, resolutionForTimeframe } from "@/lib/live-market";
import { FallbackPineEngine } from "@/lib/pine-fallback-engine";
import { recentSymbols } from "@/lib/recent-symbols";
import {
  applyCalculationFixes,
  patchNativeVwap,
  patchVisibleRangeProfile,
} from "./vela-calculation-fixes";
import { clipOffscreenDashes } from "./vela-dash-fix";
import { keepDrawingsOverSeries } from "./vela-depth-fix";
import { applyPatternFixes } from "./vela-pattern-fixes";
import { limitChartView } from "./vela-view-limits";
import { attachSymbolSearch, localizeSymbolRow } from "./workspace-symbol-search";
import {
  attachJournalOverlays,
  type OverlayEnvironment,
  type WorkspaceOverlay,
} from "./workspace-overlays";
import { overlayPreference } from "@/lib/chart-overlays";
import type { EconomicEvent } from "@/lib/economic-calendar";

/** Saved at most this often while you work; a page you leave saves at once. */
const SAVE_DELAY_MS = 1500;
const PERSIST_KEY = "journal-workspace";

/** The last save still on its way: a workspace opened again reads after it lands. */
let saving: Promise<unknown> = Promise.resolve();
export const workspaceSaved = () => saving.catch(() => {});

/** What the workspace's own topbar buttons do; set by the mounted workspace. */
const handlers = {
  timeLinked: () => false,
  linkTime: (_on: boolean) => {},
  exit: () => {},
  openInCharts: () => {},
  fullscreen: () => {},
  startOver: () => {},
};

const ICONS: Record<string, string> = {
  "journal-back": '<path d="M10 3 5 8l5 5" />',
  "journal-open": '<path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />',
  "journal-fullscreen": '<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />',
  // A chain, whole while the charts' time windows move together and broken while not.
  "journal-time-link":
    '<path d="M6.5 9.5l3-3" /><path d="M7.2 4.6l1.1-1.1a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1" /><path d="M8.8 11.4l-1.1 1.1a2.5 2.5 0 0 1-3.5-3.5l1.1-1.1" />',
  "journal-time-unlink":
    '<path d="M7.2 4.6l1.1-1.1a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1" /><path d="M8.8 11.4l-1.1 1.1a2.5 2.5 0 0 1-3.5-3.5l1.1-1.1" /><path d="M3 3l1.5 1.5M13 13l-1.5-1.5" />',
};

let registered: Promise<void> | null = null;
/** Topbar buttons and icons, registered once before any workspace is built (Vela reads its
 *  registries when it builds). */
const registerContributions = () => (registered ??= register());
async function register() {
  const [{ registerWidgetAction }, { registerIcon, svg16 }] = await Promise.all([
    import("@luxalgo/vela/plugin"),
    import("@luxalgo/vela/ui"),
  ]);
  for (const [id, body] of Object.entries(ICONS))
    registerIcon(
      id,
      svg16(
        body,
        'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"',
      ),
    );
  registerWidgetAction({
    id: "journal-back",
    target: "topbar",
    align: "left",
    label: tr("Back to the journal"),
    icon: "journal-back",
    iconOnly: true,
    run: () => handlers.exit(),
  });
  // One button that flips: Vela's layout menu links symbol, interval, crosshair and style,
  // but not the time window.
  registerWidgetAction({
    id: "journal-time-link",
    target: "topbar",
    label: tr("Link the time window: scrolling or zooming one chart moves the others"),
    icon: "journal-time-unlink",
    iconOnly: true,
    when: () => !handlers.timeLinked(),
    run: () => handlers.linkTime(true),
  });
  registerWidgetAction({
    id: "journal-time-unlink",
    target: "topbar",
    label: tr("Time window linked: click to scroll and zoom each chart on its own"),
    icon: "journal-time-link",
    iconOnly: true,
    when: () => handlers.timeLinked(),
    run: () => handlers.linkTime(false),
  });
  registerWidgetAction({
    id: "journal-open",
    target: "topbar",
    label: tr("Open the active chart in Charts (trades, zones, analyses)"),
    icon: "journal-open",
    iconOnly: true,
    run: () => handlers.openInCharts(),
  });
  registerWidgetAction({
    id: "journal-fullscreen",
    target: "topbar",
    label: tr("Full screen"),
    icon: "journal-fullscreen",
    iconOnly: true,
    run: () => handlers.fullscreen(),
  });
  registerWidgetAction({
    id: "journal-start-over",
    target: "context:body",
    label: tr("Start the workspace over"),
    run: () => handlers.startOver(),
  });
}

const dark = () => document.documentElement.classList.contains("dark");

export interface ChartWorkspaceProps {
  sources: WorkspaceSource[];
  /** The saved state document, or null for a new workspace. */
  saved: string | null;
  /** A new workspace's charts (ignored when one is saved). */
  seed: Record<string, { symbol: string; timeframe: string }> | null;
  scripts: ChartScript[];
  timeZone: string;
  onExit: () => void;
  onOpenInCharts: (target: {
    provider: string;
    dataset: string | null;
    symbol: string;
    tf: string | null;
  }) => void;
  onStartOver: () => void;
  /** The economic calendar's events, when it is on (Charts → On the chart). */
  events: EconomicEvent[];
  privacy: boolean;
  onOpenTrade: (key: string) => void;
  onOpenMissed: (id: string) => void;
}

/**
 * The full-screen chart workspace on Vela's workspace: a grid of charts under one shared
 * topbar (symbol, candle size, style, layout and links, indicators), one drawing toolbar for
 * the active chart, maximize, drag to swap, resizable splits. Each chart shows the journal
 * as the Charts page does (your trades, missed trades, sessions, economic events). Saved on
 * the server as you work.
 */
export function ChartWorkspace(props: ChartWorkspaceProps) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const latest = useRef(props);
  latest.current = props;
  /** The journal's marks on each chart, by cell. */
  const overlays = useRef(new Map<string, WorkspaceOverlay>());
  useEffect(() => {
    for (const overlay of overlays.current.values()) overlay.update();
  }, [props.events, props.privacy]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [vela, { VelaWorkspace }, { PineEngine, PineWorkerEngine }] = await Promise.all([
        import("@luxalgo/vela"),
        import("@luxalgo/vela/workspace"),
        import("@luxalgo/vela-pinets"),
        registerContributions(),
      ]);
      if (disposed || !host.current) return;
      const teardown: (() => void)[] = [];
      cleanup = () => {
        while (teardown.length) teardown.pop()!();
      };
      applyPatternFixes(vela);
      applyCalculationFixes(vela);
      const { sources, saved, seed, scripts, timeZone } = latest.current;

      // ── Saving: the latest document goes to the server after a pause ──
      let pending: string | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let workspace: VelaWorkspace | null = null;
      const send = (state: string, leaving: boolean) =>
        (saving = fetch("/api/chart-workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          // A page being closed only finishes small requests; larger ones go as usual.
          keepalive: leaving && state.length < 60_000,
        })
          .then(async (response) => {
            if (!response.ok) {
              const body = (await response.json().catch(() => ({}))) as { error?: string };
              throw new Error(
                body.error
                  ? tr(body.error)
                  : tr("Saving failed ({status}).", { status: response.status }),
              );
            }
          })
          .catch((cause: unknown) => {
            if (!leaving)
              workspace?.toast(
                tr("The workspace was not saved: {reason}", {
                  reason: cause instanceof Error ? cause.message : tr("network error"),
                }),
                "error",
              );
          }));
      const flush = (leaving: boolean) => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (pending === null) return;
        const state = pending;
        pending = null;
        void send(state, leaving);
      };
      let stored = saved;
      const storage = {
        get: () => stored,
        set: (_key: string, value: string) => {
          stored = value;
          pending = value;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => flush(false), SAVE_DELAY_MS);
        },
      };
      const onHide = () => flush(true);
      window.addEventListener("pagehide", onHide);
      teardown.push(() => {
        window.removeEventListener("pagehide", onHide);
        flush(false);
      });

      // ── Pine Script engines: one worker per chart, stopped with its chart ──
      const unassigned: FallbackPineEngine[] = [];
      const enginesByCell = new Map<string, FallbackPineEngine[]>();
      const makeEngine = () => {
        const engine = new FallbackPineEngine(
          new PineWorkerEngine({ props: "strategy" }),
          () => new PineEngine({ props: "strategy" }),
        );
        unassigned.push(engine);
        return engine;
      };
      const claimEngines = (id: string) => {
        if (!unassigned.length) return;
        enginesByCell.set(id, [...(enginesByCell.get(id) ?? []), ...unassigned.splice(0)]);
      };
      teardown.push(() => {
        for (const engine of [...unassigned, ...[...enginesByCell.values()].flat()])
          engine.terminate();
      });

      const providers = Object.fromEntries(
        sources.map((source) => [
          source.name,
          () => {
            const provider = new JournalMarketProvider(
              { provider: source.provider, dataset: source.dataset },
              { onStatus: () => {} },
            );
            teardown.push(() => provider.dispose());
            // The picker's starting rows for this source (searches are added as you type).
            return Object.assign(provider, {
              listSymbols: async () =>
                baselineSymbols([source], [], recentSymbols.read())
                  .map(localizeSymbolRow)
                  .map((row) => ({
                    ticker: row.ticker,
                    description: row.description,
                  })),
            });
          },
        ]),
      );
      const first = seed ? Object.values(seed)[0] : undefined;
      const options: VelaWorkspaceOptions = {
        layout: "4",
        ...(seed ? { cells: seed } : {}),
        ...(first ? { symbol: first.symbol } : {}),
        timeframe: "60",
        timeframes: Object.values(VELA_TIMEFRAME),
        providers,
        engines: { pine: makeEngine },
        // Names stay as written (the workspace re-creates indicators by name); the picker's
        // groups read in the journal's language.
        indicators: workspaceIndicators(scripts).map((item) => ({
          ...item,
          category: tr(item.category),
        })),
        timezone: timeZone,
        theme: dark() ? "dark" : "light",
        live: true,
        volume: true,
        drawings: true,
        sync: { crosshair: true },
        topbar: {
          left: [
            "journal-back",
            "symbol",
            "timeframes",
            "style",
            "layout",
            "journal-time-link",
            "journal-time-unlink",
            "indicators",
            "actions",
            "undo-redo",
          ],
          right: [
            "actions",
            "alerts",
            "panels",
            "journal-open",
            "screenshot",
            "journal-fullscreen",
          ],
        },
        persist: PERSIST_KEY,
        storage,
        autofocus: true,
      };
      workspace = new VelaWorkspace(element, options);
      const ws = workspace;
      teardown.push(() => ws.destroy());
      // Vela registers its native indicators when it starts: give the VWAP its sessions again.
      patchNativeVwap(vela);

      // ── Each chart: the journal's chart fixes, and its engine ──
      const prepared = new WeakSet<Vela>();
      const prepare = (chart: Vela) => {
        if (prepared.has(chart)) return;
        prepared.add(chart);
        // Drawings over the candles; dashes clipped; zoom stops before the chart slows down.
        keepDrawingsOverSeries(chart);
        clipOffscreenDashes(chart.renderer);
        limitChartView(chart.renderer);
        patchVisibleRangeProfile(chart.renderer);
      };
      // The journal on each chart, as on the Charts page (switches read when they change).
      const environment: OverlayEnvironment = {
        options: () => {
          const options = overlayPreference.read();
          return {
            ...options,
            // Zones belong to a saved analysis, which a workspace chart has none of.
            zones: false,
            economic: options.economic && latest.current.events.length > 0,
          };
        },
        events: () => latest.current.events,
        privacy: () => latest.current.privacy,
        onOpenTrade: (key) => latest.current.onOpenTrade(key),
        onOpenMissed: (id) => latest.current.onOpenMissed(id),
      };
      const mark = (id: string, chart: Vela, cellHost: HTMLElement) => {
        overlays.current.get(id)?.dispose();
        overlays.current.set(
          id,
          attachJournalOverlays(vela, chart, cellHost, sources, environment),
        );
      };
      teardown.push(() => {
        for (const overlay of overlays.current.values()) overlay.dispose();
        overlays.current.clear();
      });
      const cells = ws.cells();
      // The engines made while the workspace built its first charts, in the same order.
      cells.forEach((cell, i) => {
        const engine = unassigned[i];
        if (engine) enginesByCell.set(cell.id, [engine]);
        prepare(cell.chart);
        mark(cell.id, cell.chart, cell.host);
      });
      unassigned.splice(0, cells.length);
      const recordMarket = (symbol: string) => {
        const parsed = parseWorkspaceSymbol(symbol, sources);
        if (parsed)
          recentSymbols.add({
            provider: parsed.source.provider,
            dataset: parsed.source.dataset,
            symbol: parsed.symbol,
          });
      };
      const offs = [
        ws.on("cell:created", ({ id }) => {
          claimEngines(id);
          const cell = ws.cell(id);
          if (cell) {
            prepare(cell.chart);
            mark(id, cell.chart, cell.host);
          }
        }),
        ws.on("cell:destroyed", ({ id }) => {
          overlays.current.get(id)?.dispose();
          overlays.current.delete(id);
          for (const engine of enginesByCell.get(id) ?? []) engine.terminate();
          enginesByCell.delete(id);
        }),
      ];
      const watched = new WeakSet<Vela>();
      const watchMarkets = () => {
        for (const cell of ws.cells()) {
          const chart = cell.chart;
          if (watched.has(chart)) continue;
          watched.add(chart);
          offs.push(
            chart.on("market:changed", ({ symbol, prev }) => {
              if (symbol !== prev.symbol) recordMarket(symbol);
            }),
          );
        }
      };
      watchMarkets();
      offs.push(ws.on("cell:created", watchMarkets), ws.on("layout:changed", watchMarkets));
      teardown.push(() => offs.forEach((off) => off()));

      teardown.push(
        attachSymbolSearch(ws, sources, {
          shown: () => ws.cells().map((cell) => cell.symbol),
          recent: () => recentSymbols.read(),
        }),
      );

      // ── The journal's light and dark themes ──
      const observer = new MutationObserver(() => {
        ws.setTheme(dark() ? "dark" : "light");
        for (const overlay of overlays.current.values()) overlay.repaint();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      teardown.push(() => observer.disconnect());

      handlers.timeLinked = () => Boolean(ws.sync.get("viewport"));
      handlers.linkTime = (on) => {
        ws.sync.set("viewport", on);
        ws.refreshActions();
        ws.toast(
          on ? tr("Time window linked across the charts.") : tr("Each chart scrolls on its own."),
        );
      };
      // The button shows the link a saved workspace comes back with.
      ws.refreshActions();
      handlers.exit = () => latest.current.onExit();
      handlers.openInCharts = () => {
        const cell = ws.active;
        const parsed = parseWorkspaceSymbol(cell.symbol, sources);
        if (!parsed) {
          ws.toast(tr("This chart's symbol is not from one of the journal's sources."), "error");
          return;
        }
        latest.current.onOpenInCharts({
          provider: parsed.source.provider,
          dataset: parsed.source.dataset,
          symbol: parsed.symbol,
          tf: resolutionForTimeframe(cell.timeframe),
        });
      };
      handlers.fullscreen = () => {
        const target = root.current;
        if (!target) return;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        else void target.requestFullscreen?.().catch(() => {});
      };
      handlers.startOver = () => {
        if (
          window.confirm(
            tr(
              "Start the workspace over? Its layout, charts, drawings and indicators are removed.",
            ),
          )
        ) {
          // Nothing more is saved from this workspace.
          storage.set = () => {};
          pending = null;
          latest.current.onStartOver();
        }
      };
    })().catch((cause: unknown) => {
      cleanup();
      if (!disposed)
        setError(
          cause instanceof Error && cause.message
            ? tr("The workspace could not start: {reason}", { reason: cause.message })
            : tr("The workspace could not start."),
        );
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div ref={root} className="flex h-full w-full flex-col bg-background">
      {error && (
        <p role="alert" className="p-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div ref={host} className="min-h-0 flex-1" />
    </div>
  );
}
