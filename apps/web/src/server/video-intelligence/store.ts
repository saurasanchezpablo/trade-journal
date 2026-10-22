import type { ClaimBar, ClaimOutcome, Regime, SimulationResult } from "@luxalgo/journal-core";
import { db } from "@/db";
import type { Resolution } from "@/lib/market-data";
import type { EvidenceStatus, VideoClaim } from "@/lib/video-claims";
import { getSetting, setSetting } from "../settings";
import { client as externalClient } from "../external-analysis/store";
import { newId, nowIso } from "../ids";

/**
 * Video intelligence storage, in tables of its own (created on first use, like the other
 * add-ons), so the journal's schema and upgrades stay untouched:
 * - `vi_claims`: each video's claims, as extracted (with the extractor version);
 * - `vi_evaluations`: each claim's outcome, simulated trade, market regime and the candles'
 *   provenance (with the evaluator version);
 * - `vi_jobs`: one row per video, its processing state, attempts, errors and AI usage;
 * - `vi_series` and `vi_candles`: the closed candles every evaluation read, kept so any
 *   outcome can be computed again from what is stored.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS vi_claims (
 id TEXT PRIMARY KEY, video_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
 extractor_version TEXT NOT NULL, claim_json TEXT NOT NULL,
 evidence TEXT NOT NULL, quote_at INTEGER,
 claim_time TEXT NOT NULL, horizon_end TEXT NOT NULL, horizon_source TEXT NOT NULL,
 kind TEXT NOT NULL, origin TEXT NOT NULL, direction TEXT NOT NULL, level TEXT NOT NULL,
 instrument TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vi_claims_video ON vi_claims(video_id, ordinal);
CREATE TABLE IF NOT EXISTS vi_evaluations (
 claim_id TEXT PRIMARY KEY REFERENCES vi_claims(id) ON DELETE CASCADE,
 evaluator_version TEXT NOT NULL, status TEXT NOT NULL,
 outcome_json TEXT NOT NULL, simulation_json TEXT, regime_json TEXT, market_json TEXT,
 evaluated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vi_evaluations_status ON vi_evaluations(status);
CREATE TABLE IF NOT EXISTS vi_jobs (
 video_id TEXT PRIMARY KEY, state TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
 extractor_version TEXT, evaluator_version TEXT, source TEXT,
 claims INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS vi_jobs_state ON vi_jobs(state, next_attempt_at);
CREATE TABLE IF NOT EXISTS vi_series (
 series TEXT PRIMARY KEY, provider TEXT NOT NULL, dataset TEXT, symbol TEXT NOT NULL,
 resolution TEXT NOT NULL, retrieved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vi_candles (
 series TEXT NOT NULL, time INTEGER NOT NULL, open REAL NOT NULL, high REAL NOT NULL,
 low REAL NOT NULL, close REAL NOT NULL, volume REAL,
 PRIMARY KEY (series, time)
) WITHOUT ROWID;
`;
const ready = new WeakSet<object>();
export const client = () => {
  if (!ready.has(db)) {
    // The videos live in External analysis's tables.
    externalClient();
    db.$client.exec(DDL);
    ready.add(db);
  }
  return db.$client;
};

// ── Settings ──

export interface IntelligenceSettings {
  /**
   * Started: the library has been queued once and new summaries are queued as they come. Off
   * until you start it, since reading every video costs AI tokens.
   */
  enabled: boolean;
  /** The background work waits while paused. */
  paused: boolean;
  /** Execution assumptions for simulated setups, in basis points. */
  commissionBps: number;
  slippageBps: number;
  targetBufferBps: number;
}

export const DEFAULT_INTELLIGENCE: IntelligenceSettings = {
  enabled: false,
  paused: false,
  commissionBps: 5,
  slippageBps: 5,
  targetBufferBps: 2,
};
const SETTINGS_KEY = "videoIntelligence";

