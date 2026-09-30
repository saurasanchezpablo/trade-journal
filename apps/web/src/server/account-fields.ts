import type { accounts } from "@/db";
import { requireValue } from "./api";

/** Checks for the account fields people edit, shared by create and update. */

export const ACCOUNT_KINDS = ["sync", "import", "manual"] as const;
export const PROFIT_METHODS = ["fifo", "lifo", "wavg"] as const;
const MAX_NAME = 200;
const MAX_BROKER = 100;

type AccountFields = Partial<
  Pick<
    typeof accounts.$inferInsert,
    "name" | "broker" | "currency" | "initialBalance" | "profitCalcMethod" | "autoSync"
  >
>;

/** Validate the editable fields present in `body` and return them, trimmed. */
export function readAccountFields(body: Record<string, unknown>): AccountFields {
  const fields: AccountFields = {};
  if (body.name !== undefined) {
    requireValue(
      typeof body.name === "string" && body.name.trim() && body.name.trim().length <= MAX_NAME,
      `Account names must be 1 to ${MAX_NAME} characters.`,
    );
    fields.name = body.name.trim();
  }
  if (body.broker !== undefined) {
    requireValue(
      typeof body.broker === "string" && body.broker.trim().length <= MAX_BROKER,
      `Broker names must be at most ${MAX_BROKER} characters.`,
    );
    fields.broker = body.broker.trim();
  }
  if (body.currency !== undefined) {
    requireValue(
      typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency),
      "Currency must be a three-letter code such as USD.",
    );
    fields.currency = body.currency;
  }
  if (body.initialBalance !== undefined) {
    requireValue(
      typeof body.initialBalance === "number" &&
        Number.isFinite(body.initialBalance) &&
        body.initialBalance >= 0,
      "Initial balance must be a number of zero or more.",
    );
    fields.initialBalance = body.initialBalance;
  }
  if (body.profitCalcMethod !== undefined) {
    requireValue(
      PROFIT_METHODS.includes(body.profitCalcMethod as (typeof PROFIT_METHODS)[number]),
      "Profit calculation must be FIFO, LIFO or weighted average.",
    );
    fields.profitCalcMethod = body.profitCalcMethod as (typeof PROFIT_METHODS)[number];
  }
  if (body.autoSync !== undefined) {
    requireValue(typeof body.autoSync === "boolean", "autoSync must be true or false.");
    fields.autoSync = body.autoSync;
  }
  return fields;
}
