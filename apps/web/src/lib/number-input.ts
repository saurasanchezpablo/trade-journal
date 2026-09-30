/**
 * A number typed into a free-text field: null when the field is empty, undefined when the
 * text is not a number. `Number("1,5")` is NaN, and NaN travels in JSON as null, which the
 * API reads as "clear the value": callers keep the saved value instead of sending it.
 */
export function parseDecimalInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** The hint under a field whose text is not a number. */
export const NOT_A_NUMBER = "Enter a number with a dot for decimals, like 101.5.";