export function readIntelligenceSettings(value: unknown): IntelligenceSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const bps = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 500 ? x : fallback;
  return {
    enabled: v.enabled === true,
    paused: v.paused === true,
    commissionBps: bps(v.commissionBps, DEFAULT_INTELLIGENCE.commissionBps),
    slippageBps: bps(v.slippageBps, DEFAULT_INTELLIGENCE.slippageBps),
    targetBufferBps: bps(v.targetBufferBps, DEFAULT_INTELLIGENCE.targetBufferBps),
  };
}
export function getIntelligenceSettings(): IntelligenceSettings {
  try {
    return readIntelligenceSettings(JSON.parse(getSetting(SETTINGS_KEY) ?? "{}"));
  } catch {
    return DEFAULT_INTELLIGENCE;
  }
}
export const saveIntelligenceSettings = (s: IntelligenceSettings) =>
  setSetting(SETTINGS_KEY, JSON.stringify(s));

// ── Jobs ──

/**
 * `queued`: waiting for its turn. `running`: being worked on (a server restart puts it back in
 * the queue). `done`: claims extracted and evaluated (pending claims are evaluated again as
 * candles arrive). `failed`: an attempt failed; retried later until the attempts run out.
 * `unavailable`: nothing to read yet (no transcript and no summary).
 */
export type JobState = "queued" | "running" | "done" | "failed" | "unavailable";
export const MAX_ATTEMPTS = 3;

export interface IntelligenceJob {
  videoId: string;
  state: JobState;
  detail: string;
  attempts: number;
  nextAttemptAt: string | null;
  extractorVersion: string | null;
  evaluatorVersion: string | null;
  source: "transcript" | "summary" | null;
  claims: number;
  inputTokens: number;
  outputTokens: number;
  updatedAt: string;
}

interface JobRow {
  video_id: string;
  state: string;
  detail: string;
  attempts: number;
  next_attempt_at: string | null;
  extractor_version: string | null;
  evaluator_version: string | null;
  source: string | null;
  claims: number;
  input_tokens: number;
  output_tokens: number;
  updated_at: string;
}
const JOB_STATES: JobState[] = ["queued", "running", "done", "failed", "unavailable"];
const toJob = (r: JobRow): IntelligenceJob => ({
  videoId: r.video_id,
  state: JOB_STATES.includes(r.state as JobState) ? (r.state as JobState) : "failed",
  detail: r.detail,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  extractorVersion: r.extractor_version,
  evaluatorVersion: r.evaluator_version,
  source: r.source === "transcript" || r.source === "summary" ? r.source : null,
  claims: r.claims,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  updatedAt: r.updated_at,
});

export const getJob = (videoId: string): IntelligenceJob | null => {
  const row = client().prepare("SELECT * FROM vi_jobs WHERE video_id = ?").get(videoId) as
    JobRow | undefined;
  return row ? toJob(row) : null;
};

export const listJobs = (): IntelligenceJob[] =>
  (client().prepare("SELECT * FROM vi_jobs ORDER BY updated_at DESC").all() as JobRow[]).map(toJob);

/**
 * Queue every stored video that has something to read and no job yet, and (with `force`)
 * queue again those done with an older extractor. Returns how many were queued. Idempotent:
 * a video is never queued twice.
 */
export function enqueueVideos(options: {
  videoIds?: string[];
  extractorVersion: string;
  force?: boolean;
}): number {
  const sql = client();
  const now = nowIso();
  const where = options.videoIds?.length
    ? `AND v.video_id IN (${options.videoIds.map(() => "?").join(",")})`
    : "";
  const args = options.videoIds ?? [];
  let queued = 0;
  sql.transaction(() => {
    queued += sql
      .prepare(
        `INSERT OR IGNORE INTO vi_jobs (video_id, state, updated_at)
         SELECT v.video_id, 'queued', ? FROM external_videos v
         WHERE (v.transcript IS NOT NULL OR v.summary_json IS NOT NULL) ${where}`,
      )
      .run(now, ...args).changes;
    if (options.force)
      queued += sql
        .prepare(
          `UPDATE vi_jobs SET state = 'queued', attempts = 0, next_attempt_at = NULL, detail = '', updated_at = ?
           WHERE state != 'running' AND (? = 1 OR extractor_version IS NULL OR extractor_version != ?)
           ${options.videoIds?.length ? `AND video_id IN (${options.videoIds.map(() => "?").join(",")})` : ""}`,
        )
        .run(now, options.videoIds?.length ? 1 : 0, options.extractorVersion, ...args).changes;
  })();
  return queued;
}

