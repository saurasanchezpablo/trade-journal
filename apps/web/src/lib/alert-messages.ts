import { fmtNumber } from "./utils";
import type { LineCrossing } from "./price-alerts";
import type { SrZone, ZoneEvent } from "./sr-zones";
import type { AnalysisPlan } from "./analysis-plan";
import { explainAlert } from "./alert-explain";

/**
 * Alert wording shared by the open chart and the server's background watcher, so a push
 * notification reads the same as the in-page alert. The tag lets a device replace one
 * notification with the next for the same line instead of stacking duplicates. `note` says
 * what the level is to the analysis's plan (see `alert-explain.ts`).
 */
export interface AlertMessage {
  title: string;
  body: string;
  tag: string;
  note: string | null;
}

/** The body and its note as one text, for a notification or the alert log. */
export const alertText = (message: Pick<AlertMessage, "body" | "note">) =>
  message.note ? `${message.body}\n${message.note}` : message.body;

export function lineAlert(
  analysisId: string | null,
  symbol: string,
  hit: Pick<LineCrossing, "drawingId" | "direction" | "price">,
  label: string,
  plan?: AnalysisPlan | null,
): AlertMessage {
  return {
    title: "Chart alert",
    body: `${symbol} crossed ${hit.direction === "up" ? "above" : "below"} ${label} at ${fmtNumber(hit.price)}`,
    tag: `alert-${analysisId ?? symbol}-${hit.drawingId}`,
    note: explainAlert(plan, {
      low: hit.price,
      high: hit.price,
      direction: hit.direction,
      kind: "line",
    }),
  };
}

export function zoneAlert(
  analysisId: string | null,
  symbol: string,
  event: ZoneEvent,
  zone: Pick<SrZone, "id" | "label" | "low" | "high">,
  plan?: AnalysisPlan | null,
): AlertMessage {
  const range = `${zone.label ? `${zone.label} ` : ""}${fmtNumber(zone.low)} to ${fmtNumber(zone.high)}`;
  return {
    title: "Zone alert",
    body:
      event.kind === "enter"
        ? `${symbol} entered the zone ${range}`
        : `${symbol} broke ${event.direction === "up" ? "above" : "below"} the zone ${range}`,
    tag: `alert-${analysisId ?? symbol}-zone-${zone.id}-${event.kind}`,
    note: explainAlert(plan, {
      low: Math.min(zone.low, zone.high),
      high: Math.max(zone.low, zone.high),
      direction: event.direction,
      kind: event.kind,
    }),
  };
}
