// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PrivacyProvider } from "../src/components/privacy";

const level = (label: string, status: string) => ({ label, low: 100, high: 100, status });
const priceAction = {
  day: "2026-09-15",
  resolution: "15m",
  partial: false,
  summary: { open: 100, high: 110, low: 95, close: 105, change: 5, changePct: 0.05, range: 15 },
  averageRange: null,
  levels: [level("Weekly high", "held"), level("Monthly low", "untouched")],
  scenarios: {},
  context: { shape: "trend", volatility: null, news: [] },
  text: "",
};
vi.mock("@/lib/use-api", () => ({
  postJson: vi.fn(),
  useApi: (url: string | null) => ({
    data: !url
      ? null
      : url.endsWith("/price-action")
        ? { priceAction, problem: null }
        : url.endsWith("/review")
          ? { plan: { bias: null, playbookId: null, scenarios: [] }, reviews: [], changes: null }
          : {
              timeZone: "America/New_York",
              trades: [
                {
                  key: "t1",
                  symbol: "ES",
                  direction: "long",
                  status: "closed",
                  openedAt: "2026-09-15T13:31:00.000Z",
                  avgEntry: 5321.25,
                  netPnl: 120,
                  link: null,
                  suggestedScenario: null,
                },
              ],
            },
    error: null,
    refresh: vi.fn(),
  }),
}));
const { DayReview } = await import("../src/components/day-review");

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
const toggle = (details: HTMLDetailsElement, open: boolean) =>
  act(async () => {
    details.open = open;
    details.dispatchEvent(new Event("toggle"));
  });
const render = () =>
  act(async () =>
    root.render(
      createElement(
        PrivacyProvider,
        null,
        createElement(DayReview, { analysisId: "an1", date: "2026-09-15" }),
      ),
    ),
  );

describe("an analysis's day review on the journal day", () => {
  it("folding the levels that were not reached keeps the review open", async () => {
    await render();
    await toggle(container.querySelector("details")!, true);
    const inner = container.querySelectorAll("details")[1] as HTMLDetailsElement;
    expect(inner.textContent).toContain("1 level not reached");
    await toggle(inner, true);
    await toggle(inner, false);
    expect(container.textContent).toContain("What price did");
    expect(container.textContent).toContain("Trades opened this day");
  });

  it("hides the trade's entry price in privacy mode, also from its plan link's name", async () => {
    localStorage.setItem("journal-privacy-v1", "true");
    await render();
    await toggle(container.querySelector("details")!, true);
    expect(container.textContent).not.toContain("5,321.25");
    expect(container.textContent).not.toContain("5321.25");
    const select = container.querySelector("select[aria-label^='Plan link']")!;
    expect(select.getAttribute("aria-label")).toBe(
      "Plan link for the long ES trade opened at 09:31",
    );
  });
});
