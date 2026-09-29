import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-ai-chat-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, trades, settings, journalDays } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { setSetting } = await import("../src/server/settings");
const { queryTrades } = await import("../src/server/trades-query");
const { readAiRequest } = await import("../src/server/ai-scope");
const { POST: chat, GET: list } = await import("../src/app/api/ai/chat/route");
const { GET: read, DELETE: remove } = await import("../src/app/api/ai/chat/[id]/route");
const tools = await import("../src/server/ai-agent/tools");
const { POST: recap } = await import("../src/app/api/ai/recap/route");
const { POST: critique } = await import("../src/app/api/ai/critique/route");
const { POST: weekly } = await import("../src/app/api/ai/weekly/route");
const { postAiStream } = await import("../src/lib/ai-stream");
const { listMessages, listConversations } = await import("../src/server/ai-agent/store");

/** Tool calls that fetch candles would reach the network; these tests never make them. */
const post = (body: unknown, signal?: AbortSignal) =>
  chat(
    new Request("http://localhost/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    }),
  );
const events = async (response: Response) =>
  (await response.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });

const fills = (symbol: string, exit: number, date = "2026-09-15") => [
  {
    symbol,
    side: "buy" as const,
    quantity: 1,
    price: 100,
    fee: 0,
    executedAt: `${date}T09:00:00Z`,
  },
  {
    symbol,
    side: "sell" as const,
    quantity: 1,
    price: exit,
    fee: 0,
    executedAt: `${date}T10:00:00Z`,
  },
];

