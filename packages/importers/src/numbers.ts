/** The decimal separator a file uses, when its values prove it. */
export type DecimalSeparator = "." | ",";

/** One separator followed by exactly three digits: "12,345" / "1.234" read either way. */
const AMBIGUOUS_COMMA = /^[1-9]\d{0,2},\d{3}$/;
const AMBIGUOUS_DOT = /^[1-9]\d{0,2}\.\d{3}$/;

/** Currency, parentheses and sign stripped: the digits and separators left, and the sign. */
const unsigned = (value: string): { text: string; negative: boolean } => {
  let text = value.trim();
  let negative = false;
  const paren = text.match(/^\((.*)\)$/);
  if (paren) {
    negative = true;
    text = paren[1]!;
  }
  // The sign may sit before or after the currency symbol: "-$12.50", "$-12.50".
  text = text.replace(/[$€£\s]/g, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) text = text.slice(1);
  return { text, negative };
};

/** Combined value columns (Webull's "Price/Avg Price" → "185.50/186.00"). */
const COMBINED = /^(-?[\d.,]+)\/(-?[\d.,]+)$/;

/**
 * "$1,234.56", "(45.20)", "1 234,56", "-12.5" → number. NaN when unparseable.
 * With both separators the last one is the decimal separator. A lone comma is
 * a decimal comma unless it is followed by exactly three digits after a
 * one-to-three digit integer part ("0,005" and "42000,50" are decimals); that
 * ambiguous "12,345" is thousands unless `decimal` says the file uses decimal
 * commas (see `decimalSeparatorOf`). A lone dot is a decimal point, and an
 * ambiguous "1.234" is thousands only in a decimal-comma file.
 */
export const parseMoney = (value: string | undefined, decimal?: DecimalSeparator): number => {
  if (value === undefined) return NaN;
  let raw = value.trim();
  if (raw === "") return NaN;
  // The average fill price is the second segment of a combined column.
  const combined = raw.match(COMBINED);
  if (combined) raw = combined[2]!;
  let { text, negative } = unsigned(raw);
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    if (text.indexOf(",") !== lastComma) {
      if (!/^\d{1,3}(,\d{3})+$/.test(text)) return NaN;
      text = text.replace(/,/g, "");
    } else if (AMBIGUOUS_COMMA.test(text) && decimal !== ",") text = text.replace(",", "");
    else text = text.replace(",", ".");
  } else if (lastDot !== -1 && decimal === ",") {
    if (text.indexOf(".") !== lastDot) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(text)) return NaN;
      text = text.replace(/\./g, "");
    } else if (AMBIGUOUS_DOT.test(text)) text = text.replace(".", "");
  }
  if (!/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return NaN;
  const parsed = Number(text);
  if (Number.isNaN(parsed)) return NaN;
  return negative ? -parsed : parsed;
};

export const parseQuantity = (value: string | undefined, decimal?: DecimalSeparator): number => {
  if (value === undefined) return NaN;
  let text = value.trim();
  // Combined quantity columns (Webull's "Filled/Total Qty" → "5/10"):
  // the FILLED amount is the first segment.
  const combined = text.match(COMBINED);
  if (combined) text = combined[1]!;
  const parsed = parseMoney(text, decimal);
  return Number.isNaN(parsed) ? NaN : Math.abs(parsed);
};

/**
 * The decimal separator a file's numeric values prove, or undefined when they
 * prove none (or contradict each other). "185.50" and "1,234.56" prove a
 * decimal point; "185,50", "0,005" and "1.234,56" prove a decimal comma.
 */
export const decimalSeparatorOf = (
  values: readonly (string | undefined)[],
): DecimalSeparator | undefined => {
  let dot = false;
  let comma = false;
  for (const value of values) {
    if (!value) continue;
    const combined = value.trim().match(COMBINED);
    for (const part of combined ? [combined[1]!, combined[2]!] : [value]) {
      const { text } = unsigned(part);
      const lastDot = text.lastIndexOf(".");
      const lastComma = text.lastIndexOf(",");
      if (lastDot !== -1 && lastComma !== -1) {
        if (lastComma > lastDot) comma = true;
        else dot = true;
      } else if (lastComma !== -1) {
        if (text.indexOf(",") === lastComma && !AMBIGUOUS_COMMA.test(text)) comma = true;
      } else if (lastDot !== -1) {
        if (text.indexOf(".") === lastDot && !AMBIGUOUS_DOT.test(text)) dot = true;
      }
    }
  }
  return dot === comma ? undefined : dot ? "." : ",";
};

/** True for a value whose reading depends on the file's decimal separator ("12,345"). */
export const isAmbiguousNumber = (value: string | undefined): boolean => {
  if (!value) return false;
  const combined = value.trim().match(COMBINED);
  return (combined ? [combined[1]!, combined[2]!] : [value]).some((part) => {
    const { text } = unsigned(part);
    return AMBIGUOUS_COMMA.test(text);
  });
};

/**
 * The reading of the importer before decimal commas were detected, kept only
 * to recognize fills an earlier import saved with it.
 */
export const legacyParseMoney = (value: string | undefined): number => {
  if (value === undefined) return NaN;
  let text = value.trim();
  if (text === "") return NaN;
  const combined = text.match(COMBINED);
  if (combined) text = combined[2]!;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()$€£\s]/g, "").replace(/^-/, "");
  if (/,\d{1,2}$/.test(text) && !/\.\d+$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const parsed = Number(text);
  if (Number.isNaN(parsed)) return NaN;
  return negative ? -parsed : parsed;
};

/** `parseQuantity` with the earlier reading (see `legacyParseMoney`). */
export const legacyParseQuantity = (value: string | undefined): number => {
  if (value === undefined) return NaN;
  let text = value.trim();
  const combined = text.match(COMBINED);
  if (combined) text = combined[1]!;
  const parsed = legacyParseMoney(text);
  return Number.isNaN(parsed) ? NaN : Math.abs(parsed);
};
