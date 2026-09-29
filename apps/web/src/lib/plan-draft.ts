import type { Direction, PlanScenario } from "./analysis-plan";

/**
 * A drafted scenario's prices, checked before it is offered: prices are positive numbers,
 * and a long's invalidation sits below its trigger and its target above (a short's the other
 * way). A price that breaks this is dropped, with a note, rather than offered as it is.
 */
export function checkScenarioPrices(s: {
  direction: Direction;
  trigger: number | null;
  target: number | null;
  invalidation: number | null;
}): {
  trigger: number | null;
  target: number | null;
  invalidation: number | null;
  problems: string[];
} {
  const ok = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
  let trigger = ok(s.trigger);
  let target = ok(s.target);
  let invalidation = ok(s.invalidation);
  const problems: string[] = [];
  const up = s.direction === "long" ? 1 : -1;
  if (trigger !== null && target !== null && (target - trigger) * up <= 0) {
    problems.push(`the target was on the wrong side of the trigger for a ${s.direction}`);
    target = null;
  }
  if (trigger !== null && invalidation !== null && (trigger - invalidation) * up <= 0) {
    problems.push(`the invalidation was on the wrong side of the trigger for a ${s.direction}`);
    invalidation = null;
  }
  if (
    trigger === null &&
    target !== null &&
    invalidation !== null &&
    (target - invalidation) * up <= 0
  ) {
    problems.push("the target and invalidation were the wrong way round");
    target = null;
    invalidation = null;
  }
  return { trigger, target, invalidation, problems };
}

export type DraftScenario = Omit<PlanScenario, "id"> & { levelNote: string; problems: string[] };
