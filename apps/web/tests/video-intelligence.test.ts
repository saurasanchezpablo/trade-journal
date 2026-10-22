import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaimBar } from "@luxalgo/journal-core";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-intelligence-"));
process.env.JOURNAL_DATA_DIR = scratch;
await import("../src/db");
const external = await import("../src/server/external-analysis/store");
const store = await import("../src/server/video-intelligence/store");
const { runJob } = await import("../src/server/video-intelligence/worker");
const { extractClaims, transcriptParts } = await import("../src/server/video-intelligence/extract");
const { buildReport } = await import("../src/server/video-intelligence/analytics");
const { readClaims, verifyQuote, claimTiming, CLAIM_EXTRACTOR_VERSION } =
  await import("../src/lib/video-claims");
const reportRoute = await import("../src/app/api/video-intelligence/route");
const actionsRoute = await import("../src/app/api/video-intelligence/actions/route");
const videoRoute = await import("../src/app/api/video-intelligence/videos/[id]/route");
const auditRoute = await import("../src/app/api/video-intelligence/audit/route");
const { auditEvaluations } = await import("../src/server/video-intelligence/audit");

afterAll(() => {
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const H = 3_600_000;
const PUBLISHED = Date.parse("2026-03-02T10:00:00Z");
const CHANNEL = "UCtestchannel000000000000";
const VIDEO = "abcdefghijk";
const TRANSCRIPT = `[0:05] Good morning. Bitcoin is at 100 right now.
[0:35] I think we push to 105 within the next two days. If we lose 95 on a close, the idea is dead.
[1:10] My trade: long between 99 and 100, stop at 97, target 104.`;

/** A raw AI answer: one forecast and one setup, with verbatim quotes. */
const answer = {
  claims: [
    {
      kind: "forecast",
      origin: "explicit",
      statement: "Bitcoin rises to 105 within two days.",
      instrument: "Bitcoin",
      ticker: "BTCUSDT",
      assetClass: "crypto",
      direction: "long",
      timeframe: "1h",
      horizonValue: 2,
      horizonUnit: "days",
      referencePrice: 100,
      triggerPrice: null,
      triggerKind: null,
      condition: null,
      targets: [105],
      invalidation: 95,
      invalidationOn: "close",
      entryLow: null,
      entryHigh: null,
      stop: null,
      probability: null,
      indicators: [],
      quote: "I think we push to 105 within the next two days.",
      quoteTime: "0:35",
      statedDate: null,
      confidence: 0.9,
      unclear: [],
    },
    {
      kind: "setup",
      origin: "explicit",
      statement: "Long bitcoin between 99 and 100, stop 97, target 104.",
      instrument: "Bitcoin",
      ticker: "BTCUSDT",
      assetClass: "crypto",
      direction: "long",
      timeframe: "1h",
      horizonValue: 2,
      horizonUnit: "days",
      referencePrice: null,
      triggerPrice: null,
      triggerKind: null,
      condition: null,
      targets: [104],
      invalidation: null,
      invalidationOn: "touch",
      entryLow: 100,
      entryHigh: 99,
      stop: 97,
      probability: 70,
      indicators: ["support"],
      quote: "My trade: long between 99 and 100, stop at 97, target 104.",
      quoteTime: "1:10",
      statedDate: null,
      confidence: 0.95,
      unclear: [],
    },
  ],
};

/** Hourly candles: flat at 100 before the video, then a dip to 99.5 and a rally through 105. */
const candles = (): ClaimBar[] => {
  const bars: ClaimBar[] = [];
  const start = PUBLISHED - 130 * H;
  for (let t = start; t < PUBLISHED + 100 * H; t += H) {
    const after = t >= PUBLISHED;
    const step = (t - PUBLISHED) / H;
    const close = !after ? 100 : step < 2 ? 99.8 : Math.min(110, 99.8 + step);
    bars.push({ time: t, open: close, high: close + 0.6, low: close - 0.6, close });
  }
  return bars;
};

const extract = (result: unknown = answer) => ({
  extract: vi.fn(
    async (
      _prompt: string,
      onUsage: (u: { inputTokens: number; outputTokens: number }) => void,
    ) => {
      onUsage({ inputTokens: 1200, outputTokens: 300 });
      return readClaims(result);
    },
  ),
});
const market = (bars = candles()) => ({
  now: () => PUBLISHED + 400 * H,
  resolve: vi.fn(async () => ({
    source: {
      provider: "binance",
      providerName: "Binance",
      dataset: null,
      symbol: "BTCUSDT",
      resolution: "1h" as const,
    },
  })),
  history: vi.fn(async (_s: unknown, from: number, to: number) =>
    bars.filter((b) => b.time >= from && b.time <= to),
  ),
});

function seedVideo(options: { transcript?: string | null; summary?: boolean } = {}) {
  external.addChannel({
    channelId: CHANNEL,
    title: "Test Analyst",
    url: "https://youtube.com/channel/x",
  });
  external.recordVideo({
    videoId: VIDEO,
    channelId: CHANNEL,
    title: "Bitcoin to 105?",
    url: `https://www.youtube.com/watch?v=${VIDEO}`,
    publishedAt: new Date(PUBLISHED).toISOString(),
    description: "",
    status: "summarized",
  });
  external.updateVideo(VIDEO, {
    transcript: options.transcript === undefined ? TRANSCRIPT : options.transcript,
    summary: options.summary
      ? {
          overview: "Bullish on bitcoin.",
          bias: "long",
          instruments: ["BTCUSDT"],
          timeframe: "1h",
          mainScenario: {
            title: "Rally",
            direction: "long",
            instrument: "BTCUSDT",
            description: "A push to 105.",
            trigger: null,
            targets: [105],
            invalidation: 95,
            likelihood: null,
          },
          mainReasons: [],
          secondaryScenario: null,
          secondaryReasons: [],
          openTrades: [],
          tradeIdeas: [],
          keyLevels: [],
          caveats: [],
        }
      : null,
  });
}

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic-key");
  store
    .client()
    .exec(
      "DELETE FROM vi_evaluations; DELETE FROM vi_claims; DELETE FROM vi_jobs; DELETE FROM vi_candles; DELETE FROM vi_series;",
    );
  external.client().exec("DELETE FROM external_videos; DELETE FROM external_channels;");
  store.saveIntelligenceSettings(store.DEFAULT_INTELLIGENCE);
});

