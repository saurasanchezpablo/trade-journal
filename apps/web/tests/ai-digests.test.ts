import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-ai-digests-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, trades, settings, journalDays } = await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { setSetting } = await import("../src/server/settings");
const { dueDigests, readDigestSettings, summaryOf, DEFAULT_DIGESTS } =
  await import("../src/server/ai-digests/schedule");
const { runDigest } = await import("../src/server/ai-digests/run");
const { DigestScheduler } = await import("../src/server/ai-digests/scheduler");
const { listDigests, saveDigestSettings } = await import("../src/server/ai-digests/store");
const { listMessages, listConversations } = await import("../src/server/ai-agent/store");
const digestsRoute = await import("../src/app/api/ai/digests/route");
const { anthropic, script } = await import("./ai-provider-fixtures");

type Notification = { title: string; body: string; tag: string; url: string };
const inbox = () => {
  const sent: Notification[] = [];
  return { sent, deliver: vi.fn(async (n: Notification) => (sent.push(n), 2)) };
};

const fills = (symbol: string, exit: number, date: string) => [
  {
    symbol,
    side: "buy" as const,
    quantity: 1,
    price: 100,
    fee: 0,
    executedAt: `${date}T14:00:00Z`,
  },
  {
    symbol,
    side: "sell" as const,
    quantity: 1,
    price: exit,
    fee: 0,
    executedAt: `${date}T15:00:00Z`,
  },
];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("JOURNAL_PASSWORD", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic-key");
  listConversations();
  listDigests();
  db.$client.exec("DELETE FROM ai_messages; DELETE FROM ai_conversations; DELETE FROM ai_digests;");
  db.delete(trades).run();
  db.delete(executions).run();
  db.delete(accounts).run();
  db.delete(settings).run();
  db.delete(journalDays).run();
  db.insert(accounts)
    .values({ id: "a", name: "Account A", kind: "manual", createdAt: "2026-01-01" })
    .run();
  // Monday 2026-09-28 and Tuesday 2026-09-29 have trades; Wednesday has none.
  insertExecutions("a", fills("AAA", 130, "2026-09-28"), "manual");
  insertExecutions("a", fills("AAA", 90, "2026-09-29"), "manual");
  setSetting("timeZone", "America/New_York");
});

