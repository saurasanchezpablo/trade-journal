// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parsePeriod, type Measures } from "../src/lib/goals";

const state = vi.hoisted(() => ({ post: vi.fn() }));
const measures = {} as Measures;
vi.mock("@/lib/use-api", () => ({
  postJson: (...args: unknown[]) => state.post(...args),
  useApi: (url: string) => {
    const params = new URL(url, "http://x").searchParams;
    const period = parsePeriod("month", params.get("period")!)!;
    return {
      data: {
        period,
        previous: period,
        measures,
        previousMeasures: measures,
        goals: [
          {
            id: "g1",
            kind: "month",
            period: period.id,
            metric: null,
            comparator: null,
            target: null,
            text: "No trades in the first 15 minutes",
            status: "unknown",
            value: null,
          },
        ],
      },
      error: null,
      loading: false,
      refresh: vi.fn(),
    };
  },
}));
vi.mock("@/components/journal-chat", () => ({ JournalChat: () => null }));
const { PeriodReviews } = await import("../src/components/period-reviews");
const { TooltipProvider } = await import("../src/components/ui/tooltip");

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
  state.post.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(TooltipProvider, null, createElement(PeriodReviews, { timeZone: "UTC" })),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
const click = (text: string) =>
  act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes(text) || b.getAttribute("aria-label") === text)!
      .click(),
  );
const choosePeriod = (id: string) =>
  act(async () => {
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Review period"]',
    )!;
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
const suggestion = {
  metric: null,
  comparator: null,
  target: null,
  text: "Journal every day",
  reason: "",
};

describe("monthly reviews on the Daily journal", () => {
  it("goals suggested for one month are not offered under another", async () => {
    let answer!: (value: unknown) => void;
    state.post.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await click("Suggest goals");
    await choosePeriod("2026-08");
    await act(async () => answer({ goals: [suggestion] }));
    expect(container.querySelector('[aria-label="Suggested goals"]')).toBeNull();
  });

  it("Try again after a failed suggestion asks again", async () => {
    state.post
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({ goals: [suggestion] });
    await click("Suggest goals");
    await click("Try again");
    expect(state.post).toHaveBeenCalledTimes(2);
    expect(state.post.mock.calls[1]![0]).toBe("/api/ai/suggest-goals");
    expect(container.querySelector('[aria-label="Suggested goals"]')?.textContent).toContain(
      "Journal every day",
    );
  });

  it("a goal that could not be removed says so", async () => {
    state.post.mockRejectedValueOnce(new Error("Database is locked"));
    await click("Remove goal");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Database is locked");
  });
});