const { anthropic, openai, gemini, script } = await import("./ai-provider-fixtures");

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("JOURNAL_PASSWORD", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic-key");
  listConversations(); // creates the tables on first use
  db.$client.exec("DELETE FROM ai_messages; DELETE FROM ai_conversations;");
  db.delete(trades).run();
  db.delete(executions).run();
  db.delete(accounts).run();
  db.delete(settings).run();
  db.delete(journalDays).run();
  db.insert(accounts)
    .values(
      ["a", "b"].map((id) => ({
        id,
        name: `Account ${id.toUpperCase()}`,
        kind: "manual" as const,
        createdAt: "2026-01-01",
      })),
    )
    .run();
  insertExecutions("a", fills("ONLY_A", 110), "manual");
  insertExecutions("a", fills("ONLY_A", 95, "2026-09-16"), "manual");
  insertExecutions("b", fills("ONLY_B", 50), "manual");
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

describe("a chat answer", () => {
  it("looks things up with journal tools and streams the answer as it is written", async () => {
    const provider = script(
      () => anthropic.tool("toolu_1", "group_stats", { groupBy: "symbol" }),
      () => anthropic.text("Your best ", "symbol is ONLY_A."),
    );
    const response = await post({
      question: "Which symbol is best?",
      filters: {},
      timeZone: "UTC",
    });
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const stream = await events(response);
    expect(stream.map((e) => e.type)).toEqual([
      "conversation",
      "tool",
      "tool-done",
      "text",
      "text",
      "done",
    ]);
    expect(stream[1]).toMatchObject({ label: "Grouped trades by symbol" });
    expect(stream.filter((e) => e.type === "text").map((e) => e.delta)).toEqual([
      "Your best ",
      "symbol is ONLY_A.",
    ]);
    // The tool's result went back to the model in the second request.
    const followUp = JSON.stringify(provider.body(1));
    expect(followUp).toContain("ONLY_A");
    expect(followUp).toContain("ONLY_B");
    expect(JSON.stringify(provider.body(0))).not.toContain("fixture-anthropic-key");
  });

  it("can never widen the conversation's scope, even when a tool asks for other accounts", async () => {
    const provider = script(
      () => anthropic.tool("toolu_1", "find_trades", { filters: { accounts: "b" } }),
      () => anthropic.tool("toolu_2", "journal_overview", {}),
      () => anthropic.text("Only Account A is in scope."),
    );
    const stream = await events(
      await post({ question: "Show account B", filters: { accounts: "a" }, timeZone: "UTC" }),
    );
    expect(stream.at(-1)).toMatchObject({ type: "done" });
    const sent = JSON.stringify(provider.body(2));
    expect(sent).not.toContain("ONLY_B");
    expect(sent).not.toContain("Account B");
    expect(sent).toContain('\\"total\\":0');
    expect(sent).toContain("ONLY_A");
  });

  it("is saved with its lookups, and a follow-up keeps the conversation's scope and history", async () => {
    script(
      () => anthropic.tool("toolu_1", "journal_overview", {}),
      () => anthropic.text("Account A made 5.00."),
    );
    const first = await events(
      await post({ question: "How did I do?", filters: { accounts: "a" }, timeZone: "UTC" }),
    );
    const conversation = first[0]!.conversation as {
      id: string;
      title: string;
      scopeLabel: string;
    };
    expect(conversation.title).toBe("How did I do?");
    expect(conversation.scopeLabel).toContain("Account A");

    const provider = script(
      () => anthropic.tool("toolu_2", "find_trades", {}),
      () => anthropic.text("Two trades."),
    );
    const second = await events(
      await post({
        conversationId: conversation.id,
        question: "How many trades?",
        timeZone: "UTC",
      }),
    );
    expect(second.at(-1)).toMatchObject({ type: "done" });
    const request = provider.body(0) as { messages: { role: string; content: unknown }[] };
    expect(JSON.stringify(request.messages)).toContain("How did I do?");
    expect(JSON.stringify(request.messages)).toContain("Account A made 5.00.");
    expect(JSON.stringify(provider.body(1))).not.toContain("ONLY_B");

    const saved = await (
      await read(new Request("http://localhost"), {
        params: Promise.resolve({ id: conversation.id }),
      })
    ).json();
    expect(
      saved.messages.map((m: { role: string; content: string }) => [m.role, m.content]),
    ).toEqual([
      ["user", "How did I do?"],
      ["assistant", "Account A made 5.00."],
      ["user", "How many trades?"],
      ["assistant", "Two trades."],
    ]);
    expect(saved.messages[1].tools).toEqual([
      { name: "journal_overview", label: "Read the journal totals", ok: true },
    ]);

    const listed = await (await list(new Request("http://localhost/api/ai/chat"))).json();
    expect(listed.conversations).toHaveLength(1);
    expect(listed.conversations[0]).toMatchObject({ id: conversation.id, messages: 4 });

    const deleted = await remove(new Request("http://localhost"), {
      params: Promise.resolve({ id: conversation.id }),
    });
    expect(deleted.status).toBe(200);
    expect(listMessages(conversation.id)).toEqual([]);
  });

  it("works the same with OpenAI and Gemini tool calls", async () => {
    setSetting("aiProvider", "openai");
    vi.stubEnv("OPENAI_API_KEY", "fixture-openai-key");
    let provider = script(
      () => openai.tool("call_1", "find_trades", { filters: { symbol: "ONLY_A" } }),
      () => openai.text("Two ONLY_A trades."),
    );
    let stream = await events(await post({ question: "Count", filters: {}, timeZone: "UTC" }));
    expect(stream.map((e) => e.type)).toEqual([
      "conversation",
      "tool",
      "tool-done",
      "text",
      "done",
    ]);
    expect(JSON.stringify(provider.body(1))).toContain('\\"total\\":2');
    expect((provider.body(0) as { store?: boolean }).store).toBe(false);

    setSetting("aiProvider", "google");
    vi.stubEnv("GEMINI_API_KEY", "fixture-gemini-key");
    provider = script(
      () => gemini.tool("find_trades", { filters: { symbol: "ONLY_B" } }),
      () => gemini.text("One ONLY_B trade."),
    );
    stream = await events(await post({ question: "Count B", filters: {}, timeZone: "UTC" }));
    expect(stream.at(-1)).toMatchObject({ type: "done" });
    expect(String(provider.fetcher.mock.calls[0]![0])).toContain(":streamGenerateContent");
    // Gemini returns the tool's result as an object rather than as JSON text.
    expect(JSON.stringify(provider.body(1))).toContain('"total":1');
  });

  it("reports a provider failure without its message, and keeps nothing half-written", async () => {
    script(
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: {
              type: "authentication_error",
              message: "invalid x-api-key fixture-anthropic-key",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    );
    const stream = await events(await post({ question: "Hi", filters: {}, timeZone: "UTC" }));
    const error = stream.at(-1)!;
    expect(error.type).toBe("error");
    expect(error.message).toMatch(/^AI authentication_error/);
    expect(JSON.stringify(stream)).not.toContain("fixture-anthropic-key");
    const id = (stream[0]!.conversation as { id: string }).id;
    expect(listMessages(id).map((m) => m.role)).toEqual(["user"]);
  });

  it("keeps what was written when the trader stops it", async () => {
    const stop = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const encoder = new TextEncoder();
        const line = (c: object) =>
          encoder.encode(`event: ${(c as { type: string }).type}\ndata: ${JSON.stringify(c)}\n\n`);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(line(anthropic.start));
            controller.enqueue(
              line({
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              }),
            );
            controller.enqueue(
              line({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "Partial" },
              }),
            );
            // The rest never comes: the answer is stopped here.
            init.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
          },
        });
        return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
      }),
    );
    const response = await post(
      { question: "Long answer", filters: {}, timeZone: "UTC" },
      stop.signal,
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes('"text"')) text += decoder.decode((await reader.read()).value);
    stop.abort();
    while (!(await reader.read()).done);
    const id = JSON.parse(text.split("\n")[0]!).conversation.id as string;
    await vi.waitFor(() => expect(listMessages(id)).toHaveLength(2));
    expect(listMessages(id)[1]).toMatchObject({
      role: "assistant",
      content: "Partial",
      status: "stopped",
    });
  });
});

