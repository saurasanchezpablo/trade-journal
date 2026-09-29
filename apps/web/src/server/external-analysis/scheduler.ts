import { clockTime, dayKeyOf } from "@luxalgo/journal-core";
import { getTimeZone } from "../settings";
import { runCheck, type ProcessDeps } from "./process";
import { getExternalSettings, lastDailyRun, listChannels, markDailyRun } from "./store";

/**
 * Every day at the chosen time (journal timezone) the channels' feeds are read and new videos
 * summarised; if the server was off at that time, it runs when the server is next up that
 * day. Between daily checks, videos waiting for captions are retried as they fall due.
 */
const TICK_MS = 15 * 60_000;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Whether today's daily check is due at `now`. */
export function dailyDue(now: number, timeZone: string, checkTime: string, lastRun: string | null) {
  const iso = new Date(now).toISOString();
  const today = dayKeyOf(iso, timeZone);
  return {
    due: lastRun !== today && minutes(clockTime(iso, timeZone)) >= minutes(checkTime),
    today,
  };
}

export class ExternalScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly options: { deps?: Partial<ProcessDeps> } = {}) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Run what is due. Resolves when done; a tick while one runs does nothing. */
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!listChannels().some((c) => c.enabled)) return;
      const now = (this.options.deps?.now ?? Date.now)();
      const { due, today } = dailyDue(
        now,
        getTimeZone(),
        getExternalSettings().checkTime,
        lastDailyRun(),
      );
      if (due) markDailyRun(today);
      await runCheck({ feeds: due, deps: this.options.deps });
    } catch {
      // Retried on the next tick; each video records its own failure.
    } finally {
      this.running = false;
    }
  }

  get busy() {
    return this.running;
  }
}

const globalForExternal = globalThis as unknown as { __journalExternal?: ExternalScheduler };

export function startExternalScheduler(): ExternalScheduler {
  if (!globalForExternal.__journalExternal) {
    const scheduler = new ExternalScheduler();
    scheduler.start();
    globalForExternal.__journalExternal = scheduler;
  }
  return globalForExternal.__journalExternal;
}

export const runningExternalScheduler = () => globalForExternal.__journalExternal ?? null;
