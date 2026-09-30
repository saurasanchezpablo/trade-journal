// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LayersPanel } from "../src/components/layers-panel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { defaultLayers } from "../src/lib/chart-layers";

let container: HTMLDivElement;
let root: Root;
const calls = new Map<string, ReturnType<typeof vi.fn>>();
// Every panel action is a recorded no-op.
const actions = new Proxy(
  {},
  {
    get: (_, key: string) => {
      if (!calls.has(key)) calls.set(key, vi.fn());
      return calls.get(key);
    },
  },
);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  calls.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("a layer's options menu", () => {
  it("reaches the layer colour swatches from the keyboard", async () => {
    const layers = defaultLayers();
    await act(async () =>
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(LayersPanel, {
            layers,
            drawings: [],
            selectedIds: [],
            actions: actions as never,
          }),
        ),
      ),
    );
    const name = layers.layers[0]!.name;
    const trigger = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${name} options"]`,
    )!;
    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    const swatch = items.find((i) => i.getAttribute("aria-label") === "Colour #2962ff");
    expect(swatch).toBeTruthy();
    expect(items.some((i) => i.getAttribute("aria-label") === "Pick any colour")).toBe(true);
    await act(async () => (swatch as HTMLElement).click());
    const onChange = calls.get("onChange")!;
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].layers[0].color).toBe("#2962ff");
  });
});
