// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PrivacyProvider } from "../src/components/privacy";

const state = vi.hoisted(() => ({ currencies: ["USD"] }));
const side = (trades: number, avgPnl: number) => ({ trades, winRate: 0.4, avgPnl, netPnl: 0 });
vi.mock("@/lib/use-api", () => ({
  useApi: () => ({
    data: {
      trades: 40,
      currencies: state.currencies,
      timeZone: "UTC",
      patterns: [
        {
          kind: "revenge",
          title: "Revenge trades",
          flagged: true,
          flaggedSide: side(8, -42.5),
          baseline: side(32, 18.25),
          cost: 486,
          examples: ["t1"],
        },
      ],
      examples: {
        t1: { symbol: "ES", direction: "long", openedAt: "2026-09-15T13:30:00.000Z", netPnl: -95 },
      },
    },
    error: null,
  }),
}));
const { BehaviourPatterns } = await import("../src/components/behaviour-patterns");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = () =>
  act(async () =>
    root.render(
      createElement(PrivacyProvider, null, createElement(BehaviourPatterns, { query: "" })),
    ),
  );

describe("habits on Reports", () => {
  it("shows what a habit costs in the accounts' currency", async () => {
    state.currencies = ["EUR"];
    await render();
    expect(container.textContent).toMatch(/[-−]€486\.00/);
    expect(container.textContent).toMatch(/[-−]€95\.00/);
  });

  it("hides amounts when the trades mix currencies instead of showing them in one", async () => {
    state.currencies = ["USD", "EUR"];
    await render();
    expect(container.textContent).not.toMatch(/[$€]/);
    expect(container.textContent).toContain("These trades use USD, EUR");
    expect(container.textContent).toContain("COSTING YOU");
  });
});
