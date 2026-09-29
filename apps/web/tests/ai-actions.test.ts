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
const { anthropicMessage, openaiMessage, geminiMessage, script } =
  await import("./ai-provider-fixtures");
const suggestLabels = await import("../src/app/api/ai/suggest-labels/route");
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
    expect(asked).toContain("2026-09-15T15:00:00Z sell 2 @ 90");
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
