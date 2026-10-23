import { nowIso } from "../ids";
import { refreshAll } from "./data";
import { runMonitor, type MonitorDeps } from "./monitor";
import { researchOutdated, runResearch } from "./research";
import { getResearchSettings, getResearchState, updateResearchState } from "./store";
import { betaEnabled } from "../beta-features";

/**
 * Background work for strategy research, started from instrumentation-node.ts and idle until
 * monitoring is started on the Research page. Every tick (10 minutes): download the candles
 * that closed since the last refresh, re-run the research when it is missing, outdated or a
 * week old, then record the day's signals. A tick while one runs does nothing; a server
 * restart simply resumes on the next tick (every step is idempotent).
 */
const TICK_MS = 10 * 60_000;
const DAY = 86_400_000;
const RESEARCH_EVERY_MS = 7 * DAY;
/** Minimum gap between refreshes when nothing new is expected. */
const REFRESH_EVERY_MS = 6 * 3_600_000;

const shared = globalThis as unknown as { __srBusy?: boolean; __srWorker?: ResearchWorker };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Run one step, recording it as running and its error, if any. */
async function step<T>(
  name: "refresh" | "research" | "monitor",
  run: () => Promise<T>,
): Promise<T | null> {
  updateResearchState({ running: name });
  try {
    const result = await run();
    const errors = { ...getResearchState().errors };
    delete errors[name];
    updateResearchState({ errors });
    return result;
  } catch (error) {
    updateResearchState({ errors: { ...getResearchState().errors, [name]: message(error) } });
    return null;
  } finally {
    updateResearchState({ running: null });
  }
}

export interface WorkerDeps extends MonitorDeps {
  refresh: typeof refreshAll;
}

/** Download, research and monitor now, whatever the schedule (the page's buttons). */
export async function runNow(
  what: "refresh" | "research",
  deps: Partial<WorkerDeps> = {},
): Promise<{ ok: boolean; error?: string }> {
  if (shared.__srBusy) return { ok: false, error: "Already running; try again in a moment." };
  shared.__srBusy = true;
  try {
    const refreshed = await step("refresh", () => (deps.refresh ?? refreshAll)());
    if (refreshed) updateResearchState({ lastRefreshAt: nowIso() });
    if (what === "research") {
      const done = await step("research", () => runResearch());
      if (done) updateResearchState({ lastResearchAt: nowIso() });
    }
    if (getResearchSettings().monitoring) await step("monitor", () => runMonitor(deps));
    const errors = getResearchState().errors;
    const error = errors.refresh ?? errors.research ?? errors.monitor;
    return error ? { ok: false, error } : { ok: true };
  } finally {
    shared.__srBusy = false;
  }
}

export class ResearchWorker {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: Partial<WorkerDeps> = {}) {}

  start() {
    // A step the last process left marked as running did not finish.
    if (getResearchState().running) updateResearchState({ running: null });
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    // A beta feature: switched off in Settings, monitoring waits.
    if (shared.__srBusy || !betaEnabled("strategyResearch") || !getResearchSettings().monitoring)
      return;
    shared.__srBusy = true;
    try {
      const now = (this.deps.now ?? Date.now)();
      const state = getResearchState();
      const lastRefresh = state.lastRefreshAt ? Date.parse(state.lastRefreshAt) : 0;
      // A new day closes at midnight UTC: refresh after it, or every few hours anyway.
      const newDay = Math.floor(now / DAY) > Math.floor(lastRefresh / DAY);
      if (newDay || now - lastRefresh >= REFRESH_EVERY_MS || state.errors.refresh) {
        const refreshed = await step("refresh", () => (this.deps.refresh ?? refreshAll)(now));
        if (refreshed) updateResearchState({ lastRefreshAt: nowIso() });
      }
      const lastResearch = state.lastResearchAt ? Date.parse(state.lastResearchAt) : 0;
      if (researchOutdated() || now - lastResearch >= RESEARCH_EVERY_MS) {
        const done = await step("research", () => runResearch());
        if (done) updateResearchState({ lastResearchAt: nowIso() });
      }
      await step("monitor", () => runMonitor(this.deps));
    } finally {
      shared.__srBusy = false;
    }
  }
}

export function startResearchWorker(): ResearchWorker {
  if (!shared.__srWorker) {
    const worker = new ResearchWorker();
    worker.start();
    shared.__srWorker = worker;
  }
  return shared.__srWorker;
}

/** Run a tick now (after starting monitoring), in the background. */
export const kickResearchWorker = () => void shared.__srWorker?.tick();
