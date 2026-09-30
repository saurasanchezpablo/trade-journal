import { getTimeZone } from "../settings";
import { dueDigests } from "./schedule";
import { getDigest, getDigestSettings, releaseInterrupted } from "./store";
import { runDigest, type DigestDeps } from "./run";

/**
 * Checks once a minute whether a scheduled digest is due, and writes it. Digests are opt-in
 * (off until switched on under Daily journal → Scheduled digests); the check itself reads
 * two settings and is cheap. One digest is written at a time.
 */
const CHECK_MS = 60_000;

export class DigestScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(private readonly options: { now?: () => number; deps?: Partial<DigestDeps> } = {}) {}

  start() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), CHECK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Write whatever is due and not yet claimed. Resolves when done. */
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      // A digest cut short by a restart shows as failed and can be sent again.
      releaseInterrupted();
      const settings = getDigestSettings();
      if (!settings.recap.enabled && !settings.weekly.enabled) return;
      const now = (this.options.now ?? Date.now)();
      for (const { kind, period } of dueDigests(settings, now, getTimeZone())) {
        if (getDigest(kind, period)) continue;
        await runDigest(kind, period, { deps: this.options.deps });
      }
    } catch {
      // A failed check is retried on the next tick; a failed digest records its reason.
    } finally {
      this.busy = false;
    }
  }
}

// On globalThis, like the alert watcher: the startup hook and API routes are separate
// module graphs in Next.js.
const globalForDigests = globalThis as unknown as { __journalDigests?: DigestScheduler };

export function startDigestScheduler(): DigestScheduler {
  if (!globalForDigests.__journalDigests) {
    const scheduler = new DigestScheduler();
    scheduler.start();
    globalForDigests.__journalDigests = scheduler;
  }
  return globalForDigests.__journalDigests;
}
