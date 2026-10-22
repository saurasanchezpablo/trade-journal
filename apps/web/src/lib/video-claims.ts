import type { ExternalSummary, Scenario } from "./external-summary";

/**
 * Video intelligence: what an analyst claimed in a video, one checkable claim per row. A claim
 * is extracted by the AI from the transcript (with a verbatim quote and its time mark), or,
 * for a video with no transcript, taken from its existing summary (no quote, lower
 * provenance). Numbers are the analyst's; anything not said stays null. The reading below is
 * by hand: anything malformed is dropped, never guessed.
 */

export const CLAIM_EXTRACTOR_VERSION = "claims-extract-1";

export const CLAIM_KINDS = ["forecast", "conditional", "setup", "level", "commentary"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const ASSET_CLASSES = [
  "crypto",
  "forex",
  "equity",
  "index",
  "futures",
  "commodity",
  "unknown",
] as const;
export type ClaimAssetClass = (typeof ASSET_CLASSES)[number];
export const HORIZON_UNITS = ["hours", "days", "weeks", "months"] as const;
export type HorizonUnit = (typeof HORIZON_UNITS)[number];

/**
 * `explicit`: the analyst said it. `inferred`: the AI read it from what they said (a level
 * shown, an implied direction). `summary`: from the video's summary (no transcript to quote).
 */
export type ClaimOrigin = "explicit" | "inferred" | "summary";
/** Whether the quote was found in the transcript. */
export type EvidenceStatus = "verified" | "approximate" | "not_found" | "none";

export interface VideoClaim {
  kind: ClaimKind;
  origin: ClaimOrigin;
  /** The claim in one sentence. */
  statement: string;
  /** The instrument as named in the video, and as a ticker when it reads as one. */
  instrument: string;
  ticker: string | null;
  assetClass: ClaimAssetClass;
  direction: "long" | "short" | "neutral";
  /** The chart timeframe the analyst works on ("4h", "daily"). */
  timeframe: string | null;
  /** The horizon, only as stated ("within five sessions": 5 days). */
  horizonValue: number | null;
  horizonUnit: HorizonUnit | null;
  /** The price the analyst quotes as current. */
  referencePrice: number | null;
  /** A conditional claim's trigger: price trading above or below this level. */
  triggerPrice: number | null;
  triggerKind: "above" | "below" | null;
  /** The trigger in the analyst's words ("a daily close above 95 with volume"). */
  condition: string | null;
  targets: number[];
  invalidation: number | null;
  invalidationOn: "close" | "touch";
  entryLow: number | null;
  entryHigh: number | null;
  stop: number | null;
  /** Only a probability the analyst stated, as a fraction (never the AI's confidence). */
  probability: number | null;
  indicators: string[];
  /** Verbatim from the transcript, and its time mark in seconds. */
  quote: string | null;
  quoteAt: number | null;
  /** A recording date the analyst states ("today, Monday March 2"), YYYY-MM-DD. */
  statedDate: string | null;
  /** How sure the extraction is that it read the claim right (0 to 1). */
  confidence: number;
  /** What the video leaves unclear about this claim. */
  unclear: string[];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

/** The JSON the AI answers with. */
export const CLAIMS_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...CLAIM_KINDS] },
          origin: { type: "string", enum: ["explicit", "inferred"] },
          statement: { type: "string" },
          instrument: { type: "string" },
          ticker: nullable({ type: "string" }),
          assetClass: { type: "string", enum: [...ASSET_CLASSES] },
          direction: { type: "string", enum: ["long", "short", "neutral"] },
          timeframe: nullable({ type: "string" }),
          horizonValue: nullable({ type: "number" }),
          horizonUnit: nullable({ type: "string", enum: [...HORIZON_UNITS] }),
          referencePrice: nullable({ type: "number" }),
          triggerPrice: nullable({ type: "number" }),
          triggerKind: nullable({ type: "string", enum: ["above", "below"] }),
          condition: nullable({ type: "string" }),
          targets: { type: "array", items: { type: "number" } },
          invalidation: nullable({ type: "number" }),
          invalidationOn: { type: "string", enum: ["close", "touch"] },
          entryLow: nullable({ type: "number" }),
          entryHigh: nullable({ type: "number" }),
          stop: nullable({ type: "number" }),
          probability: nullable({ type: "number" }),
          indicators: { type: "array", items: { type: "string" } },
          quote: nullable({ type: "string" }),
          quoteTime: nullable({ type: "string" }),
          statedDate: nullable({ type: "string" }),
          confidence: { type: "number" },
          unclear: { type: "array", items: { type: "string" } },
        },
        required: [
          "kind",
          "origin",
          "statement",
          "instrument",
          "ticker",
          "assetClass",
          "direction",
          "timeframe",
          "horizonValue",
          "horizonUnit",
          "referencePrice",
          "triggerPrice",
          "triggerKind",
          "condition",
          "targets",
          "invalidation",
          "invalidationOn",
          "entryLow",
          "entryHigh",
          "stop",
          "probability",
          "indicators",
          "quote",
          "quoteTime",
          "statedDate",
          "confidence",
          "unclear",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["claims"],
  additionalProperties: false,
} as const;

