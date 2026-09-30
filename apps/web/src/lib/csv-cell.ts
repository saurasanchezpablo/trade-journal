/**
 * One CSV cell for a spreadsheet. Text that starts like a formula (= + - @, a tab or a
 * carriage return) is prefixed with an apostrophe so Excel, Numbers or Sheets show it
 * instead of running it; a cell holding a comma, quote or line break is quoted. Numbers
 * are written as they are, so negative P&L stays a number.
 */
export const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
