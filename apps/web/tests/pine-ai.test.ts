import { describe, expect, it, vi } from "vitest";
import { isStrategyScript, pineAiProblem, pinePrompt, readPineAnswer } from "../src/lib/pine-ai";

const runAi = vi.fn();
vi.mock("@/server/ai", () => ({ runAi: (...args: unknown[]) => runAi(...args) }));
const route = await import("../src/app/api/ai/pine-script/route");

const script = `//@version=5
strategy("EMA cross", overlay=true)
if ta.crossover(ta.ema(close, 9), ta.ema(close, 21))
    strategy.entry("Long", strategy.long)`;

describe("asking the AI for a strategy", () => {
  it("asks for a new script, a change to the current one, or a fix with its error", () => {
    const create = pinePrompt({
      mode: "create",
      request: "EMA 9/21 cross",
      current: "",
      error: "",
    });
    expect(create).toContain("EMA 9/21 cross");
    expect(create).toContain("//@version=5");
    expect(create).not.toContain("The strategy now");
    const edit = pinePrompt({ mode: "edit", request: "add a 2% stop", current: script, error: "" });
    expect(edit).toContain("add a 2% stop");
    expect(edit).toContain('strategy("EMA cross"');
    const fix = pinePrompt({ mode: "fix", request: "", current: script, error: "line 3: x" });
    expect(fix).toContain("line 3: x");
  });

  it("refuses a request it cannot act on", () => {
    expect(pineAiProblem({ mode: "create", request: "x" })).toBeNull();
    expect(pineAiProblem({ mode: "create", request: " " })).toMatch(/Describe/);
    expect(pineAiProblem({ mode: "edit", request: "x", current: "" })).toMatch(/no script/);
    expect(pineAiProblem({ mode: "fix", current: script, error: "boom" })).toBeNull();
    expect(pineAiProblem({ mode: "rewrite", request: "x" })).toMatch(/create, edit or fix/);
    expect(pineAiProblem({ mode: "create", request: "x".repeat(4001) })).toMatch(/4,000/);
  });

  it("reads the script from the answer, even while it is still being written", () => {
    expect(readPineAnswer(`\`\`\`pine\n${script}\n\`\`\`\nCrosses of two EMAs.`)).toEqual({
      script,
      notes: "Crosses of two EMAs.",
    });
    expect(readPineAnswer("```pine\n//@version=5\nstrat").script).toBe("//@version=5\nstrat");
    expect(readPineAnswer(script).script).toBe(script);
    expect(readPineAnswer("I can't help with that.")).toEqual({
      script: "",
      notes: "I can't help with that.",
    });
    expect(isStrategyScript(script)).toBe(true);
    expect(isStrategyScript('//@version=5\nindicator("x")')).toBe(false);
  });

  it("answers with the script and notes, saving nothing", async () => {
    vi.stubEnv("JOURNAL_PASSWORD", "");
    runAi.mockResolvedValueOnce(`\`\`\`pine\n${script}\n\`\`\`\nTune the lengths.`);
    const response = await route.POST(
      new Request("http://journal.test/api/ai/pine-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", request: "EMA 9/21 cross" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ script, notes: "Tune the lengths." });
    const bad = await route.POST(
      new Request("http://journal.test/api/ai/pine-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "edit", request: "x" }),
      }),
    );
    expect(bad.status).toBe(400);
    vi.unstubAllEnvs();
  });
});
