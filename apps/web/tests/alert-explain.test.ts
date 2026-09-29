import { describe, expect, it } from "vitest";
import { explainAlert } from "../src/lib/alert-explain";
import { lineAlert, zoneAlert, alertText } from "../src/lib/alert-messages";
import type { AnalysisPlan } from "../src/lib/analysis-plan";

const plan: AnalysisPlan = {
  bias: "long",
  playbookId: null,
  scenarios: [
    {
      id: "s1",
      name: "Breakout",
      direction: "long",
      trigger: 100,
      target: 110,
      invalidation: 95,
      note: "",
    },
    {
      id: "s2",
      name: "",
      direction: "short",
      trigger: 90,
      target: 80,
      invalidation: 96,
      note: "",
    },
  ],
};
const line = (price: number, direction: "up" | "down") =>
  ({ low: price, high: price, direction, kind: "line" }) as const;

describe("an alert's note", () => {
  it("says a crossing sets off the scenario it triggers, with its target and stop", () => {
    expect(explainAlert(plan, line(100.2, "up"))).toBe(
      'Plan: sets off "Breakout" (long), target 110, wrong below 95.',
    );
  });

  it("says when the trigger is crossed the other way", () => {
    expect(explainAlert(plan, line(100, "down"))).toBe(
      'Plan: the trigger of "Breakout" (long), crossed the other way.',
    );
  });

  it("names a target reached and an invalidation hit", () => {
    expect(explainAlert(plan, line(110, "up"))).toBe('Plan: target of "Breakout" (long) reached.');
    expect(explainAlert(plan, line(95, "down"))).toBe(
      'Plan: "Breakout" (long) is invalidated here.',
    );
    // An unnamed short scenario whose stop is above.
    expect(explainAlert(plan, line(96, "up"))).toBe(
      "Plan: a scenario (short) is invalidated here.",
    );
  });

  it("falls back to the bias when no scenario sits at the level", () => {
    expect(explainAlert(plan, line(120, "down"))).toBe(
      "No scenario at this level. Bias long: this move is against it.",
    );
    expect(explainAlert({ ...plan, bias: null }, line(120, "down"))).toBeNull();
    expect(explainAlert(null, line(120, "down"))).toBeNull();
  });

  it("reads a zone as support or resistance, and matches plan prices inside it", () => {
    const zone = { low: 60, high: 62 };
    expect(explainAlert(null, { ...zone, direction: "down", kind: "enter" })).toBe(
      "Testing it as support.",
    );
    expect(explainAlert(null, { ...zone, direction: "up", kind: "break" })).toBe(
      "Resistance broken; it may hold as support now.",
    );
    expect(explainAlert(plan, { low: 99, high: 101, direction: "up", kind: "enter" })).toBe(
      'Plan: sets off "Breakout" (long), target 110, wrong below 95.',
    );
  });

  it("goes with the alert's text for notifications", () => {
    const message = lineAlert(
      "a1",
      "BTCUSDT",
      { drawingId: "d1", direction: "up", price: 100 },
      "Horizontal line",
      plan,
    );
    expect(alertText(message)).toBe(
      'BTCUSDT crossed above Horizontal line at 100\nPlan: sets off "Breakout" (long), target 110, wrong below 95.',
    );
    const zoned = zoneAlert(
      "a1",
      "BTCUSDT",
      { zoneId: "z", kind: "break", direction: "down" },
      { id: "z", label: "", low: 94, high: 95.5 },
      plan,
    );
    expect(zoned.note).toBe('Plan: "Breakout" (long) is invalidated here.');
  });
});
