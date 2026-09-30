// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PrivacyProvider } from "../src/components/privacy";

const state = vi.hoisted(() => ({ refresh: vi.fn(), currencies: ["EUR"] }));
vi.mock("@/lib/use-api", () => ({
  useApi: (url: string | null) => ({
    data: !url
      ? null
      : url === "/api/accounts"
        ? { accounts: state.currencies.map((currency) => ({ currency })) }
        : {
            from: 0,
            to: 0,
            rows: [{ tag: "Trend day", trades: 4, wins: 3, netPnl: 250 }],
            symbols: [],
          },
    error: null,
    loading: false,
    refresh: state.refresh,
  }),
}));
const { DayTypeStats } = await import("../src/components/day-type-stats");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  state.refresh.mockReset();
  state.currencies = ["EUR"];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = () =>
  act(async () => root.render(createElement(PrivacyProvider, null, createElement(DayTypeStats))));
const click = (text: string) =>
  act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent === text)!
      .click(),
  );

describe("results by day type on the Daily journal", () => {
  it("Refresh reads the breakdown again", async () => {
    await render();
    await click("Show");
    expect(state.refresh).not.toHaveBeenCalled();
    await click("Refresh");
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows net P&L in the accounts' currency", async () => {
    await render();
    await click("Show");
    expect(container.textContent).toContain("+€250.00");
  });

  it("does not add amounts across currencies", async () => {
    state.currencies = ["USD", "EUR"];
    await render();
    await click("Show");
    expect(container.textContent).not.toContain("250");
    expect(container.textContent).toContain("Your accounts use USD, EUR");
  });
});
