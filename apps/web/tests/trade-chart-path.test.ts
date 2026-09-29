import { describe, expect, it } from "vitest";
import { pathPoints } from "../src/components/trade-chart";

describe("the fills-only price path", () => {
  const fill = (at: string, price: number) => ({
    side: "buy" as const,
    quantity: 1,
    price,
    executedAt: at,
  });
  it("has a point per fill", () => {
    const points = pathPoints(
      [fill("2026-09-01T10:00:00Z", 100), fill("2026-09-01T10:30:00Z", 105)],
      Date.parse("2026-09-01T10:30:00Z"),
    );
    expect(points.map((p) => p.close)).toEqual([100, 105]);
  });
  it("draws a single fill as a line to the trade's end, so the chart is never empty", () => {
    const end = Date.parse("2026-09-01T12:00:00Z");
    const points = pathPoints([fill("2026-09-01T10:00:00Z", 100)], end);
    expect(points).toHaveLength(2);
    expect(points[1]).toMatchObject({ time: end, close: 100 });
  });
});
