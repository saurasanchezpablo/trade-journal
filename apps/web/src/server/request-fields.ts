import { requireValue } from "./api";

/** Small hand-written checks for request bodies (the project uses no schema library). */

/** The body must be a JSON object. */
export function requireObject(body: unknown, message: string): Record<string, unknown> {
  requireValue(body && typeof body === "object" && !Array.isArray(body), message);
  return body as Record<string, unknown>;
}

/** An optional string at most `max` characters long (undefined when absent). */
export function optionalString(value: unknown, max: number, message: string): string | undefined {
  if (value === undefined) return undefined;
  requireValue(typeof value === "string" && value.length <= max, message);
  return value;
}

/**
 * An optional list of distinct, trimmed, non-empty strings (undefined when absent). Blank
 * entries are dropped; anything that is not a string is refused.
 */
export function optionalStringList(
  value: unknown,
  limits: { items: number; length: number },
  message: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  requireValue(
    Array.isArray(value) &&
      value.every((item) => typeof item === "string" && item.trim().length <= limits.length),
    message,
  );
  const list = [...new Set((value as string[]).map((item) => item.trim()).filter(Boolean))];
  requireValue(list.length <= limits.items, message);
  return list;
}