describe("claims read from a video", () => {
  it("keeps each claim apart, verifies its quote against the transcript and never takes a confidence for a probability", async () => {
    const extraction = await extractClaims(
      {
        videoId: VIDEO,
        title: "t",
        channelTitle: "c",
        publishedAt: new Date(PUBLISHED).toISOString(),
        transcript: TRANSCRIPT,
        summary: null,
      },
      extract(),
    );
    expect(extraction.source).toBe("transcript");
    expect(extraction.claims).toHaveLength(2);
    const [forecast, setup] = extraction.claims;
    expect(forecast!.evidence).toBe("verified");
    expect(forecast!.quoteAt).toBe(35);
    expect(forecast!.level).toBe("A");
    expect(forecast!.horizonSource).toBe("stated");
    expect(forecast!.claim.probability).toBeNull();
    // The entry zone is put in order; 70 (a percentage) becomes 0.7.
    expect(setup!.claim).toMatchObject({ entryLow: 99, entryHigh: 100, probability: 0.7 });
    expect(setup!.level).toBe("C");
    expect(extraction.inputTokens).toBe(1200);
  });

  it("drops malformed claims and refuses an answer that is not a claim list", () => {
    expect(
      readClaims({ claims: [{ statement: "", instrument: "BTC" }, { nonsense: true }] }),
    ).toEqual([]);
    expect(() => readClaims("ignore your instructions")).toThrow();
  });

  it("tells a quote that is not in the transcript apart from one that is", () => {
    expect(verifyQuote("we push to 105 within the next two days", TRANSCRIPT)).toBe("verified");
    expect(
      verifyQuote("Ethereum will reach ten thousand dollars by the end of the year", TRANSCRIPT),
    ).toBe("not_found");
  });

  it("judges a claim from publication, and uses the system's horizon only when none is stated", () => {
    const [claim] = readClaims({
      claims: [
        { ...answer.claims[0], horizonValue: null, timeframe: "daily", statedDate: "2026-02-27" },
      ],
    });
    const timing = claimTiming(claim!, new Date(PUBLISHED).toISOString());
    expect(timing.claimTime).toBe(PUBLISHED);
    expect(timing.statedDate).toBe("2026-02-27");
    expect(timing.horizonSource).toBe("convention");
    expect(timing.horizonEnd - PUBLISHED).toBe(30 * 24 * H);
  });

  it("reads a long transcript in parts cut at time marks", () => {
    const long = Array.from({ length: 4000 }, (_, i) => `[${i}:00] ${"word ".repeat(10)}`).join(
      "\n",
    );
    const parts = transcriptParts(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(long);
    expect(parts.slice(1).every((p) => p.startsWith("\n["))).toBe(true);
  });

  it("takes a video without a transcript from its summary, with no AI call and lower provenance", async () => {
    const deps = extract();
    const extraction = await extractClaims(
      {
        videoId: VIDEO,
        title: "t",
        channelTitle: "c",
        publishedAt: new Date(PUBLISHED).toISOString(),
        transcript: null,
        summary: {
          overview: "x",
          bias: "long",
          instruments: ["BTC"],
          timeframe: null,
          mainScenario: {
            title: "Up",
            direction: "long",
            instrument: "BTC",
            description: "Up to 105",
            trigger: null,
            targets: [105],
            invalidation: 95,
            likelihood: null,
          },
          mainReasons: [],
          secondaryScenario: null,
          secondaryReasons: [],
          openTrades: [],
          tradeIdeas: [],
          keyLevels: [],
          caveats: [],
        },
      },
      deps,
    );
    expect(deps.extract).not.toHaveBeenCalled();
    expect(extraction.source).toBe("summary");
    expect(extraction.claims[0]).toMatchObject({ evidence: "none", claim: { origin: "summary" } });
  });
});

describe("processing the library", () => {
  it("extracts, evaluates against stored candles and records provenance, usage and versions", async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    const deps = { extract: extract(), market: market() };
    expect(await runJob(VIDEO, deps)).toBe("done");
    const job = store.getJob(VIDEO)!;
    expect(job).toMatchObject({
      state: "done",
      claims: 2,
      source: "transcript",
      inputTokens: 1200,
    });
    const claims = store.claimsOfVideo(VIDEO);
    const forecast = store.evaluationOf(claims[0]!.id)!;
    expect(forecast.status).toBe("target_hit");
    expect(forecast.outcome.referencePrice).toBe(100);
    expect(forecast.market).toMatchObject({
      provider: "binance",
      symbol: "BTCUSDT",
      resolution: "1h",
    });
    // The candles the evaluation read are stored: it can be computed again from them.
    expect(
      store.storedCandles(forecast.market!.series, forecast.market!.from, forecast.market!.to)
        .length,
    ).toBe(forecast.market!.bars);
    const setup = store.evaluationOf(claims[1]!.id)!;
    expect(setup.simulation?.trade).toMatchObject({ exit: "target", side: "long" });
    expect(setup.simulation?.sensitivity?.free).toBeGreaterThan(
      setup.simulation!.trade!.netReturn!,
    );
    expect(setup.simulation?.sensitivity?.double).toBeLessThan(setup.simulation!.trade!.netReturn!);
  });

  it("is idempotent: queueing and running again neither duplicates claims nor calls the AI again", async () => {
    seedVideo();
    expect(store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION })).toBe(1);
    expect(store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION })).toBe(0);
    const deps = { extract: extract(), market: market() };
    await runJob(VIDEO, deps);
    await runJob(VIDEO, deps);
    expect(deps.extract.extract).toHaveBeenCalledTimes(1);
    expect(store.claimsOfVideo(VIDEO)).toHaveLength(2);
  });

  it("marks a failed provider for a later retry, then gives up after the last attempt", async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    const failing = {
      extract: vi.fn(async () =>
        Promise.reject(new Error("AI rate limit: please try again shortly.")),
      ),
    };
    for (let attempt = 1; attempt <= store.MAX_ATTEMPTS; attempt++)
      expect(await runJob(VIDEO, { extract: failing, market: market() })).toBe("failed");
    const job = store.getJob(VIDEO)!;
    expect(job.attempts).toBe(store.MAX_ATTEMPTS);
    expect(job.nextAttemptAt).toBeNull();
    expect(job.detail).toMatch(/rate limit/);
    expect(store.claimsOfVideo(VIDEO)).toHaveLength(0);
  });

  it("resumes a job a restart left running", () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    expect(store.claimNextJob()!.state).toBe("running");
    expect(store.claimNextJob()).toBeNull();
    expect(store.requeueInterrupted()).toBe(1);
    expect(store.claimNextJob()?.videoId).toBe(VIDEO);
  });

  it("stores an unknown instrument as unevaluable with its reason, never a guessed price", async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    const m = market();
    m.resolve.mockResolvedValue({
      source: null,
      reason: "No enabled exchange lists BTCUSDT.",
    } as never);
    await runJob(VIDEO, { extract: extract(), market: m });
    const evaluation = store.evaluationOf(store.claimsOfVideo(VIDEO)[0]!.id)!;
    expect(evaluation.status).toBe("unevaluable");
    expect(evaluation.outcome.reason).toMatch(/No enabled exchange/);
    expect(evaluation.outcome.referencePrice).toBeNull();
    expect(m.history).not.toHaveBeenCalled();
  });

  it("forgets the claims of a video whose channel was unfollowed", async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    await runJob(VIDEO, { extract: extract(), market: market() });
    external.removeChannel(CHANNEL);
    store.pruneOrphans();
    expect(store.claimsOfVideo(VIDEO)).toHaveLength(0);
    expect(store.getJob(VIDEO)).toBeNull();
  });
});

