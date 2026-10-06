import { LINK_TOLERANCE, type AnalysisPlan, type PlanScenario } from "./analysis-plan";
import { fmtNumber } from "./utils";
import { tr, trx } from "./i18n";

/**
 * The short note under an alert: what the level is to your plan and what the plan said to
 * do there. It comes from the analysis's own plan (scenario triggers, targets and
 * invalidations, and the bias), not from an AI call, so it is instant, private and exact.
 */

export interface AlertLevel {
  /** A line's price at the crossing, or a zone's range. */
  low: number;
  high: number;
  direction: "up" | "down";
  /** `line`: a line was crossed. `enter` / `break`: a zone was entered or broken. */
  kind: "line" | "enter" | "break";
}

type Role = "trigger" | "target" | "invalidation";

const near = (price: number, level: AlertLevel) => {
  const tolerance = Math.abs(price) * LINK_TOLERANCE;
  return price >= level.low - tolerance && price <= level.high + tolerance;
};

const nameOf = (s: PlanScenario) => (s.name.trim() ? `"${s.name.trim()}"` : tr("a scenario"));

/** The notes are in the journal's language (`tr`); scenario names stay as you wrote them. */
function scenarioNote(s: PlanScenario, role: Role, level: AlertLevel): string {
  const long = s.direction === "long";
  const withIt = (level.direction === "up") === long;
  const name = `${nameOf(s)} (${trx("direction", s.direction)})`;
  if (role === "trigger") {
    if (!withIt) return tr("Plan: the trigger of {name}, crossed the other way.", { name });
    const then = [
      s.target === null ? "" : tr("target {price}", { price: fmtNumber(s.target) }),
      s.invalidation === null
        ? ""
        : tr(long ? "wrong below {price}" : "wrong above {price}", {
            price: fmtNumber(s.invalidation),
          }),
    ].filter(Boolean);
    return then.length
      ? tr("Plan: sets off {name}, {details}.", { name, details: then.join(", ") })
      : tr("Plan: sets off {name}.", { name });
  }
  if (role === "target")
    return withIt
      ? tr("Plan: target of {name} reached.", { name })
      : tr("Plan: back through the target of {name}.", { name });
  return withIt
    ? tr("Plan: back past the invalidation of {name}.", { name })
    : tr("Plan: {name} is invalidated here.", { name });
}

/** What the plan says about this level, or null when there is nothing to say. */
export function explainAlert(
  plan: AnalysisPlan | null | undefined,
  level: AlertLevel,
): string | null {
  const notes: string[] = [];
  for (const s of plan?.scenarios ?? []) {
    for (const role of ["trigger", "target", "invalidation"] as const) {
      const price = s[role];
      if (price !== null && Number.isFinite(price) && near(price, level)) {
        notes.push(scenarioNote(s, role, level));
        break;
      }
    }
    if (notes.length >= 2) break;
  }
  if (!notes.length) {
    if (level.kind === "enter")
      notes.push(
        tr(level.direction === "down" ? "Testing it as support." : "Testing it as resistance."),
      );
    else if (level.kind === "break")
      notes.push(
        tr(
          level.direction === "up"
            ? "Resistance broken; it may hold as support now."
            : "Support broken; it may act as resistance now.",
        ),
      );
    const bias = plan?.bias;
    if (bias === "long" || bias === "short") {
      const withBias = (level.direction === "up") === (bias === "long");
      if (level.kind === "line") notes.push(tr("No scenario at this level."));
      notes.push(
        tr(
          withBias ? "Bias {bias}: this move is with it." : "Bias {bias}: this move is against it.",
          {
            bias: trx("direction", bias),
          },
        ),
      );
    }
  }
  return notes.length ? notes.join(" ") : null;
}
