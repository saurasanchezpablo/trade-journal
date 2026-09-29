import { describe, expect, it } from "vitest";
import { checkScenarioPrices } from "../src/lib/plan-draft";

describe("a drafted scenario's prices", () => {
  it("are kept when they make sense for the direction", () => {
    expect(
      checkScenarioPrices({ direction: "long", trigger: 100, target: 110, invalidation: 95 }),
    ).toEqual({ trigger: 100, target: 110, invalidation: 95, problems: [] });
    expect(
      checkScenarioPrices({ direction: "short", trigger: 100, target: 90, invalidation: 104 }),
    ).toEqual({ trigger: 100, target: 90, invalidation: 104, problems: [] });
  });

  it("drop a price on the wrong side, saying why", () => {
    expect(
      checkScenarioPrices({ direction: "long", trigger: 100, target: 95, invalidation: 102 }),
    ).toEqual({
      trigger: 100,
      target: null,
      invalidation: null,
      problems: [
        "the target was on the wrong side of the trigger for a long",
        "the invalidation was on the wrong side of the trigger for a long",
      ],
    });
    expect(
      checkScenarioPrices({ direction: "short", trigger: null, target: 110, invalidation: 100 }),
    ).toMatchObject({ target: null, invalidation: null });
    expect(
      checkScenarioPrices({ direction: "long", trigger: -1, target: Number.NaN, invalidation: 0 }),
    ).toEqual({ trigger: null, target: null, invalidation: null, problems: [] });
  });
});
