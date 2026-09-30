import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * AI answers the journal can act on: each is a suggestion returned as data, checked by hand,
 * and nothing changes until the trader applies it.
 */
const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-ai-actions-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, trades, settings, journalDays, playbooks, tradeRuleChecks } =
  await import("../src/db");
const { eq } = await import("drizzle-orm");
const { insertExecutions } = await import("../src/server/executions");
const { setSetting } = await import("../src/server/settings");
const { queryTrades } = await import("../src/server/trades-query");
const { anthropic, anthropicMessage, openaiMessage, geminiMessage, script } =
  await import("./ai-provider-fixtures");
const suggestLabels = await import("../src/app/api/ai/suggest-labels/route");
const suggestMapping = await import("../src/app/api/ai/suggest-mapping/route");
const structureNote = await import("../src/app/api/ai/structure-note/route");
const goalsRoute = await import("../src/app/api/goals/route");
const periodReview = await import("../src/app/api/ai/period-review/route");
const suggestGoals = await import("../src/app/api/ai/suggest-goals/route");
const { listMessages } = await import("../src/server/ai-agent/store");
const planDraft = await import("../src/app/api/ai/plan-draft/route");
const analysesRoute = await import("../src/app/api/analyses/route");
const { importCsvDataset } = await import("../src/server/market-data/csv");
const chartLevels = await import("../src/app/api/ai/chart-levels/route");
const { decodeImageDataUrl } = await import("../src/server/ai-images");
const notesSearch = await import("../src/app/api/notes-search/route");
const playbookCheck = await import("../src/app/api/ai/playbook-check/route");