/** Jobs the last process left running go back to the queue (resuming after a restart). */
export const requeueInterrupted = () =>
  client()
    .prepare("UPDATE vi_jobs SET state = 'queued', updated_at = ? WHERE state = 'running'")
    .run(nowIso()).changes;

/** The next job due, claimed as running (one caller at a time takes it). */
export function claimNextJob(now = nowIso()): IntelligenceJob | null {
  const sql = client();
  return sql.transaction(() => {
    const row = sql
      .prepare(
        `SELECT * FROM vi_jobs WHERE state = 'queued' OR (state = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?)
         ORDER BY CASE state WHEN 'queued' THEN 0 ELSE 1 END, updated_at LIMIT 1`,
      )
      .get(now) as JobRow | undefined;
    if (!row) return null;
    sql
      .prepare("UPDATE vi_jobs SET state = 'running', updated_at = ? WHERE video_id = ?")
      .run(nowIso(), row.video_id);
    return toJob({ ...row, state: "running" });
  })();
}

export function updateJob(
  videoId: string,
  patch: Partial<{
    state: JobState;
    detail: string;
    attempts: number;
    nextAttemptAt: string | null;
    extractorVersion: string | null;
    evaluatorVersion: string | null;
    source: "transcript" | "summary" | null;
    claims: number;
    inputTokens: number;
    outputTokens: number;
  }>,
) {
  const columns: Record<string, string> = {
    state: "state",
    detail: "detail",
    attempts: "attempts",
    nextAttemptAt: "next_attempt_at",
    extractorVersion: "extractor_version",
    evaluatorVersion: "evaluator_version",
    source: "source",
    claims: "claims",
    inputTokens: "input_tokens",
    outputTokens: "output_tokens",
  };
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = columns[key];
    if (!column) continue;
    sets.push(`${column} = ?`);
    args.push(value);
  }
  if (!sets.length) return;
  client()
    .prepare(`UPDATE vi_jobs SET ${sets.join(", ")}, updated_at = ? WHERE video_id = ?`)
    .run(...args, nowIso(), videoId);
}

/** Cancel: queued and failed jobs stop (they can be queued again). */
export const cancelQueued = () =>
  client()
    .prepare(
      "UPDATE vi_jobs SET state = 'failed', next_attempt_at = NULL, detail = 'Cancelled.', updated_at = ? WHERE state = 'queued' OR (state = 'failed' AND next_attempt_at IS NOT NULL)",
    )
    .run(nowIso()).changes;

// ── Claims ──

export interface StoredClaim {
  id: string;
  videoId: string;
  ordinal: number;
  extractorVersion: string;
  claim: VideoClaim;
  evidence: EvidenceStatus;
  quoteAt: number | null;
  claimTime: string;
  horizonEnd: string;
  horizonSource: "stated" | "convention";
  level: "A" | "B" | "C";
}

interface ClaimRow {
  id: string;
  video_id: string;
  ordinal: number;
  extractor_version: string;
  claim_json: string;
  evidence: string;
  quote_at: number | null;
  claim_time: string;
  horizon_end: string;
  horizon_source: string;
  level: string;
}
const toClaim = (r: ClaimRow): StoredClaim | null => {
  try {
    return {
      id: r.id,
      videoId: r.video_id,
      ordinal: r.ordinal,
      extractorVersion: r.extractor_version,
      claim: JSON.parse(r.claim_json) as VideoClaim,
      evidence: r.evidence as EvidenceStatus,
      quoteAt: r.quote_at,
      claimTime: r.claim_time,
      horizonEnd: r.horizon_end,
      horizonSource: r.horizon_source === "stated" ? "stated" : "convention",
      level: r.level === "B" || r.level === "C" ? r.level : "A",
    };
  } catch {
    return null;
  }
};