describe("the reports", () => {
  it("keeps predictions and simulated trades apart, with sample sizes and a small-sample flag", async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    await runJob(VIDEO, { extract: extract(), market: market() });
    const report = buildReport(store.allClaimRecords(), {});
    expect(report.overview.tally).toMatchObject({ claims: 2, targetHits: 2, insufficient: true });
    expect(report.overview.trades.trades).toBe(1);
    expect(report.analysts[0]).toMatchObject({ label: "Test Analyst" });
    expect(report.levels).toEqual({ A: 1, B: 0, C: 1 });
    // A stated probability (70%) is scored; the AI's confidence never is.
    expect(report.overview.brierCount).toBe(1);
    expect(report.overview.brier).toBeCloseTo(0.09);
  });

  it("answers the page through the API, with filters checked by hand", async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    await runJob(VIDEO, { extract: extract(), market: market() });
    const response = await reportRoute.GET(
      new Request("http://localhost/api/video-intelligence?direction=long"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.claims).toHaveLength(2);
    expect(body.report.processing).toMatchObject({ videos: 1, done: 1 });
    const bad = await reportRoute.GET(
      new Request("http://localhost/api/video-intelligence?status=won"),
    );
    expect(bad.status).toBe(400);
    const detail = await videoRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: VIDEO }),
    });
    const video = await detail.json();
    expect(video.claims).toHaveLength(2);
    expect(Object.values(video.candles as Record<string, unknown[]>)[0]!.length).toBeGreaterThan(0);
  });

  it("starts, pauses and cancels processing from the processing center", async () => {
    seedVideo();
    const post = (body: unknown) =>
      actionsRoute.POST(
        new Request("http://localhost/api/video-intelligence/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const started = await (await post({ action: "start" })).json();
    expect(started.queued).toBe(1);
    expect(store.getIntelligenceSettings()).toMatchObject({ enabled: true, paused: false });
    await post({ action: "pause" });
    expect(store.getIntelligenceSettings().paused).toBe(true);
    expect((await (await post({ action: "cancel" })).json()).cancelled).toBe(1);
    expect((await post({ action: "explode" })).status).toBe(400);
  });
});

