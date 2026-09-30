// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EMPTY_PLAN } from "../src/lib/analysis-plan";

const state = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/use-api", () => ({
  postJson: (...args: unknown[]) => state.post(...args),
}));
const { PlanDraft } = await import("../src/components/plan-draft");

let container: HTMLDivElement;
let root: Root;
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
const draft = (day: string) => ({ day, bias: null, biasReason: "", scenarios: [] });
const render = (analysisId: string) =>
  act(async () =>
    root.render(createElement(PlanDraft, { analysisId, plan: EMPTY_PLAN, onAccept: vi.fn() })),
  );
const ask = () => act(async () => container.querySelector("button")!.click());

describe("a drafted plan on Charts", () => {
  it("an answer for one analysis is not offered after switching to another", async () => {
    let answer!: (value: unknown) => void;
    state.post.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await render("A");
    await ask();
    await render("B");
    await act(async () => answer(draft("2026-09-14")));
    expect(container.textContent).not.toContain("Draft for 2026-09-14");
    expect(container.textContent).toContain("Draft the day's plan");
  });

  it("a draft shown for one analysis goes away when another opens", async () => {
    state.post.mockResolvedValueOnce(draft("2026-09-14"));
    await render("A");
    await ask();
    expect(container.textContent).toContain("Draft for 2026-09-14");
    await render("B");
    expect(container.textContent).not.toContain("Draft for 2026-09-14");
  });
});