export type NewClaim = Omit<StoredClaim, "id" | "videoId" | "ordinal">;

/** A video's claims replaced in one transaction (their evaluations go with the old ones). */
export function replaceClaims(videoId: string, claims: NewClaim[]): StoredClaim[] {
  const sql = client();
  const now = nowIso();
  const stored = claims.map((c, ordinal) => ({ ...c, id: newId(), videoId, ordinal }));
  sql.transaction(() => {
    sql
      .prepare(
        "DELETE FROM vi_evaluations WHERE claim_id IN (SELECT id FROM vi_claims WHERE video_id = ?)",
      )
      .run(videoId);
    sql.prepare("DELETE FROM vi_claims WHERE video_id = ?").run(videoId);
    const insert = sql.prepare(
      `INSERT INTO vi_claims (id, video_id, ordinal, extractor_version, claim_json, evidence, quote_at,
        claim_time, horizon_end, horizon_source, kind, origin, direction, level, instrument, created_at)
       VALUES (@id, @videoId, @ordinal, @extractorVersion, @json, @evidence, @quoteAt,
        @claimTime, @horizonEnd, @horizonSource, @kind, @origin, @direction, @level, @instrument, @now)`,
    );
    for (const c of stored)
      insert.run({
        ...c,
        json: JSON.stringify(c.claim),
        kind: c.claim.kind,
        origin: c.claim.origin,
        direction: c.claim.direction,
        instrument: (c.claim.ticker ?? c.claim.instrument).toUpperCase(),
        now,
      });
  })();
  return stored;
}

export const claimsOfVideo = (videoId: string): StoredClaim[] =>
  (
    client()
      .prepare("SELECT * FROM vi_claims WHERE video_id = ? ORDER BY ordinal")
      .all(videoId) as ClaimRow[]
  )
    .map(toClaim)
    .filter((c): c is StoredClaim => c !== null);

export const getClaim = (id: string): StoredClaim | null => {
  const row = client().prepare("SELECT * FROM vi_claims WHERE id = ?").get(id) as
    ClaimRow | undefined;
  return row ? toClaim(row) : null;
};

// ── Evaluations ──

export interface MarketProvenance {
  series: string;
  provider: string;
  providerName: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
  from: number;
  to: number;
  bars: number;
  retrievedAt: string;
}

/**
 * A simulated setup, with its net return again at no cost and at twice the costs: how much of
 * the result the execution assumptions decide.
 */
export type StoredSimulation = SimulationResult & {
  costs?: { commissionBps: number; slippageBps: number; targetBufferBps: number };
  sensitivity?: { free: number | null; double: number | null };
};

export interface StoredEvaluation {
  claimId: string;
  evaluatorVersion: string;
  status: ClaimOutcome["status"];
  outcome: ClaimOutcome;
  simulation: StoredSimulation | null;
  regime: Regime | null;
  market: MarketProvenance | null;
  evaluatedAt: string;
}

interface EvaluationRow {
  claim_id: string;
  evaluator_version: string;
  status: string;
  outcome_json: string;
  simulation_json: string | null;
  regime_json: string | null;
  market_json: string | null;
  evaluated_at: string;
}
const parse = <T>(json: string | null): T | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
};
const toEvaluation = (r: EvaluationRow): StoredEvaluation | null => {
  const outcome = parse<ClaimOutcome>(r.outcome_json);
  if (!outcome) return null;
  return {
    claimId: r.claim_id,
    evaluatorVersion: r.evaluator_version,
    status: outcome.status,
    outcome,
    simulation: parse<StoredSimulation>(r.simulation_json),
    regime: parse<Regime>(r.regime_json),
    market: parse<MarketProvenance>(r.market_json),
    evaluatedAt: r.evaluated_at,
  };
};

