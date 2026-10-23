import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { research } from "@luxalgo/journal-core";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-research-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const data = await import("../src/server/strategy-research/data");
const store = await import("../src/server/strategy-research/store");
const { runMonitor, executionTime, EXECUTION_GRACE_MS } =
  await import("../src/server/strategy-research/monitor");
const { paperLedger, runResearch } = await import("../src/server/strategy-research/research");
const { runNow } = await import("../src/server/strategy-research/worker");
const actions = await import("../src/app/api/research/actions/route");
const overview = await import("../src/app/api/research/route");
const detail = await import("../src/app/api/research/[id]/route");
const { saveBetaFlags } = await import("../src/server/beta-features");
afterAll(() => {
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const DAY = 86_400_000;
const START = Date.UTC(2022, 0, 1);

/** A deterministic market Binance would serve: daily klines from START, funding every 8 h. */
function market(id: string, upTo: number) {
  const days = Math.floor((upTo - START) / DAY) + 1;
  const scale = id.startsWith("ETH") ? 0.05 : 1;
  const closes = Array.from(
    { length: days },
    (_, i) => 30_000 * scale * Math.exp(Math.sin(i / 40) * 0.4 + i / 2000),
  );
  return closes.map((c, i) => {
    const open = i ? closes[i - 1]! : c;
    return [
      START + i * DAY,
      open,
      Math.max(open, c) * 1.01,
      Math.min(open, c) * 0.99,
      c,
      100,
      START + (i + 1) * DAY - 1,
    ];
  });
}

/** A fake of the three Binance endpoints, honouring startTime and limit; records the URLs. */
function fakeBinance(now: () => number) {
  const urls: string[] = [];
  data.fetcher.json = async (url: string) => {
    urls.push(url);
    const u = new URL(url);
    const from = Number(u.searchParams.get("startTime"));
    const limit = Number(u.searchParams.get("limit"));
    if (u.pathname.endsWith("fundingRate")) {
      const out = [];
      for (let t = START + 1; t <= now() && out.length < limit; t += 8 * 3_600_000)
        if (t >= from) out.push({ symbol: "BTCUSDT", fundingTime: t, fundingRate: "0.0003" });
      return out;
    }
    const symbol = u.searchParams.get("symbol")!;
    // The day still trading is served too (its close time is in the future).
    return market(symbol, now())
      .filter((row) => (row[0] as number) >= from)
      .slice(0, limit)
      .map((row) => row.map(String));
  };
  return urls;
}

const clearAll = () => {
  const c = store.client();
  for (const table of [
    "sr_series",
    "sr_bars",
    "sr_funding",
    "sr_reports",
    "sr_trials",
    "sr_signals",
  ])
    c.prepare(`DELETE FROM ${table}`).run();
  store.saveResearchSettings(store.DEFAULT_RESEARCH);
  store.updateResearchState({
    monitoringSince: null,
    lastRefreshAt: null,
    lastResearchAt: null,
    errors: {},
    stale: [],
    running: null,
  });
};

beforeEach(() => {
  saveBetaFlags({ videoIntelligence: true, strategyResearch: true });
  vi.stubEnv("JOURNAL_PASSWORD", "");
  clearAll();
});

describe("market data", () => {
  const now = Date.UTC(2026, 9, 23, 6, 0);

  it("stores only closed daily candles and refuses malformed ones", () => {
    const rows = [
      [Date.UTC(2026, 9, 21), "1", "2", "0.5", "1.5", "10", Date.UTC(2026, 9, 22) - 1],
      [Date.UTC(2026, 9, 23), "1", "2", "0.5", "1.5", "10", Date.UTC(2026, 9, 24) - 1],
    ];
    expect(data.parseKlines(rows, now).map((b) => b.time)).toEqual([Date.UTC(2026, 9, 21)]);
    const highBelowClose = [
      [Date.UTC(2026, 9, 21), "1", "1.2", "0.5", "1.5", "10", Date.UTC(2026, 9, 22) - 1],
    ];
    expect(() => data.parseKlines(highBelowClose, now)).toThrow(/Invalid daily candle/);
    const zero = [[Date.UTC(2026, 9, 21), "0", "2", "0", "1.5", "10", Date.UTC(2026, 9, 22) - 1]];
    expect(() => data.parseKlines(zero, now)).toThrow(/Invalid daily candle/);
    expect(() => data.parseKlines({ code: -1121 }, now)).toThrow(/Unexpected candle list/);
  });

  it("refuses a funding rate that cannot be real", () => {
    expect(() => data.parseFunding([{ fundingTime: 1, fundingRate: "0.5" }])).toThrow();
    expect(data.parseFunding([{ fundingTime: 1, fundingRate: "-0.0001" }])).toEqual([
      { time: 1, rate: -0.0001 },
    ]);
  });

  it("downloads everything once, then only what is newer, without duplicates", async () => {
    let clock = Date.UTC(2026, 9, 20, 3, 0);
    const urls = fakeBinance(() => clock);
    await data.refreshAll(clock);
    const first = data.loadInstruments();
    const btc = first.find((i) => i.id === "BTC-SPOT")!;
    expect(btc.bars[btc.bars.length - 1]!.time).toBe(Date.UTC(2026, 9, 19));
    expect(new Set(btc.bars.map((b) => b.time)).size).toBe(btc.bars.length);
    clock += 2 * DAY;
    urls.length = 0;
    await data.refreshAll(clock);
    // The second refresh asks from the last stored day on.
    expect(urls.find((u) => u.includes("api/v3/klines") && u.includes("BTCUSDT"))).toContain(
      `startTime=${Date.UTC(2026, 9, 19)}`,
    );
    const again = data.loadInstruments().find((i) => i.id === "BTC-SPOT")!;
    expect(again.bars.length).toBe(btc.bars.length + 2);
    const series = store.listSeries().find((s) => s.series === "binance:spot:BTCUSDT:1d")!;
    expect(series.provider).toBe("binance");
    expect(series.endpoint).toContain("data-api.binance.vision");
    expect(series.rows).toBe(again.bars.length);
  });

  it("calls a series stale once its last closed day is before yesterday", () => {
    const bars = [{ time: Date.UTC(2026, 9, 20), open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    const inst = [{ id: "BTC-SPOT", kind: "spot" as const, bars }];
    expect(data.staleSeries(inst, Date.UTC(2026, 9, 21, 12))).toEqual([]);
    expect(data.staleSeries(inst, Date.UTC(2026, 9, 22, 12))).toEqual(["BTC-SPOT"]);
  });
});

describe("signals and the paper ledger", () => {
  /** Data up to `clock` and a stored report choosing the first configuration of each strategy. */
  async function setup(clock: number) {
    fakeBinance(() => clock);
    await data.refreshAll(clock);
    for (const s of research.STRATEGIES)
      store.saveReport({
        strategyId: s.id,
        selected: { id: s.grid[0]!.id, label: s.grid[0]!.label },
        configs: [],
        verdict: "experimental",
        engineVersion: research.RESEARCH_ENGINE_VERSION,
        catalogVersion: research.CATALOG_VERSION,
        evaluationVersion: research.EVALUATION_VERSION,
        costs: research.DEFAULT_COSTS,
        dataThrough: clock,
      } as never);
  }

  it("records one signal per strategy and day, however often the monitor runs", async () => {
    const clock = Date.UTC(2026, 9, 23, 0, 10);
    await setup(clock);
    const deliver = vi.fn(async () => 1);
    await runMonitor({ now: () => clock, deliver });
    await runMonitor({ now: () => clock, deliver });
    for (const s of research.STRATEGIES) {
      const signals = store.listSignals(s.id);
      expect(signals).toHaveLength(1);
      expect(signals[0]!.decisionTime).toBe(Date.UTC(2026, 9, 22));
      expect(signals[0]!.changed).toBe(false);
    }
    // The first signal is a starting position, not a change: no alert.
    expect(deliver).not.toHaveBeenCalled();
  });

  it("a signal recorded soon after the close executes at that open; a late one at the next", () => {
    const decided = Date.UTC(2026, 9, 22);
    expect(executionTime(decided, decided + DAY + EXECUTION_GRACE_MS)).toBe(decided + DAY);
    expect(executionTime(decided, decided + DAY + EXECUTION_GRACE_MS + 1)).toBe(decided + 2 * DAY);
  });

  it("after a restart, the missed days are recorded as late signals and each change alerts once", async () => {
    let clock = Date.UTC(2026, 3, 1, 0, 10);
    await setup(clock);
    const deliver = vi.fn(async () => 1);
    await runMonitor({ now: () => clock, deliver });
    // The server was off for 60 days.
    clock += 60 * DAY;
    fakeBinance(() => clock);
    await data.refreshAll(clock);
    await runMonitor({ now: () => clock, deliver });
    const trend = store.listSignals("btc-sma-trend");
    expect(trend).toHaveLength(61);
    // Recorded at 00:10 on 31 May: the 30 May decision is on time, the missed ones are late.
    expect(trend[60]!.executeAt).toBe(Date.UTC(2026, 4, 31));
    expect(trend.slice(1, 60).every((s) => s.executeAt === Date.UTC(2026, 5, 1))).toBe(true);
    // The paper position from then on is the newest decision, never a late older one.
    const replay = research.replaySignals(trend);
    const view = (time: number) => ({ index: 0, time, bars: {}, funding: {}, current: {} });
    expect(replay(view(Date.UTC(2026, 4, 31))).weights).toEqual(trend[60]!.weights);
    const changes = research.STRATEGIES.filter((s) => s.role === "candidate").flatMap((s) =>
      store.listSignals(s.id).filter((x) => x.changed),
    );
    expect(changes.length).toBeGreaterThan(0);
    expect(deliver).toHaveBeenCalledTimes(changes.length);
    expect(store.pendingAlerts()).toEqual([]);
    const calls = deliver.mock.calls as unknown as [
      { title: string; body: string },
      { kind: string },
    ][];
    expect(
      calls.every(([n, meta]) => meta.kind === "strategy" && /no order is placed/.test(n.body)),
    ).toBe(true);
  });

  it("an alert that could not be sent is retried on the next run, and only then marked sent", async () => {
    let clock = Date.UTC(2026, 3, 1, 0, 10);
    await setup(clock);
    await runMonitor({ now: () => clock, deliver: async () => 1 });
    clock += 30 * DAY;
    fakeBinance(() => clock);
    await data.refreshAll(clock);
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    await runMonitor({ now: () => clock, deliver: failing });
    const pending = store.pendingAlerts().length;
    expect(pending).toBeGreaterThan(0);
    const working = vi.fn(async () => 1);
    await runMonitor({ now: () => clock, deliver: working });
    expect(working).toHaveBeenCalledTimes(pending);
    expect(store.pendingAlerts()).toEqual([]);
  });

  it("stale data skips the strategies that use it instead of recording a stale signal", async () => {
    const clock = Date.UTC(2026, 9, 23, 0, 10);
    await setup(clock - 3 * DAY);
    const result = await runMonitor({ now: () => clock, deliver: async () => 1 });
    expect(result.recorded).toEqual([]);
    expect(result.skipped.length).toBe(research.STRATEGIES.length);
    expect(store.getResearchState().stale).toContain("BTC-SPOT");
  });

  it("the paper ledger replays exactly the recorded signals, from the first execution on", async () => {
    let clock = Date.UTC(2026, 3, 1, 0, 10);
    await setup(clock);
    await runMonitor({ now: () => clock, deliver: async () => 1 });
    for (let d = 0; d < 20; d++) {
      clock += DAY;
      fakeBinance(() => clock);
      await data.refreshAll(clock);
      await runMonitor({ now: () => clock, deliver: async () => 1 });
    }
    const signals = store.listSignals("btc-sma-trend");
    expect(signals).toHaveLength(21);
    const paper = paperLedger("btc-sma-trend")!;
    expect(paper.category).toBe("paper");
    expect(paper.from).toBe(signals[0]!.executeAt);
    // Held on each paper day: the latest signal executable by that day's open.
    const instruments = data.loadInstruments();
    const btc = instruments.filter((i) => i.id === "BTC-SPOT");
    const run = research.runBacktest(btc, research.replaySignals(signals), {
      from: signals[0]!.executeAt - DAY,
    });
    expect(paper.metrics.totalReturn).toBeCloseTo(
      run.days.filter((d) => d.time >= signals[0]!.executeAt).reduce((g, d) => g * (1 + d.ret), 1) -
        1,
      12,
    );
    expect(paperLedger("btc-tsmom", instruments, [])).toBeNull();
  }, 60_000);
});

describe("the research runner and the API", () => {
  it("evaluates every strategy, stores the reports and counts every configuration as a trial", async () => {
    const clock = Date.UTC(2026, 9, 23, 0, 10);
    fakeBinance(() => clock);
    await data.refreshAll(clock);
    const reports = await runResearch(undefined, undefined, { holdoutFrom: Date.UTC(2026, 0, 1) });
    expect(reports.map((r) => r.strategyId)).toEqual(research.STRATEGIES.map((s) => s.id));
    for (const s of research.STRATEGIES) {
      expect(store.loadReport(s.id)!.report.selected).not.toBeNull();
      expect(store.trialCount(s.id).distinct).toBe(s.grid.length);
    }
    const body = (await (await overview.GET()).json()) as {
      strategies: { id: string; verdict: string }[];
    };
    expect(body.strategies.find((s) => s.id === "btc-buy-hold")!.verdict).toBe("benchmark");
    const one = await detail.GET(new Request("http://localhost/api/research/btc-tsmom"), {
      params: Promise.resolve({ id: "btc-tsmom" }),
    });
    expect(((await one.json()) as { report: { strategyId: string } }).report.strategyId).toBe(
      "btc-tsmom",
    );
  }, 60_000);

  it("refuses unknown actions, unknown strategies and out-of-range costs", async () => {
    const post = (body: unknown) =>
      actions.POST(
        new Request("http://localhost/api/research/actions", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    expect((await post({ action: "trade" })).status).toBe(400);
    const missing = await detail.GET(new Request("http://localhost/api/research/x"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(missing.status).toBe(404);
    const put = (body: unknown) =>
      overview.PUT(
        new Request("http://localhost/api/research", { method: "PUT", body: JSON.stringify(body) }),
      );
    expect((await put({ spotFeeBps: -1 })).status).toBe(400);
    expect((await put({ cashRatePct: 50 })).status).toBe(400);
    expect((await put({ spotFeeBps: 7.5, cashRatePct: 4 })).status).toBe(200);
    expect(store.getResearchSettings()).toMatchObject({
      spotFeeBps: 7.5,
      cashRatePct: 4,
      monitoring: false,
    });
    // Monitoring is switched by the actions, never by the settings.
    await put({ monitoring: true });
    expect(store.getResearchSettings().monitoring).toBe(false);
  });

  it("a second run while one is going on is refused rather than run twice", async () => {
    let release = () => {};
    const slow = () =>
      new Promise<Record<string, number>>((resolve) => (release = () => resolve({})));
    const first = runNow("refresh", { refresh: slow });
    expect(await runNow("refresh", { refresh: slow })).toEqual({
      ok: false,
      error: "Already running; try again in a moment.",
    });
    release();
    expect(await first).toEqual({ ok: true });
    expect(store.getResearchState().running).toBeNull();
  });

  it("a failed download is recorded and cleared by the next one that succeeds", async () => {
    const result = await runNow("refresh", {
      refresh: async () => {
        throw new Error("Market data request failed or timed out. Try again.");
      },
    });
    expect(result.ok).toBe(false);
    expect(store.getResearchState().errors.refresh).toMatch(/timed out/);
    await runNow("refresh", { refresh: async () => ({}) });
    expect(store.getResearchState().errors.refresh).toBeUndefined();
  });
});
