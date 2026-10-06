/**
 * Asking the AI for a Pine Script strategy in the strategy tester: write a new one from a
 * request, change or complete the one in the editor, or fix the one that failed to run.
 * The prompt and the reading of the answer are pure, so they are tested without a model.
 */
export type PineAiMode = "create" | "edit" | "fix";
export const PINE_AI_MODES: readonly PineAiMode[] = ["create", "edit", "fix"];

export const MAX_PINE_REQUEST = 4_000;
export const MAX_PINE_SOURCE = 60_000;
export const MAX_PINE_ERROR = 4_000;

export interface PineAiInput {
  mode: PineAiMode;
  /** What the trader asked for (optional when fixing). */
  request: string;
  /** The script in the editor (required to edit or fix). */
  current: string;
  /** Why the last run failed (fixing). */
  error: string;
}

/** Why the input can't be sent, or null. */
export function pineAiProblem(value: unknown): string | null {
  const v = value as Partial<Record<keyof PineAiInput, unknown>> | null;
  if (!v || typeof v !== "object") return "Invalid request.";
  if (!PINE_AI_MODES.includes(v.mode as PineAiMode)) return "Choose create, edit or fix.";
  const text = (x: unknown, max: number) =>
    x === undefined || (typeof x === "string" && x.length <= max);
  if (!text(v.request, MAX_PINE_REQUEST))
    return "Describe the strategy in at most 4,000 characters.";
  if (!text(v.current, MAX_PINE_SOURCE)) return "The script is too long to send.";
  if (!text(v.error, MAX_PINE_ERROR)) return "The error message is too long.";
  const request = typeof v.request === "string" ? v.request.trim() : "";
  const current = typeof v.current === "string" ? v.current.trim() : "";
  if (v.mode !== "fix" && !request) return "Describe what the strategy should do.";
  if (v.mode !== "create" && !current) return "There is no script in the editor to change.";
  return null;
}

/** The rules the journal's Pine engine (PineTS, through Vela) runs strategies by. */
const RULES = `Write Pine Script version 5 for a strategy tester that runs PineTS (a Pine Script
engine) on one symbol and one candle size:
- Start with "//@version=5" and one strategy(...) declaration with overlay=true and, unless the
  trader asked otherwise, initial_capital=10000, default_qty_type=strategy.percent_of_equity,
  default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.05.
- Use only built-in series (open, high, low, close, volume, time), ta.* functions, math.*,
  input.int / input.float / input.bool for the parameters a trader would tune, and
  strategy.entry, strategy.close, strategy.exit (stop=, limit=, trail_points=), strategy.position_size
  and strategy.position_avg_price. No request.security, no other symbols or timeframes, no
  libraries, no arrays or matrices, no labels or tables; plot() the lines that explain it.
- Entries must not repeat while a position is open unless pyramiding is intended and set.
- Keep it short and readable, with a comment line above each block saying what it does.`;

/** The prompt for one request. */
export function pinePrompt(input: PineAiInput): string {
  const request = input.request.trim();
  const task =
    input.mode === "create"
      ? `Write a new strategy that does this:\n"""\n${request}\n"""`
      : input.mode === "edit"
        ? `Change or complete this strategy as asked, keeping everything the request does not touch:\n"""\n${request}\n"""\n\nThe strategy now:\n\`\`\`pine\n${input.current.trim()}\n\`\`\``
        : `This strategy failed to run with the error below. Fix it so it runs, changing as little as possible${request ? `, and also: ${request}` : ""}.\n\nError:\n"""\n${input.error.trim() || "(no message)"}\n"""\n\nThe strategy:\n\`\`\`pine\n${input.current.trim()}\n\`\`\``;
  return `${RULES}

${task}

Answer with the whole script in one \`\`\`pine code block, then at most three short lines saying what it does and what to tune. Nothing before the code block.`;
}

/**
 * The script in an answer (its first fenced code block, or the whole answer when it has none
 * and reads as Pine), and the explanation after it. A partial answer still being written
 * gives the code so far.
 */
export function readPineAnswer(text: string): { script: string; notes: string } {
  const open = text.match(/```[a-zA-Z]*[ \t]*\n/);
  if (open && open.index !== undefined) {
    const start = open.index + open[0].length;
    const end = text.indexOf("```", start);
    const script = (end < 0 ? text.slice(start) : text.slice(start, end)).trimEnd();
    const notes = end < 0 ? "" : text.slice(end + 3).trim();
    return { script, notes };
  }
  const trimmed = text.trim();
  return /\/\/@version|\bstrategy\s*\(/.test(trimmed)
    ? { script: trimmed, notes: "" }
    : { script: "", notes: trimmed };
}

/** Whether a script is ready to run as a strategy. */
export const isStrategyScript = (script: string) =>
  /\/\/@version\s*=\s*5/.test(script) && /\bstrategy\s*\(/.test(script);