export const MAX_CLAIMS = 40;

// ── Reading by hand ──

const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown, max = 300) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const price = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const prices = (v: unknown, max = 8) =>
  Array.isArray(v)
    ? v
        .map(price)
        .filter((n): n is number => n !== null)
        .slice(0, max)
    : [];
const strs = (v: unknown, max = 10, len = 200) =>
  Array.isArray(v)
    ? v
        .map((x) => str(x, len))
        .filter(Boolean)
        .slice(0, max)
    : [];
const oneOf = <T extends string>(v: unknown, choices: readonly T[], fallback: T): T =>
  choices.includes(v as T) ? (v as T) : fallback;

/** "12:30" or "1:02:03" as seconds; null otherwise. */
export function timeMark(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^\s*\[?(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\]?\s*$/.exec(value);
  if (!match) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number(match[3]) < 60 ? seconds : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A stated probability: a fraction, or a percentage the AI forgot to divide. */
function probabilityOf(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  const p = v > 1 && v <= 100 ? v / 100 : v;
  return p >= 0 && p <= 1 ? p : null;
}

export function readClaim(v: unknown): VideoClaim | null {
  const o = obj(v);
  if (!o) return null;
  const statement = str(o.statement, 600);
  const instrument = str(o.instrument, 60);
  if (!statement || !instrument) return null;
  let entryLow = price(o.entryLow);
  let entryHigh = price(o.entryHigh);
  if (entryLow !== null && entryHigh !== null && entryLow > entryHigh)
    [entryLow, entryHigh] = [entryHigh, entryLow];
  const triggerPrice = price(o.triggerPrice);
  const horizonValue =
    typeof o.horizonValue === "number" && o.horizonValue > 0 && o.horizonValue <= 1000
      ? o.horizonValue
      : null;
  const horizonUnit = horizonValue === null ? null : oneOf(o.horizonUnit, HORIZON_UNITS, "days");
  const ticker = strOrNull(o.ticker, 24);
  const confidence =
    typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? Math.min(1, Math.max(0, o.confidence))
      : 0;
  return {
    kind: oneOf(o.kind, CLAIM_KINDS, "commentary"),
    origin: o.origin === "explicit" ? "explicit" : "inferred",
    statement,
    instrument,
    ticker: ticker && /^[A-Za-z0-9.^=:/_-]+$/.test(ticker) ? ticker.toUpperCase() : null,
    assetClass: oneOf(o.assetClass, ASSET_CLASSES, "unknown"),
    direction: oneOf(o.direction, ["long", "short", "neutral"] as const, "neutral"),
    timeframe: strOrNull(o.timeframe, 40),
    horizonValue,
    horizonUnit,
    referencePrice: price(o.referencePrice),
    triggerPrice,
    triggerKind:
      triggerPrice === null ? null : oneOf(o.triggerKind, ["above", "below"] as const, "above"),
    condition: strOrNull(o.condition, 300),
    targets: prices(o.targets),
    invalidation: price(o.invalidation),
    invalidationOn: o.invalidationOn === "close" ? "close" : "touch",
    entryLow,
    entryHigh,
    stop: price(o.stop),
    probability: probabilityOf(o.probability),
    indicators: strs(o.indicators, 10, 60),
    quote: strOrNull(o.quote, 600),
    quoteAt: timeMark(o.quoteTime),
    statedDate: typeof o.statedDate === "string" && DATE.test(o.statedDate) ? o.statedDate : null,
    confidence,
    unclear: strs(o.unclear, 6, 200),
  };
}

export function readClaims(value: unknown): VideoClaim[] {
  const o = obj(value);
  if (!o || !Array.isArray(o.claims)) throw new Error("not a claim list");
  return o.claims
    .map(readClaim)
    .filter((c): c is VideoClaim => c !== null)
    .slice(0, MAX_CLAIMS);
}

// ── Evidence ──

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/\[\d{1,2}(?::\d{2}){1,2}\]/g, " ")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Whether a quote is in the transcript: word for word (after punctuation and time marks are
 * set aside), mostly (60% of its five-word runs), or not at all.
 */
export function verifyQuote(quote: string | null, transcript: string | null): EvidenceStatus {
  if (!quote || !transcript) return "none";
  const q = normal(quote);
  const t = normal(transcript);
  if (!q) return "none";
  if (t.includes(q)) return "verified";
  const words = q.split(" ");
  if (words.length < 5) return "not_found";
  let found = 0;
  let runs = 0;
  for (let i = 0; i + 5 <= words.length; i++) {
    runs++;
    if (t.includes(words.slice(i, i + 5).join(" "))) found++;
  }
  return runs && found / runs >= 0.6 ? "approximate" : "not_found";
}

/** The time mark (seconds) just before where the quote appears in the transcript. */
export function quoteTimeInTranscript(
  quote: string | null,
  transcript: string | null,
): number | null {
  if (!quote || !transcript) return null;
  const words = normal(quote).split(" ").slice(0, 6).join(" ");
  if (!words) return null;
  const marks = [...transcript.matchAll(/\[(\d{1,2}(?::\d{2}){1,2})\]/g)];
  // The segment the quote starts in; then, for a quote that runs across a mark, a little past it.
  for (const overflow of [0, 200])
    for (const [i, mark] of marks.entries()) {
      const end = (marks[i + 1]?.index ?? transcript.length) + overflow;
      if (normal(transcript.slice(mark.index, end)).includes(words)) return timeMark(mark[1]);
    }
  return null;
}

// ── Timing ──

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const UNIT_MS: Record<HorizonUnit, number> = {
  hours: HOUR,
  days: DAY,
  weeks: 7 * DAY,
  months: 30 * DAY,
};

/**
 * The system's horizon for a claim with none stated, from its timeframe: intraday a day,
 * 1h to 4h ten days, daily a month, weekly and longer six months, unknown a month. A
 * convention for comparing claims, always labelled as such.
 */
export function conventionHorizonMs(timeframe: string | null): number {
  const t = (timeframe ?? "").toLowerCase();
  if (/\b(1|3|5|15|30)\s*(m|min|minute)|scalp|intraday|intradía/.test(t)) return DAY;
  if (/\b(1|2|4)\s*(h|hour|hora)|swing/.test(t)) return 10 * DAY;
  if (/\b(w|week|weekly|semanal|month|monthly|mensual|long)/.test(t)) return 180 * DAY;
  return 30 * DAY;
}

export interface ClaimTiming {
  /** When the claim counts from: the video's publication (when a viewer could act on it). */
  claimTime: number;
  claimTimeSource: "published";
  /** A recording date the analyst stated, kept for the record. */
  statedDate: string | null;
  horizonEnd: number;
  horizonSource: "stated" | "convention";
}

/**
 * When a claim counts from and until. Claims are judged from publication: a viewer could not
 * act on a video before it was out, and judging from an earlier recording would credit moves
 * nobody could trade on. A stated recording date is kept, not used.
 */
export function claimTiming(claim: VideoClaim, publishedAt: string): ClaimTiming {
  const claimTime = Date.parse(publishedAt);
  const stated =
    claim.horizonValue !== null && claim.horizonUnit !== null
      ? claim.horizonValue * UNIT_MS[claim.horizonUnit]
      : null;
  return {
    claimTime,
    claimTimeSource: "published",
    statedDate: claim.statedDate,
    horizonEnd: claimTime + (stated ?? conventionHorizonMs(claim.timeframe)),
    horizonSource: stated !== null ? "stated" : "convention",
  };
}

// ── Claims from a summary (videos without a transcript) ──

function fromScenario(
  scenario: Scenario,
  summary: ExternalSummary,
  alternative: boolean,
): VideoClaim | null {
  const instrument = scenario.instrument ?? summary.instruments[0] ?? null;
  if (!instrument) return null;
  return {
    kind: "forecast",
    origin: "summary",
    statement:
      // A description that only repeats the title is said once.
      `${alternative ? "Alternative: " : ""}${
        scenario.description.trim() === scenario.title.trim()
          ? scenario.title
          : `${scenario.title}. ${scenario.description}`
      }`.slice(0, 600),
    instrument,
    ticker: null,
    assetClass: "unknown",
    direction: scenario.direction,
    timeframe: summary.timeframe,
    horizonValue: null,
    horizonUnit: null,
    referencePrice: null,
    triggerPrice: null,
    triggerKind: null,
    condition: scenario.trigger,
    targets: scenario.targets,
    invalidation: scenario.invalidation,
    invalidationOn: "touch",
    entryLow: null,
    entryHigh: null,
    stop: null,
    probability: null,
    indicators: [],
    quote: null,
    quoteAt: null,
    statedDate: null,
    confidence: 0.5,
    unclear: [
      "Taken from the video's summary: no transcript to quote.",
      ...(scenario.trigger ? ["Its trigger is in words only and is not checked."] : []),
    ],
  };
}

/**
 * The checkable claims in a summary: its scenarios, trade ideas and open trades. Their
 * instrument is as the summary names it; the asset class is resolved later (unknown here).
 */
export function claimsFromSummary(summary: ExternalSummary): VideoClaim[] {
  const out: VideoClaim[] = [];
  if (summary.mainScenario) {
    const claim = fromScenario(summary.mainScenario, summary, false);
    if (claim) out.push(claim);
  }
  if (summary.secondaryScenario) {
    const claim = fromScenario(summary.secondaryScenario, summary, true);
    if (claim) out.push(claim);
  }
  for (const idea of [...summary.tradeIdeas, ...summary.openTrades]) {
    const isIdea = "when" in idea;
    out.push({
      kind: "setup",
      origin: "summary",
      statement:
        `${idea.direction === "long" ? "Long" : "Short"} ${idea.instrument}${isIdea && idea.when ? ` when ${idea.when}` : ""}${idea.note ? `. ${idea.note}` : ""}`.slice(
          0,
          600,
        ),
      instrument: idea.instrument,
      ticker: null,
      assetClass: "unknown",
      direction: idea.direction,
      timeframe: summary.timeframe,
      horizonValue: null,
      horizonUnit: null,
      referencePrice: null,
      triggerPrice: null,
      triggerKind: null,
      condition: isIdea ? idea.when || null : null,
      targets: idea.takeProfits,
      invalidation: idea.stopLoss,
      invalidationOn: "touch",
      entryLow: isIdea ? idea.entryLow : idea.entry,
      entryHigh: isIdea ? idea.entryHigh : idea.entry,
      stop: idea.stopLoss,
      probability: null,
      indicators: [],
      quote: null,
      quoteAt: null,
      statedDate: null,
      confidence: 0.5,
      unclear: ["Taken from the video's summary: no transcript to quote."],
    });
  }
  return out.slice(0, MAX_CLAIMS);
}
