import { readIndicatorRule } from "@/lib/indicator-alerts";
import { bad, handler, ok, requireValue } from "@/server/api";
import {
  createIndicatorRule,
  deleteIndicatorRule,
  listIndicatorRules,
  updateIndicatorRule,
} from "@/server/background-alerts/indicator-alerts";

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Indicator alerts (RSI) watched in the background, with what each last read. */
export const GET = handler(() => ok({ rules: listIndicatorRules() }));

/** Create a rule: the fields of `IndicatorAlertRule`, checked by hand. */
export const POST = handler(async (request: Request) => {
  const read = readIndicatorRule(await request.json());
  if ("problem" in read) return bad(read.problem);
  return ok({ id: createIndicatorRule(read.rule), rules: listIndicatorRules() });
});

/** `{ id, enabled?, rule? }`: switch a rule on or off, or replace it. */
export const PATCH = handler(async (request: Request) => {
  const body = (await request.json()) as { id?: unknown; enabled?: unknown; rule?: unknown } | null;
  requireValue(body && typeof body.id === "string" && ID.test(body.id), "Invalid alert.");
  requireValue(
    body.enabled === undefined || typeof body.enabled === "boolean",
    "Enabled must be true or false.",
  );
  let rule;
  if (body.rule !== undefined) {
    const read = readIndicatorRule(body.rule);
    if ("problem" in read) return bad(read.problem);
    rule = read.rule;
  }
  const changed = updateIndicatorRule(body.id, {
    enabled: body.enabled as boolean | undefined,
    rule,
  });
  return changed ? ok({ rules: listIndicatorRules() }) : bad("Alert not found", 404);
});

export const DELETE = handler((request: Request) => {
  const id = new URL(request.url).searchParams.get("id");
  requireValue(id && ID.test(id), "Invalid alert.");
  return deleteIndicatorRule(id)
    ? ok({ rules: listIndicatorRules() })
    : bad("Alert not found", 404);
});
