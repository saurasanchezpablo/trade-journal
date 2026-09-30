// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ZonesPanel } from "../src/components/zones-panel";
import { TooltipProvider } from "../src/components/ui/tooltip";

let container: HTMLDivElement;
let root: Root;
const onChange = vi.fn();
const zone = {
  id: "z1",
  low: 100,
  high: 110,
  kind: "auto" as const,
  label: "Demand",
  start: 0,
  visible: true,
};
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  onChange.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(ZonesPanel, {
          zones: [zone],
          stats: {},
          capturing: false,
          pending: false,
          disabled: false,
          onAdd: vi.fn(),
          onCancel: vi.fn(),
          onChange,
          onReveal: vi.fn(),
        }),
      ),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const edit = (label: string, text: string) =>
  act(async () => {
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    input.focus();
    input.value = text;
    input.blur();
  });
const field = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!.value;

describe("editing a zone's prices", () => {
  it("a low above the high is not saved, says why and shows the saved low again", async () => {
    await edit("Zone low", "120");
    expect(onChange).not.toHaveBeenCalled();
    expect(field("Zone low")).toBe("100");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "The low must be under the high (110).",
    );
  });

  it("an emptied price is not saved as 0", async () => {
    await edit("Zone high", "");
    expect(onChange).not.toHaveBeenCalled();
    expect(field("Zone high")).toBe("110");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Enter a price, like 101.5.",
    );
  });

  it("a valid price is saved and clears the message", async () => {
    await edit("Zone low", "120");
    await edit("Zone low", "104.5");
    expect(onChange).toHaveBeenCalledWith([{ ...zone, low: 104.5 }]);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
