// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/use-api", () => ({
  postJson: (...args: unknown[]) => state.post(...args),
  // Every read answers with the saved analyses; the flat test menu never has to open.
  useApi: () => ({
    data: {
      analyses: [
        {
          id: "an1",
          title: "Opening drive",
          symbol: "ES",
          resolution: "5",
          updatedAt: "2026-09-15T10:00:00.000Z",
          dayDate: "2026-09-15",
        },
      ],
    },
    refresh: vi.fn(),
  }),
}));
// The menu renders flat so a test can pick an analysis without Radix pointer events.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  DropdownMenuItem: ({
    children,
    onSelect,
    asChild,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    asChild?: boolean;
  }) =>
    asChild ? children : createElement("button", { type: "button", onClick: onSelect }, children),
}));
const { RichEditor } = await import("../src/components/rich-editor");

let container: HTMLDivElement;
let root: Root;
let setNote: (next: string | ((prev: string) => string)) => void = () => {};
let note = "";
function Host({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  setNote = setValue;
  note = value;
  return createElement(RichEditor, {
    value,
    onChange: setValue,
    defaultMode: "edit",
    analysisDay: "2026-09-15",
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.post.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const pickAnalysis = () =>
  act(async () => {
    const item = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Opening drive"),
    );
    item!.click();
  });

describe("inserting a chart analysis into a day note", () => {
  it("keeps what was added to the note while the day snapshot was being pinned", async () => {
    let finish!: (value: unknown) => void;
    state.post.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await act(async () => root.render(createElement(Host, { initial: "Plan" })));
    await pickAnalysis();
    await act(async () => setNote((prev) => `${prev}\n\nAI recap: held the plan`));
    await act(async () => finish({}));
    expect(note).toContain("AI recap: held the plan");
    expect(note).toContain("/api/analyses/an1/snapshots/2026-09-15/image");
  });

  it("inserts at the chosen spot when nothing changed meanwhile", async () => {
    state.post.mockResolvedValue({});
    await act(async () => root.render(createElement(Host, { initial: "Plan" })));
    container.querySelector("textarea")!.setSelectionRange(4, 4);
    await pickAnalysis();
    expect(note.startsWith("Plan\n\n![Opening drive")).toBe(true);
  });
});