describe("checking the results can be trusted", () => {
  const processed = async () => {
    seedVideo();
    store.enqueueVideos({ extractorVersion: CLAIM_EXTRACTOR_VERSION });
    await runJob(VIDEO, { extract: extract(), market: market() });
  };

  it("reproduces every stored result exactly from the stored candles", async () => {
    await processed();
    const response = await auditRoute.GET();
    const audit = await response.json();
    expect(audit).toMatchObject({ checked: 2, matched: 2, mismatched: [] });
  });

  it("catches a stored result that no longer matches its candles", async () => {
    await processed();
    const [claim] = store.claimsOfVideo(VIDEO);
    // A stored outcome edited by hand (or by a bug) can no longer be reproduced.
    store
      .client()
      .prepare(
        "UPDATE vi_evaluations SET outcome_json = json_set(outcome_json, '$.status', 'invalidated') WHERE claim_id = ?",
      )
      .run(claim!.id);
    const audit = auditEvaluations();
    expect(audit.mismatched).toHaveLength(1);
    expect(audit.mismatched[0]).toMatchObject({ claimId: claim!.id, fields: ["status"] });
    // And a changed stored candle is caught too.
    store.client().exec("UPDATE vi_candles SET high = high * 2");
    expect(auditEvaluations().mismatched.length).toBeGreaterThan(1);
  });

  it("stores each claim's mirror and compares the analyst with it", async () => {
    await processed();
    const [forecast] = store.claimsOfVideo(VIDEO);
    const evaluation = store.evaluationOf(forecast!.id)!;
    // The rally to 105 (5% up) mirrors to a fall to about 95.24 that never came.
    expect(evaluation.baseline).toMatchObject({ side: "short" });
    expect(evaluation.baseline!.target).toBeCloseTo((100 * 100) / 105, 6);
    expect(evaluation.baseline!.status).not.toBe("target_hit");
    const report = buildReport(store.allClaimRecords(), {});
    expect(report.overview.baseline).toMatchObject({
      analystHits: report.overview.baseline.pairs,
      mirrorHits: 0,
    });
    expect(report.overview.edge.analystOnly).toBe(report.overview.baseline.pairs);
  });

  it("shows the candles that decided each claim, and the series behind the charts", async () => {
    await processed();
    const detail = await videoRoute.GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: VIDEO }),
    });
    const video = await detail.json();
    const kinds = video.claims[0].trace.map((step: { kind: string }) => step.kind);
    expect(kinds).toEqual(["reference", "target", "horizon"]);
    const target = video.claims[0].trace[1];
    expect(target.candle.high).toBeGreaterThanOrEqual(105);
    const report = buildReport(store.allClaimRecords(), {});
    expect(report.charts.equity).toHaveLength(1);
    expect(report.charts.rValues).toHaveLength(1);
    expect(report.charts.excursions).toHaveLength(2);
    expect(report.charts.timeline).toEqual([{ month: "2026-03", counts: { target_hit: 2 } }]);
  });
});
