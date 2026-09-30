// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const state = vi.hoisted(() => ({
  post: vi.fn(),
  timeZone: null as string | null,
  settings: {
    checkTime: "08:00",
    maxAgeDays: 3,
    minMinutes: 3,
    language: "English",
    notify: false,
  },
}));
const video = {
  videoId: "v1",
  channelId: "c1",
  channelTitle: "Market Talk",
  title: "Tuesday outlook",
  url: "https://www.youtube.com/watch?v=v1",
  // 02:00 UTC is still the evening before in New York.
  publishedAt: "2026-09-15T02:00:00.000Z",
  status: "summarized",
  detail: "",
  source: "captions",
  lengthSeconds: 900,
  summary: { main: null },
  nextAttemptAt: null,
};
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/filter-bar", () => ({ FilterBar: () => null }));
vi.mock("@/components/external-summary-view", () => ({ ExternalSummaryView: () => null }));
vi.mock("@/lib/use-api", () => ({
  postJson: (...args: unknown[]) => state.post(...args),
  useApi: (url: string) => ({
    data:
      url === "/api/settings"
        ? state.timeZone && { timeZone: state.timeZone }
        : {
            settings: state.settings,
            languages: ["English"],
            channels: [],
            videos: [video],
            checking: false,
            ai: { configured: true, provider: "anthropic" },
          },
    error: null,
    refresh: vi.fn(),
  }),
}));
const { default: ExternalPage } = await import("../src/app/external/page");

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.post.mockReset();
  state.post.mockResolvedValue({});
  state.timeZone = "UTC";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = () => act(async () => root.render(createElement(ExternalPage)));
const field = (label: string) =>
  container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const type = (input: HTMLInputElement, text: string) =>
  act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const leave = (input: HTMLInputElement) => act(async () => input.blur());

describe("the daily check settings on External analysis", () => {
  it("a number is saved once, when you leave the field, not at every keystroke", async () => {
    await render();
    const days = field("Maximum age in days");
    await type(days, "1");
    await type(days, "14");
    expect(state.post).not.toHaveBeenCalled();
    expect(days.value).toBe("14");
    await leave(days);
    expect(state.post).toHaveBeenCalledTimes(1);
    expect(state.post).toHaveBeenCalledWith("/api/external", { maxAgeDays: 14 }, "PUT");
  });

  it("an empty or out-of-range value is not saved and says what to type", async () => {
    await render();
    const minutes = field("Minimum length in minutes");
    await type(minutes, "");
    await leave(minutes);
    await type(field("Maximum age in days"), "45");
    await leave(field("Maximum age in days"));
    expect(state.post).not.toHaveBeenCalled();
    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map(
      (a) => a.textContent,
    );
    expect(alerts).toContain("Minimum length in minutes: Enter a whole number from 0 to 60.");
    expect(alerts).toContain("Maximum age in days: Enter a whole number from 1 to 30.");
    expect(minutes.getAttribute("aria-invalid")).toBe("true");
  });

  it("the check time is saved on Enter", async () => {
    await render();
    const time = field("Daily check time");
    await type(time, "07:30");
    expect(state.post).not.toHaveBeenCalled();
    await act(async () =>
      time.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(state.post).toHaveBeenCalledWith("/api/external", { checkTime: "07:30" }, "PUT");
  });
});

describe("adding a video's summary to a journal day", () => {
  it("offers the publishing day in the journal's time zone once settings load", async () => {
    state.timeZone = null;
    await render();
    expect(field("Journal day").value).toBe("2026-09-15");
    state.timeZone = "America/New_York";
    await render();
    expect(field("Journal day").value).toBe("2026-09-14");
  });
});
