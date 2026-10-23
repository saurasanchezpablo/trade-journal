import { research } from "@luxalgo/journal-core";
import { deliver } from "../background-alerts/delivery";
import { nowIso } from "../ids";
import { loadInstruments, staleSeries } from "./data";
import {
  getResearchState,
  insertSignal,
  lastSignal,
  loadReport,
  markAlerted,
  pendingAlerts,
  updateResearchState,
} from "./store";

/**
 * The monitor: once the day's candles are stored, each strategy's frozen configuration (the
 * one its research chose before the holdout) decides on the latest closed day. The decision
 * is recorded once (one row per strategy and day, never rewritten) and, when the position
 * changes, an alert goes out once. Nothing is ever sent to an exchange.
 */

const DAY = 86_400_000;
/**
 * A signal recorded within this long after the day closed is treated as executed at that
 * open (the paper ledger's fill is the daily open: up to this much hindsight on the fill
 * price, stated in docs/trading/MONITORING.md). Later than that, it executes at the next
 * day's open, as a late signal would.
 */
export const EXECUTION_GRACE_MS = 30 * 60_000;

export function executionTime(decisionTime: number, generatedAt: number): number {
  const due = decisionTime + DAY;
  return generatedAt <= due + EXECUTION_GRACE_MS ? due : Math.ceil(generatedAt / DAY) * DAY;
}

const sameWeights = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6);
};

export const describeWeights = (weights: Record<string, number>) => {
  const parts = Object.entries(weights)
    .filter(([, w]) => Math.abs(w) > 1e-6)
    .map(([id, w]) => `${w > 0 ? "long" : "short"} ${id} ${Math.round(Math.abs(w) * 100)}%`);
  return parts.length ? parts.join(", ") : "cash";
};

export interface MonitorDeps {
  now: () => number;
  deliver: typeof deliver;
}

/** Record the new signals and send the alerts not sent yet. Returns what it recorded. */
export async function runMonitor(deps: Partial<MonitorDeps> = {}) {
  const now = (deps.now ?? Date.now)();
  const send = deps.deliver ?? deliver;
  const instruments = loadInstruments();
  const stale = staleSeries(instruments, now);
  const recorded: { strategyId: string; decisionTime: number; changed: boolean }[] = [];
  const skipped: { strategyId: string; reason: string }[] = [];
  for (const definition of research.STRATEGIES) {
    const report = loadReport(definition.id)?.report;
    const config = definition.grid.find((g) => g.id === report?.selected?.id);
    if (!report || !config) {
      skipped.push({ strategyId: definition.id, reason: "no research yet" });
      continue;
    }
    const behind = definition.instruments.filter((i) => stale.includes(i));
    if (behind.length) {
      skipped.push({ strategyId: definition.id, reason: `stale data: ${behind.join(", ")}` });
      continue;
    }
    const used = instruments.filter((i) => definition.instruments.includes(i.id as never));
    const decisions = research.decisionsThrough(used, definition.build(config.params), {
      warmup: definition.warmup,
      maxGross: definition.maxGross,
    });
    const last = lastSignal(definition.id);
    // The first run records only the latest day: there is no paper history before it.
    const fresh = last ? decisions.filter((d) => d.time > last.decisionTime) : decisions.slice(-1);
    let previous = last?.weights ?? null;
    for (const d of fresh) {
      const changed = previous !== null && !sameWeights(previous, d.weights);
      const inserted = insertSignal({
        strategyId: definition.id,
        configId: config.id,
        decisionTime: d.time,
        executeAt: executionTime(d.time, now),
        generatedAt: new Date(now).toISOString(),
        weights: d.weights,
        previous,
        changed,
        reason: d.reason ?? "",
        inputs: d.inputs ?? null,
      });
      if (inserted) recorded.push({ strategyId: definition.id, decisionTime: d.time, changed });
      previous = d.weights;
    }
  }
  // Alerts: one per changed signal, retried until sent (or held back by the preferences,
  // which the notification log records); the benchmark never alerts.
  for (const signal of pendingAlerts()) {
    const definition = research.strategyById(signal.strategyId);
    if (definition?.role === "candidate") {
      const day = new Date(signal.decisionTime).toISOString().slice(0, 10);
      try {
        await send(
          {
            title: `${definition.name}: ${describeWeights(signal.weights)}`,
            body: `Paper signal for ${day} (was ${describeWeights(signal.previous ?? {})}). ${signal.reason} Experimental research, not advice; no order is placed.`,
            tag: `strategy-${signal.strategyId}-${signal.decisionTime}`,
            url: `/research/${signal.strategyId}`,
          },
          { kind: "strategy", source: `strategy:${signal.strategyId}` },
        );
      } catch {
        continue;
      }
    }
    markAlerted(signal.strategyId, signal.decisionTime);
  }
  updateResearchState({
    lastMonitorAt: nowIso(),
    stale,
    monitoringSince: getResearchState().monitoringSince ?? nowIso(),
    errors: { ...getResearchState().errors, monitor: undefined },
  });
  return { recorded, skipped, stale };
}
