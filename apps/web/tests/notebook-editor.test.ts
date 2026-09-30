// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  lists: new Map<string, unknown>(),
  save: vi.fn(),
}));
const note = {
  id: "n1",
  folderId: "my-notes",
  title: "Plan",
  content: "Saved text",
  updatedAt: "2026-09-30T08:00:00.000Z",
};
vi.mock("@/lib/use-api", () => ({
  postJson: vi.fn(),
  useApi: (url: string) => ({ data: state.lists.get(url) ?? null, refresh: vi.fn() }),
}));
vi.mock("@/lib/use-autosave", () => ({
  useAutosave: () => ({ save: state.save, status: "", flush: vi.fn() }),
}));
vi.mock("@/components/filter-bar", () => ({ FilterBar: () => null }));
vi.mock("@/components/voice-note", () => ({ VoiceNote: () => null }));
vi.mock("@/components/attachments", () => ({ Attachments: () => null }));
vi.mock("@/components/review-export", () => ({ ReviewExport: () => null }));
vi.mock("@/components/rich-editor", () => ({
  RichEditor: ({ value, onChange }: { value: string; onChange: (s: string) => void }) =>
    createElement("textarea", {
      "aria-label": "Note body",
      value,
      onChange: () => {},
      onInput: (e: { currentTarget: HTMLTextAreaElement }) => onChange(e.currentTarget.value),
    }),
}));
const { default: NotebookPage } = await import("../src/app/notebook/page");
const { TooltipProvider } = await import("../src/components/ui/tooltip");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.lists = new Map([["/api/notes?folder=all&q=", { notes: [note], folders: [] }]]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("searching while a note is open keeps the editor and what you typed", async () => {
  await act(async () =>
    root.render(createElement(TooltipProvider, null, createElement(NotebookPage))),
  );
  const row = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Plan"),
  )!;
  await act(async () => row.click());
  const body = () => container.querySelector<HTMLTextAreaElement>("[aria-label='Note body']");
  await act(async () => {
    body()!.value = "Saved text and my newest line";
    body()!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // The search's list is still loading (no data for its URL).
  const search = container.querySelector<HTMLInputElement>("[aria-label='Search notes']")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(search, "risk");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(body()?.value).toBe("Saved text and my newest line");
});
