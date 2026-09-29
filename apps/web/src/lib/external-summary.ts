/**
 * An external analysis (a YouTube video) summarised as a trader's notes: the main and the
 * secondary scenario with the reasons given for each, the author's open trades, the long or
 * short ideas with their entry, stop loss and take profits, and the key levels. Prices are
 * what the author said (numbers, or null when not said); nothing is invented.
 */

export type Direction = "long" | "short" | "neutral";

export interface Scenario {
  title: string;
  direction: Direction;
  instrument: string | null;
  description: string;
  /** What would set it off, as said (a price, a close above a level, an event). */
  trigger: string | null;
  targets: number[];
  invalidation: number | null;
  /** How likely the author thinks it is, as said ("70%", "most likely"). */
  likelihood: string | null;
}

export interface OpenTrade {
  instrument: string;
  direction: "long" | "short";
  entry: number | null;
  stopLoss: number | null;
  takeProfits: number[];
  note: string;
}

export interface TradeIdea {
  instrument: string;
  direction: "long" | "short";
  /** When or on what condition to take it. */
  when: string;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  takeProfits: number[];
  note: string;
}

export interface KeyLevel {
  instrument: string | null;
  price: number;
  kind: "support" | "resistance" | "other";
  note: string;
}

export interface ExternalSummary {
  /** Two to four sentences: the author's view. */
  overview: string;
  bias: Direction;
  instruments: string[];
  timeframe: string | null;
  mainScenario: Scenario | null;
  mainReasons: string[];
  secondaryScenario: Scenario | null;
  secondaryReasons: string[];
  openTrades: OpenTrade[];
  tradeIdeas: TradeIdea[];
  keyLevels: KeyLevel[];
  /** What the author warned about, or what the video leaves unclear. */
  caveats: string[];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const numbers = { type: "array", items: { type: "number" } };
const texts = { type: "array", items: { type: "string" } };
const scenario = {
  type: "object",
  properties: {
    title: { type: "string" },
    direction: { type: "string", enum: ["long", "short", "neutral"] },
    instrument: nullable({ type: "string" }),
    description: { type: "string" },
    trigger: nullable({ type: "string" }),
    targets: numbers,
    invalidation: nullable({ type: "number" }),
    likelihood: nullable({ type: "string" }),
  },
  required: [
    "title",
    "direction",
    "instrument",
    "description",
    "trigger",
    "targets",
    "invalidation",
    "likelihood",
  ],
  additionalProperties: false,
};

/** The JSON the AI answers with. */
export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    bias: { type: "string", enum: ["long", "short", "neutral"] },
    instruments: texts,
    timeframe: nullable({ type: "string" }),
    mainScenario: nullable(scenario),
    mainReasons: texts,
    secondaryScenario: nullable(scenario),
    secondaryReasons: texts,
    openTrades: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instrument: { type: "string" },
          direction: { type: "string", enum: ["long", "short"] },
          entry: nullable({ type: "number" }),
          stopLoss: nullable({ type: "number" }),
          takeProfits: numbers,
          note: { type: "string" },
        },
        required: ["instrument", "direction", "entry", "stopLoss", "takeProfits", "note"],
        additionalProperties: false,
      },
    },
    tradeIdeas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instrument: { type: "string" },
          direction: { type: "string", enum: ["long", "short"] },
          when: { type: "string" },
          entryLow: nullable({ type: "number" }),
          entryHigh: nullable({ type: "number" }),
          stopLoss: nullable({ type: "number" }),
          takeProfits: numbers,
          note: { type: "string" },
        },
        required: [
          "instrument",
          "direction",
          "when",
          "entryLow",
          "entryHigh",
          "stopLoss",
          "takeProfits",
          "note",
        ],
        additionalProperties: false,
      },
    },
    keyLevels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instrument: nullable({ type: "string" }),
          price: { type: "number" },
          kind: { type: "string", enum: ["support", "resistance", "other"] },
          note: { type: "string" },
        },
        required: ["instrument", "price", "kind", "note"],
        additionalProperties: false,
      },
    },
    caveats: texts,
  },
  required: [
    "overview",
    "bias",
    "instruments",
    "timeframe",
    "mainScenario",
    "mainReasons",
    "secondaryScenario",
    "secondaryReasons",
    "openTrades",
    "tradeIdeas",
    "keyLevels",
    "caveats",
  ],
  additionalProperties: false,
} as const;

// ── Reading the answer by hand: anything malformed is dropped, never guessed ──

const obj = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strOrNull = (v: unknown, max = 300) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const nums = (v: unknown, max = 8) =>
  Array.isArray(v)
    ? v
        .map(num)
        .filter((n): n is number => n !== null)
        .slice(0, max)
    : [];
const strs = (v: unknown, max = 12, len = 400) =>
  Array.isArray(v)
    ? v
        .map((x) => str(x, len))
        .filter(Boolean)
        .slice(0, max)
    : [];
const dir = (v: unknown): Direction => (v === "long" || v === "short" ? v : "neutral");
const side = (v: unknown): "long" | "short" | null => (v === "long" || v === "short" ? v : null);

function readScenario(v: unknown): Scenario | null {
  const o = obj(v);
  if (!o || !str(o.description)) return null;
  return {
    title: str(o.title, 120) || "Scenario",
    direction: dir(o.direction),
    instrument: strOrNull(o.instrument, 40),
    description: str(o.description, 1200),
    trigger: strOrNull(o.trigger),
    targets: nums(o.targets),
    invalidation: num(o.invalidation),
    likelihood: strOrNull(o.likelihood, 60),
  };
}

