// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/filter-bar", () => ({
  useFilters: () => ({ timeZone: "America/New_York", values: {}, query: "" }),
}));
vi.mock("@/components/day-review", () => ({ DayReview: () => null }));
vi.mock("@/components/external-summary-view", () => ({
  DirectionChip: () => null,
  ExternalSummaryView: () => null,
}));
// 02:05 UTC on the 15th is 22:05 on the 14th in New York.
const at = "2026-09-15T02:05:00.000Z";
vi.mock("@/lib/use-api", () => ({
  postJson: vi.fn(),
  useApi: (url: string) => ({
    data: url.startsWith("/api/external/day")
      ? {
          videos: [
            {
              videoId: "v1",
              channelTitle: "Market Talk",
              title: "Tuesday outlook",
              url: "https://www.youtube.com/watch?v=v1",
              publishedAt: at,
              status: "summarized",
              summary: { bias: "long", mainScenario: null, secondaryScenario: null },
              day: "2026-09-14",
            },
          ],
        }
      : {
          snapshots: [
            {
              analysisId: "an1",
              day: "2026-09-14",
              title: "Opening drive",
              symbol: "ES",
              provider: "csv",
              resolution: "5",
              drawingCount: 3,
              hasImage: false,
              createdAt: at,
              updatedAt: at,
            },
          ],
        },
    error: null,
    refresh: vi.fn(),
  }),
}));
const { DayAnalyses } = await import("../src/components/day-analyses");
const { ExternalOpinions } = await import("../src/components/external-opinions");

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

describe("times on a journal day", () => {
  it("a day's chart analysis shows when it was saved in the journal's time zone", async () => {
    await act(async () =>
      root.render(
        createElement(DayAnalyses, {
          date: "2026-09-14",
          today: false,
          note: "",
          onInsert: vi.fn(),
        }),
      ),
    );
    expect(container.textContent).toContain("last saved 22:05");
  });

  it("an external opinion shows when it was published in the journal's time zone", async () => {
    await act(async () =>
      root.render(
        createElement(ExternalOpinions, { date: "2026-09-14", note: "", onAdd: vi.fn() }),
      ),
    );
    expect(container.textContent).toContain("this day, 22:05");
  });
});
