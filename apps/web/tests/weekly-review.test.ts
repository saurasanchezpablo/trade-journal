// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("@/lib/ai-stream", () => ({
  postAiStream: (...args: unknown[]) => state.stream(...args),
}));
vi.mock("@/components/rich-editor", () => ({ Markdown: () => null }));
const { WeeklyReview } = await import("../src/components/weekly-review");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
  state.stream.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
const render = (timeZone: string) =>
  act(async () => root.render(createElement(WeeklyReview, { timeZone })));
const weekEnd = () => container.querySelector<HTMLInputElement>('input[type="date"]')!.value;

describe("the weekly review on the Daily journal", () => {
  it("the week ends today in the journal's time zone once it loads", async () => {
    await render("UTC");
    expect(weekEnd()).toBe("2026-09-15");
    // Already the 16th in Kiritimati (UTC+14).
    await render("Pacific/Kiritimati");
    expect(weekEnd()).toBe("2026-09-16");
  });

  it("stops writing the review when you leave the page", async () => {
    state.stream.mockReturnValue(new Promise(() => {}));
    await render("UTC");
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((b) => b.textContent === "Write the review")!
        .click(),
    );
    const signal = state.stream.mock.calls[0]![3] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    root = createRoot(container);
  });
});
