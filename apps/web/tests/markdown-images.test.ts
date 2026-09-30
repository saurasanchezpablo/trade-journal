// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Markdown } from "../src/components/rich-editor";

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
const render = (text: string, externalImages?: "load" | "ask") =>
  act(async () => root.render(createElement(Markdown, { externalImages, children: text })));

describe("images in rendered notes and AI answers", () => {
  const remote = "![pixel](https://x.example/p?d=net-pnl)";

  it("an AI answer never loads an image from another site until asked", async () => {
    await render(remote, "ask");
    expect(container.querySelector("img")).toBeNull();
    const button = container.querySelector("button")!;
    expect(button.textContent).toContain("x.example");
    await act(async () => button.click());
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://x.example/p?d=net-pnl",
    );
  });

  it("the journal's own images still show in an AI answer", async () => {
    await render("![chart](/api/attachments/abc)", "ask");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/attachments/abc");
  });

  it("your own notes show images as before", async () => {
    await render(remote);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