describe("chat requests", () => {
  it("are checked before any provider call", async () => {
    const provider = script();
    const cases: [unknown, RegExp][] = [
      [{ question: "Hi", timeZone: "UTC" }, /filters is required/],
      [{ question: "Hi", filters: { bogus: "1" }, timeZone: "UTC" }, /Unknown journal filter/],
      [{ question: "Hi", filters: {}, extra: 1 }, /Unknown chat request field/],
      [{ question: "Hi", filters: { accounts: "missing" } }, /no longer exists/],
      [{ question: "Hi", filters: { symbol: "NOTHING" } }, /No trades match/],
      [{ question: "Hi", filters: {}, kind: "day", anchor: "2026-13-01" }, /anchor/],
      [{ question: "Hi", kind: "trade", anchor: "nope" }, /Trade not found/],
      [{ conversationId: "missing", question: "Hi" }, /Conversation not found/],
      [{ conversationId: "x", question: "Hi", filters: {} }, /Unknown chat request field/],
      [{ question: "Hi", filters: {}, timeZone: "Europe/Madrid" }, /timezone changed/],
    ];
    for (const [body, message] of cases) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
      expect((await response.json()).error).toMatch(message);
    }
    expect(provider.fetcher).not.toHaveBeenCalled();
  });

  it("need a provider key, and save nothing without one", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post({ question: "Hi", filters: {}, timeZone: "UTC" });
    expect((await response.json()).error).toMatch(/AI is not configured/);
    const listed = await (await list(new Request("http://localhost/api/ai/chat"))).json();
    expect(listed.conversations).toEqual([]);
  });

  it("about a trade use its account, and can start from an earlier critique", async () => {
    const key = queryTrades({ accounts: "a" }).trades[0]!.key;
    const provider = script(() => anthropic.text("Because the stop was far."));
    const stream = await events(
      await post({
        question: "Why?",
        kind: "trade",
        anchor: key,
        seed: "Critique: you held too long.",
        timeZone: "UTC",
      }),
    );
    expect(stream.at(-1)).toMatchObject({ type: "done" });
    const request = JSON.stringify(provider.body(0));
    expect(request).toContain("Critique: you held too long.");
    expect(request).toContain(JSON.stringify(key).slice(1, -1).replace(/"/g, '\\"'));
    const conversation = stream[0]!.conversation as {
      kind: string;
      anchor: string;
      filters: object;
    };
    expect(conversation).toMatchObject({ kind: "trade", anchor: key, filters: { accounts: "a" } });
    const listed = await (
      await list(
        new Request(`http://localhost/api/ai/chat?kind=trade&anchor=${encodeURIComponent(key)}`),
      )
    ).json();
    expect(listed.conversations).toHaveLength(1);
  });
});

