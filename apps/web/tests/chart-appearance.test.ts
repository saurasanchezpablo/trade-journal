// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChartAppearance } from "../src/components/chart-appearance";
import {
  DEFAULT_PREFERENCES,
  styleValue,
  type ChartPreferences,
} from "../src/lib/chart-preferences";

let container: HTMLDivElement;
let root: Root;
let prefs: ChartPreferences = DEFAULT_PREFERENCES;
const saved = vi.fn();
function Host() {
  const [value, setValue] = useState(DEFAULT_PREFERENCES);
  prefs = value;
  return createElement(ChartAppearance, {
    open: true,
    onOpenChange: vi.fn(),
    prefs: value,
    onChange: (next: ChartPreferences) => {
      saved(next);
      setValue(next);
    },
    symbolKey: null,
    symbol: null,
    base: { layout: { fontSize: 12 } },
    journalTimeZone: "UTC",
    onOpenVelaSettings: vi.fn(),
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  saved.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const field = (label: string) =>
  document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const type = (input: HTMLInputElement, text: string) =>
  act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

describe("chart appearance fields", () => {
  it("typing 14 into Text size passes through 1 without snapping back", async () => {
    await act(async () => root.render(createElement(Host)));
    const size = field("Text size");
    await type(size, "1");
    expect(size.value).toBe("1");
    await type(size, "14");
    expect(size.value).toBe("14");
    expect(styleValue(prefs.style, "layout.fontSize")).toBe(14);
  });

  it("a number out of range is brought into range when you leave the field", async () => {
    await act(async () => root.render(createElement(Host)));
    const size = field("Text size");
    await type(size, "3");
    await act(async () => size.blur());
    expect(styleValue(prefs.style, "layout.fontSize")).toBe(8);
    expect(size.value).toBe("8");
  });

  it("an emptied number keeps the saved value", async () => {
    await act(async () => root.render(createElement(Host)));
    const size = field("Text size");
    await type(size, "");
    await act(async () => size.blur());
    expect(saved).not.toHaveBeenCalled();
    expect(size.value).toBe("12");
  });

  it("every colour picker has a name", async () => {
    await act(async () => root.render(createElement(Host)));
    const pickers = Array.from(document.body.querySelectorAll('input[type="color"]'));
    expect(pickers.length).toBeGreaterThan(0);
    expect(pickers.filter((p) => !p.getAttribute("aria-label"))).toEqual([]);
    expect(field("Grid colour")).toBeTruthy();
  });
});