export function saveEvaluation(e: Omit<StoredEvaluation, "evaluatedAt" | "status">) {
  client()
    .prepare(
      `INSERT INTO vi_evaluations (claim_id, evaluator_version, status, outcome_json, simulation_json, regime_json, market_json, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(claim_id) DO UPDATE SET evaluator_version = excluded.evaluator_version, status = excluded.status,
        outcome_json = excluded.outcome_json, simulation_json = excluded.simulation_json, regime_json = excluded.regime_json,
        market_json = excluded.market_json, evaluated_at = excluded.evaluated_at`,
    )
    .run(
      e.claimId,
      e.evaluatorVersion,
      e.outcome.status,
      JSON.stringify(e.outcome),
      e.simulation ? JSON.stringify(e.simulation) : null,
      e.regime ? JSON.stringify(e.regime) : null,
      e.market ? JSON.stringify(e.market) : null,
      nowIso(),
    );
}

export const evaluationOf = (claimId: string): StoredEvaluation | null => {
  const row = client().prepare("SELECT * FROM vi_evaluations WHERE claim_id = ?").get(claimId) as
    EvaluationRow | undefined;
  return row ? toEvaluation(row) : null;
};

/** Claims whose outcome can still change, or that an older evaluator judged. */
export function claimsToReevaluate(evaluatorVersion: string, limit = 200): StoredClaim[] {
  return (
    client()
      .prepare(
        `SELECT c.* FROM vi_claims c LEFT JOIN vi_evaluations e ON e.claim_id = c.id
         WHERE e.claim_id IS NULL OR e.evaluator_version != ? OR e.status IN ('pending', 'unevaluable')
         ORDER BY c.claim_time LIMIT ?`,
      )
      .all(evaluatorVersion, limit) as ClaimRow[]
  )
    .map(toClaim)
    .filter((c): c is StoredClaim => c !== null);
}

/** Every claim with its evaluation and its video's channel, for the aggregate views. */
export interface ClaimRecord {
  claim: StoredClaim;
  evaluation: StoredEvaluation | null;
  channelId: string;
  channelTitle: string;
  videoTitle: string;
  publishedAt: string;
}

export function allClaimRecords(): ClaimRecord[] {
  const rows = client()
    .prepare(
      `SELECT c.*, e.claim_id AS e_claim_id, e.evaluator_version AS e_evaluator_version, e.status AS e_status,
        e.outcome_json, e.simulation_json, e.regime_json, e.market_json, e.evaluated_at,
        v.channel_id AS v_channel_id, v.title AS v_title, v.published_at AS v_published_at, ch.title AS ch_title
       FROM vi_claims c
       JOIN external_videos v ON v.video_id = c.video_id
       LEFT JOIN external_channels ch ON ch.channel_id = v.channel_id
       LEFT JOIN vi_evaluations e ON e.claim_id = c.id
       ORDER BY c.claim_time DESC`,
    )
    .all() as (ClaimRow &
    Partial<EvaluationRow> & {
      e_claim_id: string | null;
      e_evaluator_version: string | null;
      e_status: string | null;
      v_channel_id: string;
      v_title: string;
      v_published_at: string;
      ch_title: string | null;
    })[];
  const out: ClaimRecord[] = [];
  for (const r of rows) {
    const claim = toClaim(r);
    if (!claim) continue;
    const evaluation =
      r.e_claim_id && r.outcome_json
        ? toEvaluation({
            claim_id: r.e_claim_id,
            evaluator_version: r.e_evaluator_version!,
            status: r.e_status!,
            outcome_json: r.outcome_json,
            simulation_json: r.simulation_json ?? null,
            regime_json: r.regime_json ?? null,
            market_json: r.market_json ?? null,
            evaluated_at: r.evaluated_at!,
          })
        : null;
    out.push({
      claim,
      evaluation,
      channelId: r.v_channel_id,
      channelTitle: r.ch_title ?? "",
      videoTitle: r.v_title,
      publishedAt: r.v_published_at,
    });
  }
  return out;
}

// ── Candles ──

