import { streamAi } from "./ai";
import { requireValue } from "./api";

/**
 * AI answers streamed as newline-delimited JSON events, so the page shows them as they are
 * written. A request is checked before streaming starts: its errors stay plain JSON 400s.
 */

type Send = (event: Record<string, unknown> & { type: string }) => void;

/** A streaming response. `stop` aborts when the reader goes away or the request ends. */
export function ndjsonResponse(
  request: Request,
  produce: (send: Send, stop: AbortSignal) => Promise<void>,
): Response {
  const stop = new AbortController();
  request.signal.addEventListener("abort", () => stop.abort(), { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send: Send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await produce(send, stop.signal);
      } catch {
        send({ type: "error", message: "AI request failed. Try again shortly." });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the reader going away.
          }
        }
      }
    },
    cancel() {
      stop.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store",
      // Proxies must pass events through as they are written.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * A one-shot answer (recap, critique, weekly review) as `text` deltas, then `done` with the
 * same payload the JSON response has, built from the full text; or `error`.
 */
export function streamedAnswer(
  request: Request,
  ai: { prompt: string; maxOutputTokens?: number; images?: Buffer[] },
  payload: (text: string) => Record<string, unknown>,
): Response {
  return ndjsonResponse(request, async (send, stop) => {
    let text = "";
    try {
      for await (const delta of streamAi(ai.prompt, ai.maxOutputTokens, ai.images, stop)) {
        text += delta;
        send({ type: "text", delta });
      }
    } catch (error) {
      send({
        type: "error",
        message: error instanceof Error ? error.message : "AI request failed",
      });
      return;
    }
    if (!stop.aborted) send({ type: "done", ...payload(text) });
  });
}

/** `stream: true` in a request body asks for the streamed form. */
export function wantsStream(value: unknown): boolean {
  requireValue(value === undefined || typeof value === "boolean", "stream must be true or false");
  return value === true;
}
