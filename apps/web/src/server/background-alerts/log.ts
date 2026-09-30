/**
 * A server log line for work that runs in the background (alerts, external analysis), where
 * no request is left to answer. Only the error's own short message is written, with query
 * strings cut (a provider URL can carry a key) and the length capped.
 */
export function logFailure(context: string, error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
  console.error(`[journal] ${context}: ${message.replace(/\?\S*/g, "?…").slice(0, 300)}`);
}