export function readSummary(value: unknown): ExternalSummary {
  const o = obj(value);
  if (!o || !str(o.overview)) throw new Error("not a summary");
  const list = <T>(v: unknown, read: (x: Record<string, unknown>) => T | null, max: number) =>
    Array.isArray(v)
      ? v
          .map((x) => (obj(x) ? read(obj(x)!) : null))
          .filter((x): x is T => x !== null)
          .slice(0, max)
      : [];
  return {
    overview: str(o.overview, 1500),
    bias: dir(o.bias),
    instruments: strs(o.instruments, 12, 40),
    timeframe: strOrNull(o.timeframe, 80),
    mainScenario: readScenario(o.mainScenario),
    mainReasons: strs(o.mainReasons),
    secondaryScenario: readScenario(o.secondaryScenario),
    secondaryReasons: strs(o.secondaryReasons),
    openTrades: list(
      o.openTrades,
      (t) => {
        const direction = side(t.direction);
        const instrument = str(t.instrument, 40);
        return direction && instrument
          ? {
              instrument,
              direction,
              entry: num(t.entry),
              stopLoss: num(t.stopLoss),
              takeProfits: nums(t.takeProfits),
              note: str(t.note),
            }
          : null;
      },
      10,
    ),
    tradeIdeas: list(
      o.tradeIdeas,
      (t) => {
        const direction = side(t.direction);
        const instrument = str(t.instrument, 40);
        let low = num(t.entryLow);
        let high = num(t.entryHigh);
        if (low !== null && high !== null && low > high) [low, high] = [high, low];
        return direction && instrument
          ? {
              instrument,
              direction,
              when: str(t.when),
              entryLow: low,
              entryHigh: high,
              stopLoss: num(t.stopLoss),
              takeProfits: nums(t.takeProfits),
              note: str(t.note),
            }
          : null;
      },
      10,
    ),
    keyLevels: list(
      o.keyLevels,
      (l) => {
        const price = num(l.price);
        return price === null
          ? null
          : {
              instrument: strOrNull(l.instrument, 40),
              price,
              kind: l.kind === "support" || l.kind === "resistance" ? l.kind : "other",
              note: str(l.note, 200),
            };
      },
      30,
    ),
    caveats: strs(o.caveats, 8),
  };
}

// ── As markdown, for the day note ──

const price = (n: number) => String(Number(n.toPrecision(8)));
const prices = (list: number[]) => list.map(price).join(", ");
const direction = (d: Direction) => (d === "neutral" ? "neutral" : d);

function scenarioLines(label: string, s: Scenario, reasons: string[]) {
  const facts = [
    s.trigger ? `trigger: ${s.trigger}` : "",
    s.targets.length ? `targets ${prices(s.targets)}` : "",
    s.invalidation !== null ? `invalid at ${price(s.invalidation)}` : "",
    s.likelihood ? `likelihood: ${s.likelihood}` : "",
  ].filter(Boolean);
  return [
    `**${label}: ${s.title}** (${direction(s.direction)}${s.instrument ? `, ${s.instrument}` : ""})`,
    s.description,
    ...(facts.length ? [`_${facts.join(" · ")}_`] : []),
    ...(reasons.length ? ["Why:", ...reasons.map((r) => `- ${r}`)] : []),
  ];
}

export function summaryMarkdown(
  summary: ExternalSummary,
  video: { title: string; url: string; channelTitle: string; publishedAt: string },
): string {
  const out: string[] = [
    `## External opinion: ${video.channelTitle || "YouTube"}`,
    `[${video.title.replace(/[[\]]/g, "")}](${video.url}) · published ${video.publishedAt.slice(0, 16).replace("T", " ")} UTC · bias ${summary.bias}`,
    "",
    summary.overview,
  ];
  if (summary.mainScenario)
    out.push("", ...scenarioLines("Main scenario", summary.mainScenario, summary.mainReasons));
  if (summary.secondaryScenario)
    out.push(
      "",
      ...scenarioLines("Secondary scenario", summary.secondaryScenario, summary.secondaryReasons),
    );
  if (summary.openTrades.length)
    out.push(
      "",
      "**Their open trades**",
      ...summary.openTrades.map(
        (t) =>
          `- ${t.instrument} ${t.direction}${t.entry !== null ? ` from ${price(t.entry)}` : ""}${t.stopLoss !== null ? `, stop ${price(t.stopLoss)}` : ""}${t.takeProfits.length ? `, take profit ${prices(t.takeProfits)}` : ""}${t.note ? `. ${t.note}` : ""}`,
      ),
    );
  if (summary.tradeIdeas.length)
    out.push(
      "",
      "**Trade ideas**",
      ...summary.tradeIdeas.map((t) => {
        const entry =
          t.entryLow !== null && t.entryHigh !== null && t.entryLow !== t.entryHigh
            ? `${price(t.entryLow)} to ${price(t.entryHigh)}`
            : t.entryLow !== null || t.entryHigh !== null
              ? price((t.entryLow ?? t.entryHigh)!)
              : null;
        return `- ${t.instrument} ${t.direction}${t.when ? ` when ${t.when}` : ""}${entry ? `, entry ${entry}` : ""}${t.stopLoss !== null ? `, stop ${price(t.stopLoss)}` : ""}${t.takeProfits.length ? `, take profit ${prices(t.takeProfits)}` : ""}${t.note ? `. ${t.note}` : ""}`;
      }),
    );
  if (summary.keyLevels.length)
    out.push(
      "",
      `**Key levels:** ${summary.keyLevels
        .map(
          (l) =>
            `${l.instrument ? `${l.instrument} ` : ""}${price(l.price)} (${l.kind}${l.note ? `, ${l.note}` : ""})`,
        )
        .join("; ")}`,
    );
  if (summary.caveats.length) out.push("", "**Caveats**", ...summary.caveats.map((c) => `- ${c}`));
  return out.join("\n");
}
