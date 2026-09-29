import { describe, expect, it, vi } from "vitest";
import { readSummary, summaryMarkdown } from "../src/lib/external-summary";

vi.mock("../src/server/ai", () => ({ runAi: vi.fn(async () => "notes") }));
vi.mock("../src/server/ai-structured", () => ({
  runAiObject: vi.fn(async (options: { prompt: string; read: (v: unknown) => unknown }) =>
    options.read({ overview: `Seen: ${options.prompt.length}`, bias: "neutral" }),
  ),
}));
const { runAi } = await import("../src/server/ai");
const { runAiObject } = await import("../src/server/ai-structured");
const { summarizeTranscript, WHOLE_CHARS } =
  await import("../src/server/external-analysis/summarize");

const full = {
  overview: "BTC holds 64k.",
  bias: "long",
  instruments: ["BTC"],
  timeframe: null,
  mainScenario: {
    title: "Push to 70k",
    direction: "long",
    instrument: "BTC",
    description: "Up from 64k.",
    trigger: "hold 64,000",
    targets: [70000, 72000],
    invalidation: 61500,
    likelihood: "70%",
  },
  mainReasons: ["Support holds", 5, ""],
  secondaryScenario: {
    title: "Break down",
    direction: "short",
    instrument: "BTC",
    description: "Below 61.5k to 58k.",
    trigger: null,
    targets: [58000, -1],
    invalidation: null,
    likelihood: null,
  },
  secondaryReasons: ["Range low breaks"],
  openTrades: [
    {
      instrument: "BTC",
      direction: "long",
      entry: 63200,
      stopLoss: 61400,
      takeProfits: [70000],
      note: "",
    },
    { instrument: "", direction: "long" },
  ],
  tradeIdeas: [
    {
      instrument: "ETH",
      direction: "short",
      when: "on a rejection of 3,500",
      entryLow: 3520,
      entryHigh: 3480,
      stopLoss: 3600,
      takeProfits: [3200],
      note: "",
    },
  ],
  keyLevels: [
    { instrument: "BTC", price: 64000, kind: "support", note: "range low" },
    { price: "high", kind: "other" },
  ],
  caveats: [],
};

describe("a video summary", () => {
  it("is read by hand: bad entries dropped, prices checked, the entry zone put in order", () => {
    const s = readSummary(full);
    expect(s.mainReasons).toEqual(["Support holds"]);
    expect(s.secondaryScenario?.targets).toEqual([58000]);
    expect(s.openTrades).toHaveLength(1);
    expect(s.tradeIdeas[0]).toMatchObject({ entryLow: 3480, entryHigh: 3520 });
    expect(s.keyLevels).toHaveLength(1);
    expect(() => readSummary({ bias: "long" })).toThrow();
  });

  it("goes into the day note as an External opinion section", () => {
    const md = summaryMarkdown(readSummary(full), {
      title: "BTC [update]",
      url: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
      channelTitle: "Crypto Banter",
      publishedAt: "2026-09-29T14:09:07.000Z",
    });
    expect(md.split("\n")).toEqual([
      "## External opinion: Crypto Banter",
      "[BTC update](https://www.youtube.com/watch?v=AAAAAAAAAAA) · published 2026-09-29 14:09 UTC · bias long",
      "",
      "BTC holds 64k.",
      "",
      "**Main scenario: Push to 70k** (long, BTC)",
      "Up from 64k.",
      "_trigger: hold 64,000 · targets 70000, 72000 · invalid at 61500 · likelihood: 70%_",
      "Why:",
      "- Support holds",
      "",
      "**Secondary scenario: Break down** (short, BTC)",
      "Below 61.5k to 58k.",
      "_targets 58000_",
      "Why:",
      "- Range low breaks",
      "",
      "**Their open trades**",
      "- BTC long from 63200, stop 61400, take profit 70000",
      "",
      "**Trade ideas**",
      "- ETH short when on a rejection of 3,500, entry 3480 to 3520, stop 3600, take profit 3200",
      "",
      "**Key levels:** BTC 64000 (support, range low)",
    ]);
  });
});

describe("a long transcript", () => {
  const video = {
    title: "Stream",
    channelTitle: "C",
    publishedAt: "2026-09-29T00:00:00Z",
    description: "",
    url: "u",
  };
  it("is sent whole up to a length, and in condensed parts beyond it", async () => {
    await summarizeTranscript(video, "word ".repeat(1000), "English");
    expect(runAi).not.toHaveBeenCalled();
    await summarizeTranscript(video, "x".repeat(WHOLE_CHARS + 70_000), "English");
    // 190k characters in 60k parts.
    expect(runAi).toHaveBeenCalledTimes(4);
    const last = vi.mocked(runAiObject).mock.calls.at(-1)![0].prompt;
    expect(last).toContain("Notes from the transcript, part by part");
    expect(last).not.toContain("xxxxxxxxxx");
  });
});
