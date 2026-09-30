// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const RULES: Record<string, string[]> = {
  p1: ["Wait for the retest", "Stop under the swing"],
  p2: ["Only trade the open"],
};
const state = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/use-api", () => ({
  postJson: (...args: unknown[]) => state.post(...args),
  useApi: (url: string) => {
    const playbook = new URL(url, "http://x").searchParams.get("playbook") ?? "";
    return {
      data: {
        name: playbook ? `Playbook ${playbook}` : null,
        rules: (RULES[playbook] ?? []).map((rule) => ({ rule, followed: null })),
      },
      error: null,
      refresh: vi.fn(),
    };
  },
}));
vi.mock("@/lib/trade-snapshot", () => ({ tradeSnapshot: () => null }));
const { RuleChecklist } = await import("../src/components/rule-checklist");

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
const render = (playbookId: string) =>
  act(async () => root.render(createElement(RuleChecklist, { tradeKey: "t1", playbookId })));
const buttons = () => Array.from(container.querySelectorAll("button")).map((b) => b.textContent);
const checkWithAi = () =>
  act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Check with AI"))!
      .click(),
  );
const verdicts = {
  summary: "Mostly on plan",
  checks: [
    { rule: "Wait for the retest", verdict: "followed", reason: "Entered on the retest" },
    { rule: "Stop under the swing", verdict: "broken", reason: "Stop was above" },
    { rule: "A rule since removed", verdict: "broken", reason: "Old rule" },
  ],
};

describe("the AI check on a trade's rule review", () => {
  it("offers only verdicts on the playbook's own rules", async () => {
    state.post.mockResolvedValueOnce(verdicts);
    await render("p1");
    await checkWithAi();
    expect(buttons()).toContain("Apply 2 suggestions");
  });

  it("is dropped when the trade moves to another playbook", async () => {
    state.post.mockResolvedValueOnce(verdicts);
    await render("p1");
    await checkWithAi();
    await render("p2");
    expect(container.textContent).not.toContain("Mostly on plan");
    expect(buttons().some((b) => b?.startsWith("Apply"))).toBe(false);
  });

  it("an answer that arrives after the playbook changed is not shown", async () => {
    let answer!: (value: unknown) => void;
    state.post.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await render("p1");
    await checkWithAi();
    await render("p2");
    await act(async () => answer(verdicts));
    expect(container.textContent).not.toContain("Mostly on plan");
    expect(buttons()).toContain("Check with AI");
  });
});
