// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({ post: vi.fn(), saved: { tags: [] as string[], mistakes: [] } }));
vi.mock("@/lib/use-api", () => ({
  postJson: (...args: unknown[]) => state.post(...args),
}));
const { BulkLabelSuggestions, rebasePatch } = await import("../src/components/label-suggestions");

let container: HTMLDivElement;
let root: Root;
const suggestion = {
  key: "t1",
  symbol: "ES",
  openedAt: "2026-09-15T14:30:00.000Z",
  tags: ["breakout"],
  mistakes: ["late entry"],
  newLabels: [],
  rating: null,
  currentTags: ["a-plus"],
  currentMistakes: [],
  currentRating: null,
  reason: "",
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.post.mockReset();
  state.post.mockImplementation(async (url: string) =>
    url === "/api/ai/suggest-labels" ? { suggestions: [suggestion] } : { updated: true },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        trade: {
          tagsJson: JSON.stringify(state.saved.tags),
          mistakesJson: JSON.stringify(state.saved.mistakes),
        },
      }),
    })),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const click = (text: string) =>
  act(async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === text,
    );
    expect(button, text).toBeTruthy();
    button!.click();
  });

describe("applying suggested labels", () => {
  it("applying every suggestion keeps tags added to the trade after the AI answered", async () => {
    await act(async () =>
      root.render(
        createElement(BulkLabelSuggestions, { keys: ["t1"], timeZone: "UTC", onChanged: vi.fn() }),
      ),
    );
    await click("Suggest labels");
    // A bulk tag action runs while the suggestions are on screen.
    state.saved = { tags: ["a-plus", "news day"], mistakes: [] };
    await click("Apply all suggestions");
    expect(state.post).toHaveBeenLastCalledWith(
      "/api/trades/t1",
      { tags: ["a-plus", "news day", "breakout"], mistakes: ["late entry"] },
      "PATCH",
    );
  });

  it("a label removed since the suggestion stays removed, and nothing is added twice", () => {
    expect(
      rebasePatch(
        suggestion,
        { tags: ["a-plus", "breakout"] },
        { tags: ["breakout"], mistakes: [] },
      ),
    ).toEqual({ tags: ["breakout"] });
  });

  it("a failed save says so instead of failing silently", async () => {
    await act(async () =>
      root.render(
        createElement(BulkLabelSuggestions, { keys: ["t1"], timeZone: "UTC", onChanged: vi.fn() }),
      ),
    );
    await click("Suggest labels");
    state.post.mockRejectedValueOnce(new Error("Trade not found"));
    await click("Apply");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Trade not found");
  });
});