export const seriesKey = (s: {
  provider: string;
  dataset: string | null;
  symbol: string;
  resolution: Resolution;
}) => `${s.provider}|${s.dataset ?? ""}|${s.symbol}|${s.resolution}`;

/** Store closed candles for a series (newer readings of the same candle replace older ones). */
export function storeCandles(
  series: { provider: string; dataset: string | null; symbol: string; resolution: Resolution },
  bars: readonly ClaimBar[],
) {
  const sql = client();
  const key = seriesKey(series);
  sql.transaction(() => {
    sql
      .prepare(
        `INSERT INTO vi_series (series, provider, dataset, symbol, resolution, retrieved_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(series) DO UPDATE SET retrieved_at = excluded.retrieved_at`,
      )
      .run(key, series.provider, series.dataset, series.symbol, series.resolution, nowIso());
    const insert = sql.prepare(
      `INSERT OR REPLACE INTO vi_candles (series, time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const b of bars) insert.run(key, b.time, b.open, b.high, b.low, b.close, b.volume ?? null);
  })();
  return key;
}

export const storedCandles = (series: string, from: number, to: number): ClaimBar[] =>
  (
    client()
      .prepare(
        "SELECT time, open, high, low, close, volume FROM vi_candles WHERE series = ? AND time >= ? AND time <= ? ORDER BY time",
      )
      .all(series, from, to) as ClaimBar[]
  ).map((b) => ({ ...b, volume: b.volume ?? undefined }));

/** Forget the claims and jobs of videos no longer stored (their channel was unfollowed). */
export function pruneOrphans(): number {
  const sql = client();
  let removed = 0;
  sql.transaction(() => {
    const gone =
      "SELECT video_id FROM vi_jobs WHERE video_id NOT IN (SELECT video_id FROM external_videos)";
    sql
      .prepare(
        `DELETE FROM vi_evaluations WHERE claim_id IN (SELECT id FROM vi_claims WHERE video_id NOT IN (SELECT video_id FROM external_videos))`,
      )
      .run();
    removed += sql
      .prepare("DELETE FROM vi_claims WHERE video_id NOT IN (SELECT video_id FROM external_videos)")
      .run().changes;
    sql.prepare(`DELETE FROM vi_jobs WHERE video_id IN (${gone})`).run();
  })();
  return removed;
}

/** Videos done by an older extractor are read again (their claims are replaced). */
export const requeueOutdated = (extractorVersion: string) =>
  client()
    .prepare(
      "UPDATE vi_jobs SET state = 'queued', attempts = 0, next_attempt_at = NULL, updated_at = ? WHERE state = 'done' AND (extractor_version IS NULL OR extractor_version != ?)",
    )
    .run(nowIso(), extractorVersion).changes;

/** Claims at a strategy level (C: the simulated setups, re-simulated when costs change). */
export const claimsAtLevel = (level: "A" | "B" | "C"): StoredClaim[] =>
  (
    client()
      .prepare("SELECT * FROM vi_claims WHERE level = ? ORDER BY claim_time")
      .all(level) as ClaimRow[]
  )
    .map(toClaim)
    .filter((c): c is StoredClaim => c !== null);

/** Jobs with their video's title and channel, newest first, for the processing center. */
export function jobRows(limit = 300) {
  return (
    client()
      .prepare(
        `SELECT j.*, v.title AS video_title, v.published_at, c.title AS channel_title FROM vi_jobs j
         JOIN external_videos v ON v.video_id = j.video_id
         LEFT JOIN external_channels c ON c.channel_id = v.channel_id
         ORDER BY CASE j.state WHEN 'running' THEN 0 WHEN 'failed' THEN 1 WHEN 'queued' THEN 2 ELSE 3 END, j.updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as (JobRow & {
      video_title: string;
      published_at: string;
      channel_title: string | null;
    })[]
  ).map((r) => ({
    ...toJob(r),
    videoTitle: r.video_title,
    publishedAt: r.published_at,
    channelTitle: r.channel_title ?? "",
  }));
}