describe("journal tools", () => {
  const scopeFor = (filters: Record<string, string>) =>
    readAiRequest({ question: "q", filters, timeZone: "UTC" }, "question");
  const run = async (scope: ReturnType<typeof scopeFor>, name: string, input: unknown) =>
    (await tools.journalTools({ scope })[name]!.execute!(
      input as never,
      {
        toolCallId: "t",
        messages: [],
      } as never,
    )) as Record<string, unknown>;

  it("accept numbers for numeric filters and reject unknown or malformed ones", () => {
    expect(tools.readToolFilters({ pnlMin: -5, symbol: "X" })).toEqual({
      pnlMin: "-5",
      symbol: "X",
    });
    expect(tools.readToolFilters(undefined)).toEqual({});
    expect(() => tools.readToolFilters({ nope: "1" })).toThrow(/Unknown journal filter/);
    expect(() => tools.readToolFilters({ from: "2026-02-30" })).toThrow(/Invalid from date/);
  });

  it("answer a bad call with an error the model can correct", async () => {
    const scope = scopeFor({});
    expect(await run(scope, "group_stats", { groupBy: "colour" })).toMatchObject({
      error: expect.stringMatching(/groupBy must be one of/),
    });
    expect(await run(scope, "get_trade", { key: "missing" })).toMatchObject({
      error: expect.stringMatching(/No trade with this key/),
    });
  });

  it("read one trade with its fills, only inside the scope", async () => {
    const b = queryTrades({ accounts: "b" }).trades[0]!.key;
    expect(await run(scopeFor({ accounts: "a" }), "get_trade", { key: b })).toHaveProperty("error");
    const trade = await run(scopeFor({ accounts: "b" }), "get_trade", { key: b });
    expect(trade).toMatchObject({ symbol: "ONLY_B", netPnl: -50, account: "Account B" });
    expect(trade.fills).toHaveLength(2);
  });

  it("show the shared day note only to an unfiltered scope", async () => {
    db.insert(journalDays)
      .values({ date: "2026-09-15", note: "Keep: patience", updatedAt: "x" })
      .run();
    const all = await run(scopeFor({}), "get_day", { date: "2026-09-15", includeCharts: false });
    expect(all.dayNote).toBe("Keep: patience");
    expect(all.trades).toHaveLength(2);
    const one = await run(scopeFor({ accounts: "a" }), "get_day", {
      date: "2026-09-15",
      includeCharts: false,
    });
    expect(one.dayNote).toMatch(/Not available/);
    expect(JSON.stringify(one)).not.toContain("patience");
    expect(one.trades).toHaveLength(1);
  });

  it("report habits from the journal's own numbers, within the scope", async () => {
    const all = await run(scopeFor({}), "behaviour_patterns", {});
    expect(all.closedTrades).toBe(3);
    expect((all.patterns as { habit: string }[]).map((p) => p.habit)).toEqual([
      "Revenge trades",
      "Trading on after losses",
      "Sizing up after a loss",
      "Size creeping up",
      "Results fading later in the day",
    ]);
    const onlyA = await run(scopeFor({ accounts: "a" }), "behaviour_patterns", {});
    expect(onlyA.closedTrades).toBe(2);
  });

  it("sort and page trade lists", async () => {
    const listed = await run(scopeFor({}), "find_trades", {
      sort: "netPnl",
      order: "asc",
      limit: 2,
    });
    expect(listed.total).toBe(3);
    expect((listed.trades as { netPnl: number }[]).map((t) => t.netPnl)).toEqual([-50, -5]);
  });

  it("keep results within the size budget by shortening lists first", () => {
    const big = {
      total: 500,
      trades: Array.from({ length: 500 }, (_, i) => ({ i, pad: "x".repeat(100) })),
    };
    const bounded = tools.boundResult(big) as { trades: unknown[]; note: string };
    expect(JSON.stringify(bounded).length).toBeLessThanOrEqual(tools.MAX_TOOL_RESULT_CHARS);
    expect(bounded.trades.length).toBeGreaterThan(10);
    expect(bounded.note).toMatch(/^Showing \d+ of 500/);
  });

  it("pick a candle size that shows a trade in about 40 candles", () => {
    expect(tools.candleSizeFor(30 * 60_000)).toBe("1m");
    expect(tools.candleSizeFor(6 * 3_600_000)).toBe("15m");
    expect(tools.candleSizeFor(20 * 86_400_000)).toBe("1d");
  });
});