const post = (route: { POST: (r: Request) => Promise<Response> }, body: unknown) =>
  route.POST(
    new Request("http://localhost/api/ai/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const fills = (symbol: string, exit: number, date: string) => [
  {
    symbol,
    side: "buy" as const,
    quantity: 2,
    price: 100,
    fee: 1,
    executedAt: `${date}T14:00:00Z`,
  },
  {
    symbol,
    side: "sell" as const,
    quantity: 2,
    price: exit,
    fee: 1,
    executedAt: `${date}T15:00:00Z`,
  },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("JOURNAL_PASSWORD", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic-key");
  db.delete(tradeRuleChecks).run();
  db.delete(trades).run();
  db.delete(executions).run();
  db.delete(accounts).run();
  db.delete(settings).run();
  db.delete(journalDays).run();
  db.delete(playbooks).run();
  db.insert(accounts)
    .values({ id: "a", name: "Account A", kind: "manual", createdAt: "2026-01-01" })
    .run();
  insertExecutions("a", fills("AAA", 90, "2026-09-15"), "manual");
  setSetting("timeZone", "UTC");
});

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const tradeKey = () => queryTrades({}).trades[0]!.key;

describe("the playbook check", () => {
  const withPlaybook = () => {
    db.insert(playbooks)
      .values({
        id: "pb",
        name: "Opening drive",
        description: "Trade the first push.",
        rulesJson: JSON.stringify([
          "Stop below the opening range",
          "Exit by 16:00",
          "One trade a day",
        ]),
        createdAt: "x",
      })
      .run();
    db.update(trades).set({ playbookId: "pb" }).run();
  };

  it("judges each written rule with its evidence, and changes nothing by itself", async () => {
    withPlaybook();
    const provider = script(() =>
      anthropicMessage(
        JSON.stringify({
          checks: [
            { rule: 1, verdict: "unclear", reason: "No stop was recorded." },
            { rule: 2, verdict: "followed", reason: "Sold at 15:00." },
            { rule: 9, verdict: "broken", reason: "A rule that does not exist." },
          ],
          summary: "Kept the time rule; the stop is unknown.",
        }),
      ),
    );
    const response = await post(playbookCheck, { key: tradeKey() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      playbook: "Opening drive",
      summary: "Kept the time rule; the stop is unknown.",
      checks: [
        {
          rule: "Stop below the opening range",
          verdict: "unclear",
          reason: "No stop was recorded.",
        },
        { rule: "Exit by 16:00", verdict: "followed", reason: "Sold at 15:00." },
        // A rule the AI skipped is unclear; one it invented is dropped.
        { rule: "One trade a day", verdict: "unclear", reason: "Not assessed by the AI." },
      ],
      marketContext: false,
    });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("1. Stop below the opening range");
    expect(asked).toContain("2026-09-15T15:00:00.000Z sell 2 @ 90");
    expect(
      db.select().from(tradeRuleChecks).where(eq(tradeRuleChecks.tradeKey, tradeKey())).all(),
    ).toEqual([]);
  });

  it("needs a playbook with rules, and a readable answer", async () => {
    expect((await (await post(playbookCheck, { key: tradeKey() })).json()).error).toMatch(
      /Assign a playbook/,
    );
    withPlaybook();
    script(() => anthropicMessage(JSON.stringify({ checks: "nope", summary: 1 })));
    const unreadable = await post(playbookCheck, { key: tradeKey() });
    expect(unreadable.status).toBe(500);
    expect((await unreadable.json()).error).toMatch(/could not read/);
  });
});

describe("suggested labels", () => {
  const answer = JSON.stringify({
    trades: [
      {
        trade: 1,
        tags: ["Breakout", "breakout-retest"],
        mistakes: ["no stop"],
        rating: 2,
        reason: "No stop was set and the loss ran.",
      },
    ],
  });

  it("reuse the labels in use, mark new ones, and leave out what the trade has", async () => {
    db.update(trades)
      .set({ tagsJson: JSON.stringify(["Breakout"]), mistakesJson: JSON.stringify(["No stop"]) })
      .run();
    insertExecutions("a", fills("BBB", 110, "2026-09-16"), "manual");
    const key = queryTrades({ symbol: "AAA" }).trades[0]!.key;
    const provider = script(() => anthropicMessage(answer));
    const response = await post(suggestLabels, { keys: [key] });
    expect(response.status).toBe(200);
    const [s] = (await response.json()).suggestions;
    expect(s).toMatchObject({
      key,
      symbol: "AAA",
      // "Breakout" and "no stop" are already on the trade (in any case).
      tags: ["breakout-retest"],
      mistakes: [],
      newLabels: ["breakout-retest"],
      rating: 2,
      currentTags: ["Breakout"],
      reason: "No stop was set and the loss ran.",
    });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("Tags in use: Breakout");
    expect(asked).toContain("Mistakes in use: No stop");
    // Nothing is saved until applied.
    expect(queryTrades({ symbol: "AAA" }).trades[0]!.annotations?.tags).toEqual(["Breakout"]);
  });

  it("read the same answer from OpenAI and Gemini", async () => {
    const key = tradeKey();
    setSetting("aiProvider", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    let provider = script(() => openaiMessage(answer));
    let s = (await (await post(suggestLabels, { keys: [key] })).json()).suggestions[0];
    expect(s.tags).toEqual(["Breakout", "breakout-retest"]);
    expect((provider.body(0) as { text?: { format?: { type?: string } } }).text?.format?.type).toBe(
      "json_schema",
    );

    setSetting("aiProvider", "google");
    vi.stubEnv("GEMINI_API_KEY", "fixture-gemini-key");
    provider = script(() => geminiMessage(answer));
    s = (await (await post(suggestLabels, { keys: [key] })).json()).suggestions[0];
    expect(s.mistakes).toEqual(["no stop"]);
    expect(JSON.stringify(provider.body(0))).toContain("responseSchema");
  });

  it("take 1 to 20 existing trades", async () => {
    const provider = script();
    for (const keys of [[], Array.from({ length: 21 }, (_, i) => `k${i}`), ["missing"]]) {
      const response = await post(suggestLabels, { keys });
      expect(response.status).toBe(400);
    }
    expect(provider.fetcher).not.toHaveBeenCalled();
  });
});

describe("column mapping help", () => {
  const csv = [
    "Trade Date/Time,Instrument,B/S,Qty,Fill Px,Comm,Account No",
    "2026-09-15 14:00:01,ESZ6,B,2,5000.25,2.1,U1234567",
    "2026-09-15 14:30:09,ESZ6,S,2,5004.75,2.1,U1234567",
    ...Array.from(
      { length: 20 },
      (_, i) => `2026-09-16 10:0${i % 10}:00,NQZ6,B,1,18000,1,U1234567`,
    ),
  ].join("\n");

  it("suggests real columns only, and sends just the header and five rows", async () => {
    const provider = script(() =>
      anthropicMessage(
        JSON.stringify({
          symbol: "Instrument",
          side: "B/S",
          quantity: "Qty",
          price: "Fill Px",
          fee: "Commission", // not a header: dropped
          timestamp: "Instrument", // already used: dropped
          note: "B/S holds B or S.",
        }),
      ),
    );
    const response = await post(suggestMapping, { content: csv });
    expect(await response.json()).toEqual({
      mapping: { symbol: "Instrument", side: "B/S", quantity: "Qty", price: "Fill Px" },
      missing: ["timestamp"],
      note: "B/S holds B or S.",
    });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("Fill Px");
    expect((asked.match(/U1234567/g) ?? []).length).toBe(5);
  });
});

describe("a voice memo made into a note", () => {
  it("streams a note from the memo, asking to keep the trader's facts and Keep/Fix lists", async () => {
    const provider = script(() =>
      anthropic.text("**What happened**\nI waited.\n\n**Keep**\n- ", "Waiting for the retest\n"),
    );
    const response = await post(structureNote, {
      text: "so today I waited for the retest and my stop lost was fine",
      kind: "day",
      stream: true,
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events.at(-1)).toEqual({
      type: "done",
      note: "**What happened**\nI waited.\n\n**Keep**\n- Waiting for the retest",
    });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("add nothing they did not");
    expect(asked).toContain("my stop lost was fine");
  });

  it("needs a memo and a kind", async () => {
    for (const body of [{ text: "", kind: "day" }, { text: "hi", kind: "week" }, { text: "hi" }])
      expect((await post(structureNote, body)).status).toBe(400);
  });
});

describe("monthly and quarterly reviews", () => {
  const goals = (body: unknown) =>
    goalsRoute.POST(
      new Request("http://localhost/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("measure each goal, and the review is written from them as a chat", async () => {
    let state = await (
      await goals({
        kind: "month",
        period: "2026-09",
        metric: "winRate",
        comparator: "atLeast",
        target: 0.5,
      })
    ).json();
    state = await (
      await goals({ kind: "month", period: "2026-09", text: "No trades before 9:45" })
    ).json();
    expect(state.goals.map((g: { status: string }) => g.status)).toEqual(["missed", "unknown"]);
    expect(state.measures.netPnl).toBe(-22);

    const provider = script(() => anthropic.text("**Goals**\n- Win rate missed."));
    const response = await post(periodReview, {
      kind: "month",
      period: "2026-09",
      timeZone: "UTC",
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events[0]).toMatchObject({
      type: "conversation",
      conversation: {
        title: "Monthly review · September 2026",
        filters: { from: "2026-09-01", to: "2026-09-30" },
      },
    });
    expect(events.at(-1)).toMatchObject({ type: "done" });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("Win rate at least 50%: 0% (missed)");
    expect(asked).toContain("Written goal: No trades before 9:45");
    expect(asked).toContain("Net P&L: -22.00 (August 2026: n/a)");
    expect(listMessages(events[0].conversation.id)[0]!.content).toBe(
      "Monthly review for September 2026",
    );
  });

  it("refuse malformed goals and empty periods", async () => {
    for (const body of [
      { kind: "month", period: "2026-9", text: "x" },
      { kind: "month", period: "2026-09", metric: "luck", comparator: "atLeast", target: 1 },
      { kind: "month", period: "2026-09", metric: "winRate", comparator: "atLeast" },
      { kind: "month", period: "2026-09" },
    ])
      expect((await goals(body)).status).toBe(400);
    const provider = script();
    expect((await post(periodReview, { kind: "month", period: "2026-03" })).status).toBe(400);
    expect(provider.fetcher).not.toHaveBeenCalled();
  });

  it("suggest the next period's goals, checked against the metrics", async () => {
    script(() =>
      anthropicMessage(
        JSON.stringify({
          goals: [
            {
              metric: "stopShare",
              comparator: "atLeast",
              target: 0.9,
              text: "",
              reason: "No stops in September.",
            },
            { metric: "luck", comparator: "atLeast", target: 1, text: "Be lucky", reason: "?" },
          ],
        }),
      ),
    );
    const response = await post(suggestGoals, { kind: "month", period: "2026-10" });
    expect(await response.json()).toMatchObject({
      basedOn: { id: "2026-09" },
      goals: [
        {
          metric: "stopShare",
          comparator: "atLeast",
          target: 0.9,
          reason: "No stops in September.",
        },
        // An unknown metric falls back to the written goal.
        { metric: null, comparator: null, target: null, text: "Be lucky" },
      ],
    });
  });
});

describe("a pre-market plan draft", () => {
  it("drafts from the chart's levels and the previous session, and checks the prices", async () => {
    const day = Date.parse("2026-09-15T00:00:00Z");
    importCsvDataset({
      name: "PLAN daily",
      symbol: "PLAN",
      resolution: "1d",
      currency: "USD",
      priceBasis: "raw",
      content: ["time,open,high,low,close,volume"]
        .concat(
          Array.from({ length: 5 }, (_, i) => {
            const t = new Date(day - (5 - i) * 86_400_000).toISOString();
            return `${t},${100 + i},${105 + i},${98 + i},${102 + i},1000`;
          }),
        )
        .join("\n"),
    });
    const created = await (
      await post(analysesRoute, {
        title: "PLAN levels",
        symbol: "PLAN",
        provider: "market-csv",
        resolution: "1d",
        rangeFrom: day - 10 * 86_400_000,
        rangeTo: day,
        drawings: {
          version: 1,
          drawings: [
            {
              id: "res",
              type: "hline",
              paneId: "price",
              anchors: [{ time: day - 86_400_000, price: 110 }],
              style: {},
              visible: true,
              locked: false,
            },
          ],
        },
      })
    ).json();
    const provider = script(() =>
      anthropicMessage(
        JSON.stringify({
          bias: "long",
          biasReason: "Higher closes all week.",
          scenarios: [
            {
              name: "Break of 110",
              direction: "long",
              trigger: 110,
              target: 115,
              invalidation: 112, // above the trigger: wrong for a long
              note: "",
              levelNote: "the horizontal line at 110",
            },
          ],
        }),
      ),
    );
    const response = await post(planDraft, { analysisId: created.analysis.id, day: "2026-09-15" });
    expect(await response.json()).toMatchObject({
      day: "2026-09-15",
      bias: "long",
      scenarios: [
        {
          name: "Break of 110",
          trigger: 110,
          target: 115,
          invalidation: null,
          problems: ["the invalidation was on the wrong side of the trigger for a long"],
        },
      ],
    });
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("Previous session: open 104, high 109, low 102, close 106");
    expect(asked).toMatch(/: 110\\n/);
  });
});

describe("levels read from a chart screenshot", () => {
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64")}`;

  it("accept real PNG, JPEG and WebP pictures only", () => {
    expect(decodeImageDataUrl(jpeg)).toMatchObject({ mediaType: "image/jpeg" });
    // A PNG label on JPEG bytes is refused.
    expect(decodeImageDataUrl(jpeg.replace("image/jpeg", "image/png"))).toBeNull();
    expect(decodeImageDataUrl("data:image/gif;base64,R0lGODlh")).toBeNull();
  });

  it("send the picture, and set aside levels that don't fit the chart", async () => {
    const provider = script(() =>
      anthropicMessage(
        JSON.stringify({
          symbolShown: "ES1!",
          axis: { low: 4900, high: 5100 },
          levels: [
            {
              kind: "line",
              price: 5050,
              low: null,
              high: null,
              label: "PDH",
              role: "resistance",
              confidence: "high",
            },
            {
              kind: "zone",
              price: null,
              low: 4960,
              high: 4940,
              label: "demand",
              role: "support",
              confidence: "medium",
            },
            {
              kind: "line",
              price: 50.5,
              low: null,
              high: null,
              label: "misread",
              role: null,
              confidence: "low",
            },
          ],
        }),
      ),
    );
    const response = await post(chartLevels, { image: jpeg, symbol: "ES", lastPrice: 5000 });
    const body = await response.json();
    expect(body.levels).toEqual([
      {
        kind: "line",
        low: 5050,
        high: 5050,
        label: "PDH",
        role: "resistance",
        confidence: "high",
        doubt: null,
      },
      {
        kind: "zone",
        low: 4940,
        high: 4960,
        label: "demand",
        role: "support",
        confidence: "medium",
        doubt: null,
      },
      {
        kind: "line",
        low: 50.5,
        high: 50.5,
        label: "misread",
        role: null,
        confidence: "low",
        doubt: "outside the chart's price axis; far from the current price (5000)",
      },
    ]);
    const sent = JSON.stringify(provider.body(0));
    expect(sent).toContain('"media_type":"image/jpeg"');
    expect(sent).toContain("should be ES");
    expect((await post(chartLevels, { image: "data:text/plain;base64,aGk=" })).status).toBe(400);
  });
});

describe("searching notes", () => {
  const notesFor = () => {
    db.insert(journalDays)
      .values([
        {
          date: "2026-09-01",
          note: "I hesitated and could not pull the trigger after the stop-out.",
          updatedAt: "x",
        },
        {
          date: "2026-09-02",
          note: "Clean breakout, sized right, followed the plan.",
          updatedAt: "x",
        },
        { date: "2026-09-15", note: "Froze again after a loss today.", updatedAt: "x" },
      ])
      .run();
  };
  /** OpenAI embeddings that put hesitation near freezing, and everything else apart. */
  const embeddings = () => {
    const calls: string[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const input = (JSON.parse(String(init.body)) as { input: string[] }).input;
        calls.push(input);
        return Response.json({
          object: "list",
          model: "text-embedding-3-small",
          data: input.map((text, index) => ({
            object: "embedding",
            index,
            embedding: /froze|hesitat|trigger/i.test(text) ? [1, 0.1, 0] : [0, 1, 0.2],
          })),
          usage: { prompt_tokens: 1, total_tokens: 1 },
        });
      }),
    );
    return calls;
  };
  const search = async (body: unknown) => (await post(notesSearch, body)).json();

  it("find a past day by meaning, and embed each passage once", async () => {
    notesFor();
    setSetting("aiProvider", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    const calls = embeddings();
    const found = await search({ query: "freezing up" });
    expect(found.mode).toBe("meaning");
    const indexed = calls.flat().length;
    // Three day notes and the question.
    expect(indexed).toBe(4);
    const similar = await search({ similarTo: { date: "2026-09-15" } });
    // The day itself is left out; the hesitation day is the match.
    expect(similar.results.map((r: { id: string }) => r.id)).toEqual(["2026-09-01"]);
    // Only the question was embedded the second time.
    expect(calls.flat().length).toBe(indexed + 1);
  });

  it("search by words, on this server, when the provider has no embeddings", async () => {
    notesFor();
    const provider = script();
    const result = await search({ query: "breakout plan" });
    expect(result.mode).toBe("words");
    expect(result.note).toMatch(/Anthropic has no embeddings/);
    expect(result.results[0].id).toBe("2026-09-02");
    expect(provider.fetcher).not.toHaveBeenCalled();
  });
});
