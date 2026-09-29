import type { AnalysisFilters } from "@luxalgo/journal-core";

/** Client-side view of the AI chat API (`/api/ai/chat`). */

export type ConversationKind = "journal" | "day" | "trade";

export interface ToolActivity {
  name: string;
  label: string;
  ok: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolActivity[];
  status: "done" | "stopped" | "error";
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  kind: ConversationKind;
  anchor: string | null;
  filters: AnalysisFilters;
  scopeLabel: string;
  createdAt: string;
  updatedAt: string;
  messages?: number;
}

export type ChatEvent =
  | { type: "conversation"; conversation: Conversation }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; label: string }
  | { type: "tool-done"; id: string; ok: boolean }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; message: string; saved: ChatMessage | null };

/**
 * Read newline-delimited JSON events as they arrive. A request the server refused before
 * streaming (a JSON `{ error }`) throws with its message.
 */
export async function readNdjson<E>(
  response: Response,
  onEvent: (event: E) => void,
): Promise<void> {
  if (!response.ok || !response.headers.get("Content-Type")?.includes("ndjson")) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Not JSON: keep the status message.
    }
    throw new Error(message);
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  const flush = (final: boolean) => {
    const lines = buffer.split("\n");
    buffer = final ? "" : lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as E);
      } catch {
        // A malformed line is skipped rather than ending the answer.
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flush(false);
  }
  buffer += decoder.decode();
  flush(true);
}

/** A chat turn's events as they arrive. */
export const readChatStream = (response: Response, onEvent: (event: ChatEvent) => void) =>
  readNdjson<ChatEvent>(response, onEvent);

/** Two filter snapshots select the same trades (key order and blank values aside). */
export function sameFilters(a: AnalysisFilters, b: AnalysisFilters): boolean {
  const norm = (f: AnalysisFilters) =>
    JSON.stringify(
      Object.entries(f)
        .filter(([, v]) => typeof v === "string" && v.trim())
        .map(([k, v]) => [
          k,
          k === "accounts"
            ? [...new Set(v!.split(",").map((s) => s.trim()))].sort().join(",")
            : v!.trim(),
        ])
        .sort(([x], [y]) => String(x).localeCompare(String(y))),
    );
  return norm(a) === norm(b);
}
