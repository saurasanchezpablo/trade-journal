// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OverlaysPanel } from "../src/components/overlays-panel";
import { DEFAULT_OVERLAYS } from "../src/lib/chart-overlays";
import { TooltipProvider } from "../src/components/ui/tooltip";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = (enabled: boolean, onCalendar: () => Promise<void>) =>
  act(async () =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(OverlaysPanel, {
          options: DEFAULT_OVERLAYS,
          onChange: vi.fn(),
          data: null,
          extraSymbols: "",
          onExtraSymbols: vi.fn(),
          calendar: { enabled, fetchedAt: null, error: null, events: [] },
          onCalendar,
        }),
      ),
    ),
  );
const click = (name: string) =>
  act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((b) => b.textContent === name || b.getAttribute("aria-label") === name)!
      .click(),
  );

describe("the economic calendar on Charts", () => {
  it("says why it could not be enabled", async () => {
    await render(false, () => Promise.reject(new Error("Request failed (500)")));
    await click("Enable economic calendar");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not enable the economic calendar: Request failed (500)",
    );
  });

  it("says why a refresh failed, and clears the message when one works", async () => {
    const onCalendar = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce();
    await render(true, onCalendar);
    await click("Refresh the calendar");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not refresh the economic calendar: Network error",
    );
    await click("Refresh the calendar");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
