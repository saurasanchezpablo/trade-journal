import { requireValue } from "./api";
import { optionalString, optionalStringList, requireObject } from "./request-fields";

export const MAX_RULES = 50;
export const MAX_RULE_LENGTH = 500;

/**
 * A playbook's editable fields. Rules must be a list of strings (blank ones are dropped and
 * repeats merged), because adherence and rule checks read them back as a list.
 */
export function readPlaybook(raw: unknown): {
  name?: string;
  description?: string;
  rules?: string[];
} {
  const body = requireObject(raw, "Enter valid playbook details.");
  const name = optionalString(body.name, 200, "Playbook names must be at most 200 characters.");
  if (name !== undefined) requireValue(name.trim(), "name is required");
  return {
    name: name?.trim(),
    description: optionalString(
      body.description,
      10_000,
      "Descriptions must be at most 10,000 characters.",
    ),
    rules: optionalStringList(
      body.rules,
      { items: MAX_RULES, length: MAX_RULE_LENGTH },
      `Rules must be a list of up to ${MAX_RULES} lines of at most ${MAX_RULE_LENGTH} characters.`,
    ),
  };
}
