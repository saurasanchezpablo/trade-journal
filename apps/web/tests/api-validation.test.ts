import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-api-validation-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db, accounts, executions, journalDays, notes, playbooks, trades } =
  await import("../src/db");
const { insertExecutions } = await import("../src/server/executions");
const { GET: listPlaybooks, POST: createPlaybook } = await import("../src/app/api/playbooks/route");
const { PATCH: updatePlaybook } = await import("../src/app/api/playbooks/[id]/route");
const { POST: createAccount } = await import("../src/app/api/accounts/route");
const { PATCH: updateAccount } = await import("../src/app/api/accounts/[id]/route");
const { POST: bulk } = await import("../src/app/api/trades/bulk/route");
const { PUT: saveDay } = await import("../src/app/api/journal/[date]/route");
const { POST: createNote } = await import("../src/app/api/notes/route");
const { PATCH: updateNote } = await import("../src/app/api/notes/[id]/route");

const request = (body: unknown, method = "POST") =>
  new Request("http://localhost/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const id = (value: string) => ({ params: Promise.resolve({ id: value }) });

beforeEach(() => {
  vi.stubEnv("JOURNAL_PASSWORD", "");
  for (const table of [trades, executions, notes, playbooks, journalDays, accounts])
    db.delete(table).run();
  db.insert(accounts)
    .values({ id: "main", name: "Main", kind: "manual", createdAt: "2026-01-01" })
    .run();
});
afterAll(() => {
  vi.unstubAllEnvs();
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe("playbook rules are always a list of rule lines", () => {
  it("refuses rules that are not a list of strings", async () => {
    for (const rules of ["Wait for the retest", { a: 1 }, 7, [1, 2], ["ok", null]]) {
      const response = await createPlaybook(request({ name: "ORB", rules }));
      expect(response.status).toBe(400);
    }
    expect(db.select().from(playbooks).all()).toHaveLength(0);
  });

  it("drops blank rules, merges repeats and keeps an update's rules a list", async () => {
    const created = await createPlaybook(
      request({ name: "ORB", rules: [" Entry confirmed ", "", "Entry confirmed", "Risk set"] }),
    );
    const { id: bookId } = await created.json();
    expect((await updatePlaybook(request({ rules: "Risk set" }, "PATCH"), id(bookId))).status).toBe(
      400,
    );
    const body = await (await listPlaybooks()).json();
    expect(body.playbooks[0].rules).toEqual(["Entry confirmed", "Risk set"]);
  });
});

describe("account settings are checked before they are saved", () => {
  it("refuses unknown kinds, profit methods, negative balances and odd currencies", async () => {
    for (const body of [
      { name: "A", kind: "paper" },
      { name: "A", kind: "manual", profitCalcMethod: "hifo" },
      { name: "A", kind: "manual", initialBalance: -1 },
      { name: "A", kind: "manual", initialBalance: "1000" },
      { name: "A", kind: "manual", currency: "dollars" },
      { name: " ", kind: "manual" },
      { name: 5, kind: "manual" },
    ])
      expect((await createAccount(request(body))).status).toBe(400);
    expect(db.select().from(accounts).all()).toHaveLength(1);
  });

  it("refuses an unknown profit method on update and leaves the account as it was", async () => {
    const response = await updateAccount(
      request({ profitCalcMethod: "hifo" }, "PATCH"),
      id("main"),
    );
    expect(response.status).toBe(400);
    expect(db.select().from(accounts).get()?.profitCalcMethod).toBe("fifo");
  });

  it("creates a manual account with a trimmed name", async () => {
    const response = await createAccount(
      request({ name: "  Swing  ", kind: "manual", currency: "EUR", initialBalance: 500 }),
    );
    expect(response.status).toBe(200);
    const created = db
      .select()
      .from(accounts)
      .all()
      .find((a) => a.id !== "main");
    expect(created).toMatchObject({ name: "Swing", currency: "EUR", initialBalance: 500 });
  });
});

describe("bulk trade actions check what they are given", () => {
  const trade = () => {
    insertExecutions(
      "main",
      [
        {
          symbol: "ES",
          side: "buy",
          quantity: 1,
          price: 1,
          fee: 0,
          executedAt: "2026-09-01T10:00:00.000Z",
        },
        {
          symbol: "ES",
          side: "sell",
          quantity: 1,
          price: 2,
          fee: 0,
          executedAt: "2026-09-01T11:00:00.000Z",
        },
      ],
      "manual",
    );
    return db.select().from(trades).get()!.key;
  };

  it("refuses a tag that is not text and keys that are not a list of strings", async () => {
    const key = trade();
    expect((await bulk(request({ action: "tag", keys: [key], tag: 5 }))).status).toBe(400);
    expect((await bulk(request({ action: "tag", keys: key, tag: "a" }))).status).toBe(400);
    expect((await bulk(request({ action: "tag", keys: [1], tag: "a" }))).status).toBe(400);
    expect(db.select().from(trades).get()?.tagsJson).toBeNull();
  });

  it("refuses a strategy that does not exist", async () => {
    const key = trade();
    const response = await bulk(request({ action: "playbook", keys: [key], playbookId: "nope" }));
    expect(response.status).toBe(400);
    expect(db.select().from(trades).get()?.playbookId).toBeNull();
  });

  it("tags the selected trades", async () => {
    const key = trade();
    expect((await bulk(request({ action: "tag", keys: [key], tag: " breakout " }))).status).toBe(
      200,
    );
    expect(db.select().from(trades).get()?.tagsJson).toBe('["breakout"]');
  });
});

describe("notes are text", () => {
  const day = { params: Promise.resolve({ date: "2026-09-01" }) };

  it("a day note must be a string", async () => {
    expect((await saveDay(request({ note: { text: "hi" } }, "PUT"), day)).status).toBe(400);
    expect((await saveDay(request({ note: "Calm open" }, "PUT"), day)).status).toBe(200);
    expect(db.select().from(journalDays).get()?.note).toBe("Calm open");
  });

  it("a notebook note's title, content and tags must be text", async () => {
    for (const body of [{ title: 5 }, { content: ["x"] }, { tags: "a,b" }, { folderId: "nope" }])
      expect((await createNote(request(body))).status).toBe(400);
    const created = await createNote(request({ title: "Plan", tags: ["es"] }));
    const { id: noteId } = await created.json();
    expect((await updateNote(request({ content: 42 }, "PATCH"), id(noteId))).status).toBe(400);
    expect(db.select().from(notes).get()).toMatchObject({ title: "Plan", tagsJson: '["es"]' });
  });
});
