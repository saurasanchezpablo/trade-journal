// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PrivacyProvider } from "../src/components/privacy";
import { TooltipProvider } from "../src/components/ui/tooltip";

const conversation = (id: string, title: string) => ({
  id,
  title,
  kind: "journal",
  anchor: null,
  filters: {},
  scopeLabel: "All accounts",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
  messages: 2,
});
vi.mock("@/lib/use-api", () => ({
  useApi: () => ({
    data: {
      conversations: [conversation("c1", "Losing Mondays"), conversation("c2", "Best setups")],
    },
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/rich-editor", () => ({
  Markdown: ({ children }: { children: string }) => children,
}));
const { JournalChat } = await import("../src/components/journal-chat");

const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  headers: { get: () => "application/json" },
  json: async () => body,
});
const opened = (id: string, answer: string) =>
  json(200, {
    conversation: conversation(id, id),
    messages: [
      {
        id: `${id}-m`,
        role: "assistant",
        content: answer,
        tools: [],
        status: "done",
        createdAt: "2026-09-15T10:00:00.000Z",
      },
    ],
  });

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const target = { kind: "journal" as const, filters: {}, timeZone: "UTC" };
const render = (props: Record<string, unknown> = {}) =>
  act(async () =>
    root.render(
      createElement(
        PrivacyProvider,
        null,
        createElement(TooltipProvider, null, createElement(JournalChat, { target, ...props })),
      ),
    ),
  );
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.includes(text) || b.getAttribute("aria-label") === text,
  )!;
const click = (text: string) => act(async () => button(text).click());

describe("the journal chat", () => {
  it("Try again after a failed period review runs the review again", async () => {
    fetchMock.mockResolvedValue(json(503, { error: "Temporary failure" }));
    const starter = {
      label: "Review September",
      display: "Review September",
      url: "/api/ai/period-review",
      body: { period: "2026-09" },
    };
    await render({ starter });
    await click("Review September");
    await click("Try again");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/ai/period-review");
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ period: "2026-09" });
    // The starter's label is not left in the question box.
    expect(container.querySelector("textarea")!.value).toBe("");
  });

  it("clicking two saved chats quickly shows the one clicked last", async () => {
    let first!: (value: unknown) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (first = resolve)))
      .mockResolvedValueOnce(opened("c2", "Answer from the second chat"));
    await render();
    await click("Saved chats");
    await click("Losing Mondays");
    await click("Best setups");
    expect(container.textContent).toContain("Answer from the second chat");
    await act(async () => first(opened("c1", "Answer from the first chat")));
    expect(container.textContent).toContain("Answer from the second chat");
    expect(container.textContent).not.toContain("Answer from the first chat");
  });

  it("a chat that could not be deleted says so", async () => {
    fetchMock.mockResolvedValue(json(500, { error: "Database is locked" }));
    await render();
    await click("Saved chats");
    await click("Delete chat Losing Mondays");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not delete the chat: Database is locked",
    );
  });

  it("privacy mode keeps chat titles out of the delete buttons' names", async () => {
    localStorage.setItem("journal-privacy-v1", "true");
    await render();
    await click("Saved chats");
    const labels = Array.from(container.querySelectorAll("button[aria-label^='Delete chat']")).map(
      (b) => b.getAttribute("aria-label"),
    );
    expect(labels).toHaveLength(2);
    expect(labels.join(" ")).not.toMatch(/Losing Mondays|Best setups/);
  });
});
