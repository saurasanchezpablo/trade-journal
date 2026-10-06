import { readNdjson } from "./ai-chat";
import { tr } from "./i18n";

type StreamEvent =
  | { type: "text"; delta: string }
  | ({ type: "done" } & Record<string, unknown>)
  | { type: "error"; message: string };

/**
 * POST to an AI route that can stream (recap, critique, weekly review): `onText` gets the
 * answer so far as it is written, and the promise resolves with the route's usual JSON
 * payload once it is done.
 */
export async function postAiStream<T>(
  url: string,
  body: Record<string, unknown>,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  let text = "";
  let result: T | null = null;
  let failure: string | null = null;
  await readNdjson<StreamEvent>(response, (event) => {
    if (event.type === "text") {
      text += event.delta;
      onText(text);
    } else if (event.type === "done") {
      const { type: _type, ...payload } = event;
      result = payload as T;
    } else if (event.type === "error") {
      failure = event.message;
    }
  });
  // The server writes its messages in English; shown in the journal's language.
  if (failure) throw new Error(tr(failure));
  if (result === null) throw new Error(tr("The answer was cut off. Try again."));
  return result;
}