describe("recaps, critiques and weekly reviews", () => {
  const call = (route: (r: Request) => Promise<Response>, body: unknown) =>
    route(
      new Request("http://localhost/api/ai/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("stream as they are written when asked, ending with the usual payload", async () => {
    script(() => anthropic.text("I kept ", "my stops."));
    const recapped = await events(
      await call(recap, {
        date: "2026-09-15",
        filters: { accounts: "a" },
        timeZone: "UTC",
        stream: true,
        includeAnalyses: false,
      }),
    );
    expect(recapped.map((e) => e.type)).toEqual(["text", "text", "done"]);
    expect(recapped.at(-1)).toMatchObject({
      recap: "I kept my stops.",
      scope: { timeZone: "UTC" },
      analyses: [],
    });

    const key = queryTrades({ accounts: "b" }).trades[0]!.key;
    script(() => anthropic.text("Cut the loser sooner."));
    const critiqued = await events(
      await call(critique, { key, stream: true, includeAnalyses: false }),
    );
    expect(critiqued.at(-1)).toMatchObject({ type: "done", critique: "Cut the loser sooner." });

    script(() => anthropic.text("A red week."));
    const reviewed = await events(await call(weekly, { end: "2026-09-16", stream: true }));
    expect(reviewed.at(-1)).toMatchObject({
      type: "done",
      review: "A red week.",
      to: "2026-09-16",
    });
  });

  it("stream a provider failure as a safe message", async () => {
    script(
      () =>
        new Response(
          JSON.stringify({
            type: "error",
            error: { type: "invalid_request_error", message: "Your credit balance is too low" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );
    const failed = await events(
      await call(recap, {
        date: "2026-09-15",
        filters: {},
        timeZone: "UTC",
        stream: true,
        includeAnalyses: false,
      }),
    );
    expect(failed).toEqual([
      { type: "error", message: "AI billing: check your provider account's credits and quota." },
    ]);
  });

  it("reject a stream flag that is not true or false", async () => {
    const response = await call(recap, { date: "2026-09-15", filters: {}, stream: "yes" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/stream must be true or false/);
  });

  it("are read on the page as text so far, then the payload", async () => {
    const lines = [
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "done", recap: "Hello", scope: { label: "All", timeZone: "UTC" } },
    ];
    // Split mid-line, as a network would.
    const raw = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(raw.slice(0, 20)));
              controller.enqueue(encoder.encode(raw.slice(20)));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "application/x-ndjson" } },
        );
      }),
    );
    const seen: string[] = [];
    const result = await postAiStream<{ recap: string }>("/api/ai/recap", {}, (t) => seen.push(t));
    expect(seen).toEqual(["Hel", "Hello"]);
    expect(result).toEqual({ recap: "Hello", scope: { label: "All", timeZone: "UTC" } });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ error: "No closed trades" }), { status: 400 }),
      ),
    );
    await expect(postAiStream("/api/ai/recap", {}, () => {})).rejects.toThrow("No closed trades");

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ type: "error", message: "AI billing: check" }) + "\n", {
            headers: { "Content-Type": "application/x-ndjson" },
          }),
      ),
    );
    await expect(postAiStream("/api/ai/recap", {}, () => {})).rejects.toThrow("AI billing");
  });
});
