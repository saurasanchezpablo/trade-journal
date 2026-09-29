import { bad, handler, ok, requireValue } from "@/server/api";
import { aiModel } from "@/server/ai";
import { isDay, readAiRequest } from "@/server/ai-scope";
import { queryTrades, getTradeByKey } from "@/server/trades-query";
import { chatTurn, type ChatEvent } from "@/server/ai-agent/chat";
import {
  MAX_MESSAGES,
  addMessage,
  createConversation,
  getConversation,
  listConversations,
  messageCount,
  titleFrom,
  type Conversation,
  type ConversationKind,
} from "@/server/ai-agent/store";

/** Conversations with a turn in progress; a second turn waits for the first to end. */
const busy = new Set<string>();
const MAX_SEED_CHARS = 20_000;
const KINDS: ConversationKind[] = ["journal", "day", "trade"];

/** Saved conversations, newest first; `kind` and `anchor` narrow to a day's or trade's. */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const anchor = params.get("anchor");
  requireValue(!kind || KINDS.includes(kind as ConversationKind), "Invalid kind");
  requireValue(!anchor || anchor.length <= 512, "Invalid anchor");
  return ok({
    conversations: listConversations({
      kind: (kind as ConversationKind | null) ?? undefined,
      anchor: anchor ?? undefined,
    }),
  });
});

/**
 * One chat turn, streamed as newline-delimited JSON events: `conversation` first, then
 * `text` deltas and `tool` lookups as they happen, then `done` (or `error`).
 *
 * A new conversation takes `question`, `filters` and `timeZone` like Ask, plus an optional
 * `kind` ("day" with `anchor` YYYY-MM-DD, or "trade" with the trade's key, whose account is
 * then the scope) and `seed`, an earlier AI answer (a recap or critique) to follow up on.
 * A follow-up takes `conversationId` and `question`: it keeps the conversation's own scope.
 */
export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as unknown;
  requireValue(body && typeof body === "object" && !Array.isArray(body), "Invalid chat request");
  const record = body as Record<string, unknown>;
  const followUp = record.conversationId !== undefined;
  const allowed = followUp
    ? ["conversationId", "question", "timeZone"]
    : ["question", "filters", "timeZone", "kind", "anchor", "seed"];
  requireValue(
    Object.keys(record).every((key) => allowed.includes(key)),
    "Unknown chat request field",
  );

  let conversation: Conversation | null = null;
  let scope: ReturnType<typeof readAiRequest>;
  let seed: string | null = null;
  if (followUp) {
    requireValue(typeof record.conversationId === "string", "Invalid conversationId");
    conversation = getConversation(record.conversationId);
    if (!conversation) return bad("Conversation not found", 404);
    requireValue(
      messageCount(conversation.id) < MAX_MESSAGES,
      "This conversation is long enough: start a new one to keep answers focused.",
    );
    scope = readAiRequest(
      { question: record.question, filters: conversation.filters, timeZone: record.timeZone },
      "question",
    );
  } else {
    const kind = (record.kind ?? "journal") as ConversationKind;
    requireValue(KINDS.includes(kind), "Invalid kind");
    let filters = record.filters;
    if (kind === "trade") {
      requireValue(
        typeof record.anchor === "string" && record.anchor.length <= 512,
        "anchor (the trade key) is required",
      );
      requireValue(record.filters === undefined, "A trade conversation takes no filters");
      const row = getTradeByKey(record.anchor);
      if (!row) return bad("Trade not found", 404);
      // The trade's own account: its other trades are there to compare with.
      filters = { accounts: row.accountId };
    } else if (kind === "day") {
      requireValue(isDay(record.anchor), "anchor (YYYY-MM-DD) is required");
    } else {
      requireValue(record.anchor === undefined, "A journal conversation takes no anchor");
    }
    requireValue(
      record.seed === undefined ||
        (typeof record.seed === "string" &&
          record.seed.trim().length > 0 &&
          record.seed.length <= MAX_SEED_CHARS),
      `seed must be text up to ${MAX_SEED_CHARS} characters`,
    );
    seed = typeof record.seed === "string" ? record.seed.trim() : null;
    scope = readAiRequest(
      { question: record.question, filters, timeZone: record.timeZone },
      "question",
    );
    if (queryTrades(scope.filters).trades.length === 0)
      return bad("No trades match the selected accounts and filters");
    conversation = {
      id: "",
      title: titleFrom(scope.question),
      kind,
      anchor: kind === "journal" ? null : (record.anchor as string),
      filters: scope.filters,
      scopeLabel: scope.scope.label,
      createdAt: "",
      updatedAt: "",
    };
  }
  // Fails before anything is saved when no provider key is set.
  aiModel();

  if (!followUp) {
    conversation = createConversation(conversation);
    if (seed) addMessage(conversation.id, { role: "assistant", content: seed });
  }
  const active = conversation;
  if (busy.has(active.id))
    return bad("An answer is still being written in this conversation.", 409);
  busy.add(active.id);

  const stop = new AbortController();
  request.signal.addEventListener("abort", () => stop.abort(), { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent | { type: "conversation"; conversation: Conversation }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        send({ type: "conversation", conversation: getConversation(active.id) ?? active });
        for await (const event of chatTurn({
          scope,
          conversation: active,
          question: scope.question,
          signal: stop.signal,
        }))
          send(event);
      } catch {
        send({ type: "error", message: "AI request failed. Try again shortly.", saved: null });
      } finally {
        busy.delete(active.id);
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
});