afterAll(() => {
  db.$client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const on = readDigestSettings({
  recap: { enabled: true, time: "17:00", weekdays: [1, 2, 3, 4, 5] },
  weekly: { enabled: true, weekday: 5, time: "18:00" },
});
// 2026-09-29 is a Tuesday; New York is UTC-4 then.
const ny = (day: string, time: string) => Date.parse(`${day}T${time}:00-04:00`);

describe("the digest schedule", () => {
  it("is due once the local slot has passed, on the chosen weekdays", () => {
    expect(dueDigests(on, ny("2026-09-29", "16:59"), "America/New_York")).toEqual([]);
    expect(dueDigests(on, ny("2026-09-29", "17:00"), "America/New_York")).toEqual([
      { kind: "day", period: "2026-09-29" },
    ]);
    // Sunday is not a recap day (and Friday's weekly review is too old by then).
    expect(dueDigests(on, ny("2026-10-04", "17:30"), "America/New_York")).toEqual([]);
  });

  it("still sends a recent missed slot, never a stale one", () => {
    expect(dueDigests(on, ny("2026-09-29", "19:59"), "America/New_York")).toEqual([
      { kind: "day", period: "2026-09-29" },
    ]);
    expect(dueDigests(on, ny("2026-09-29", "20:01"), "America/New_York")).toEqual([]);
    // Just after midnight: yesterday's 17:00 is seven hours old.
    expect(dueDigests(on, ny("2026-09-30", "00:05"), "America/New_York")).toEqual([]);
  });

  it("sends the weekly review on its weekday, or the day after if the server was down", () => {
    expect(dueDigests(on, ny("2026-10-02", "18:05"), "America/New_York")).toEqual([
      { kind: "day", period: "2026-10-02" },
      { kind: "week", period: "2026-10-02" },
    ]);
    expect(dueDigests(on, ny("2026-10-03", "12:00"), "America/New_York")).toEqual([
      { kind: "week", period: "2026-10-02" },
    ]);
  });

  it("uses the journal's timezone for the local day and time", () => {
    // 21:30 UTC on Tuesday is 17:30 in New York but already Wednesday in Tokyo.
    const at = Date.parse("2026-09-29T21:30:00Z");
    expect(dueDigests(on, at, "America/New_York")).toEqual([{ kind: "day", period: "2026-09-29" }]);
    expect(dueDigests(on, at, "Asia/Tokyo")).toEqual([]);
  });

  it("is off by default, and malformed settings fall back field by field", () => {
    expect(readDigestSettings(undefined)).toEqual(DEFAULT_DIGESTS);
    expect(
      readDigestSettings({ recap: { enabled: true, time: "25:00", weekdays: [9, 1, 1] } }).recap,
    ).toEqual({ enabled: true, time: "17:00", weekdays: [1] });
  });

  it("makes a plain-text summary for a notification", () => {
    expect(summaryOf("## Recap\n\n**I kept** my stops.\n\n- Keep: patience")).toBe(
      "Recap I kept my stops. Keep: patience",
    );
    const long = `${"Word ".repeat(30)}end. ${"More ".repeat(40)}`;
    expect(summaryOf(long).length).toBeLessThanOrEqual(221);
  });
});

describe("a scheduled digest", () => {
  it("is written by the AI chat, saved as a chat and sent without amounts by default", async () => {
    const provider = script(
      () => anthropic.tool("toolu_1", "get_day", { date: "2026-09-29" }),
      () => anthropic.text("I lost 10.00 on AAA. **Keep**: stops. **Fix**: patience."),
    );
    const box = inbox();
    const digest = await runDigest("day", "2026-09-29", { deps: { deliver: box.deliver } });
    expect(digest).toMatchObject({ status: "sent", delivered: 2 });
    expect(box.sent).toHaveLength(1);
    const [notification] = box.sent;
    expect(notification!.title).toBe("Session recap · Tue 2026-09-29");
    expect(notification!.body).toBe("1 trade reviewed. Tap to read it and ask follow-ups.");
    expect(notification!.body).not.toContain("10.00");
    expect(notification!.url).toBe(`/journal/2026-09-29?chat=${digest!.conversationId}`);
    // The model was asked for the recap; the chat shows a short question.
    expect(JSON.stringify(provider.body(0))).toContain("Write my session recap for 2026-09-29");
    expect(listMessages(digest!.conversationId!).map((m) => [m.role, m.content])).toEqual([
      ["user", "Session recap for 2026-09-29 (scheduled)"],
      ["assistant", "I lost 10.00 on AAA. **Keep**: stops. **Fix**: patience."],
    ]);
    expect(listConversations({ kind: "day", anchor: "2026-09-29" })).toHaveLength(1);
  });

  it("puts the start of the answer in the notification when asked to", async () => {
    saveDigestSettings({ ...DEFAULT_DIGESTS, summaryInNotification: true });
    script(() => anthropic.text("I lost 10.00 on AAA."));
    const box = inbox();
    await runDigest("day", "2026-09-29", { deps: { deliver: box.deliver } });
    expect(box.sent[0]!.body).toBe("I lost 10.00 on AAA.");
  });

  it("is skipped, without asking the AI, when there is nothing to review", async () => {
    const provider = script();
    const box = inbox();
    const digest = await runDigest("day", "2026-09-30", { deps: { deliver: box.deliver } });
    expect(digest).toMatchObject({ status: "skipped" });
    expect(provider.fetcher).not.toHaveBeenCalled();
    expect(box.sent).toEqual([]);
  });

  it("records a failure instead of sending when no AI key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const box = inbox();
    const digest = await runDigest("day", "2026-09-29", { deps: { deliver: box.deliver } });
    expect(digest).toMatchObject({
      status: "failed",
      detail: expect.stringMatching(/not configured/),
    });
    expect(box.sent).toEqual([]);
  });

  it("covers the week for a weekly review, and opens on Reports", async () => {
    const provider = script(() => anthropic.text("**What worked**: stops."));
    const box = inbox();
    const digest = await runDigest("week", "2026-10-02", { deps: { deliver: box.deliver } });
    expect(digest).toMatchObject({
      status: "sent",
      title: "Weekly review · 2026-09-26 to 2026-10-02",
    });
    expect(box.sent[0]!.url).toBe(`/reports?chat=${digest!.conversationId}`);
    expect(box.sent[0]!.body).toBe("2 trades reviewed. Tap to read it and ask follow-ups.");
    const asked = JSON.stringify(provider.body(0));
    expect(asked).toContain("2026-09-28: 1 trade (AAA)");
    // The chat's scope is the week itself.
    expect(asked).toMatch(/Journal scope: [^"]*From[^"]*2026-09-26[^"]*To[^"]*2026-10-02/);
  });

  it("is sent once per period, however often the scheduler checks", async () => {
    saveDigestSettings(on);
    script(() => anthropic.text("A recap."));
    const box = inbox();
    const scheduler = new DigestScheduler({
      now: () => ny("2026-09-29", "17:10"),
      deps: { deliver: box.deliver },
    });
    await scheduler.tick();
    await scheduler.tick();
    expect(box.sent).toHaveLength(1);
    expect(listDigests()).toMatchObject([{ kind: "day", period: "2026-09-29", status: "sent" }]);
    // Sending it again by hand is allowed.
    script(() => anthropic.text("A second recap."));
    expect(
      await runDigest("day", "2026-09-29", { again: true, deps: { deliver: box.deliver } }),
    ).toMatchObject({
      status: "sent",
    });
    expect(box.sent).toHaveLength(2);
  });
});

describe("digest settings", () => {
  const put = (body: unknown) =>
    digestsRoute.PUT(
      new Request("http://localhost/api/ai/digests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("are saved and read back through the API, and malformed ones are refused", async () => {
    const response = await put(on);
    expect(response.status).toBe(200);
    const state = await (await digestsRoute.GET()).json();
    expect(state.settings).toEqual(on);
    expect(state.delivery).toEqual({ browsers: 0, webhook: false });
    for (const bad of [
      { ...on, recap: { ...on.recap, time: "5pm" } },
      { ...on, weekly: { ...on.weekly, weekday: 7 } },
      { ...on, extra: true },
      { ...on, summaryInNotification: "yes" },
    ]) {
      const refused = await put(bad);
      expect(refused.status, JSON.stringify(bad)).toBe(400);
    }
  });
});
