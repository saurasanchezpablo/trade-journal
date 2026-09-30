// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PineEditor } from "../src/components/pine-editor";
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
const draft = {
  name: "",
  source: '//@version=6\nindicator("Mine")\nplot(close)',
  scriptId: null,
  chartIndicatorId: null,
};
const press = (key: string) =>
  container
    .querySelector("textarea")!
    .dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));

describe("the Pine Script editor's shortcuts", () => {
  it("pressing Ctrl+S twice while saving saves one script", async () => {
    let finish!: (value: { scriptId: string }) => void;
    const onSave = vi.fn(() => new Promise<{ scriptId: string }>((resolve) => (finish = resolve)));
    const onRun = vi.fn(async () => ({}));
    await act(async () =>
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(PineEditor, { draft, onRun, onSave, onClose: vi.fn() }),
        ),
      ),
    );
    await act(async () => {
      press("s");
      press("s");
      press("Enter");
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onRun).not.toHaveBeenCalled();
    await act(async () => finish({ scriptId: "s1" }));
    expect(container.textContent).toContain("Saved to My indicators.");
    await act(async () => press("Enter"));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("pressing Ctrl+Enter twice while running adds one indicator", async () => {
    const onRun = vi.fn(() => new Promise<{ chartIndicatorId: string }>(() => {}));
    await act(async () =>
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(PineEditor, { draft, onRun, onSave: vi.fn(), onClose: vi.fn() }),
        ),
      ),
    );
    await act(async () => {
      press("Enter");
      press("Enter");
    });
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
