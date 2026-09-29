import { vi } from "vitest";

/**
 * AI provider responses as they stream over the wire (Anthropic Messages, OpenAI Responses,
 * Gemini), for tests that stub `fetch` and run the real AI SDK and provider adapters.
 */

export const sse = (chunks: object[], named = false) =>
  new Response(
    chunks
      .map(
        (c) =>
          `${named ? `event: ${(c as { type: string }).type}\n` : ""}data: ${JSON.stringify(c)}\n\n`,
      )
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

export const anthropic = {
  start: {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-fixture",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  },
  tool: (id: string, name: string, input: unknown) =>
    sse(
      [
        anthropic.start,
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id, name, input: {} },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: JSON.stringify(input) },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "tool_use", stop_sequence: null },
          usage: { output_tokens: 1 },
        },
        { type: "message_stop" },
      ],
      true,
    ),
  text: (...parts: string[]) =>
    sse(
      [
        anthropic.start,
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        ...parts.map((text) => ({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        })),
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 1 },
        },
        { type: "message_stop" },
      ],
      true,
    ),
};

export const openai = {
  created: {
    type: "response.created",
    response: { id: "resp_1", created_at: 1, model: "gpt-fixture" },
  },
  completed: {
    type: "response.completed",
    response: { usage: { input_tokens: 1, output_tokens: 1 } },
  },
  tool: (callId: string, name: string, input: unknown) => {
    const item = { type: "function_call", id: "fc_1", call_id: callId, name, arguments: "" };
    return sse([
      openai.created,
      { type: "response.output_item.added", output_index: 0, item },
      {
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        output_index: 0,
        delta: JSON.stringify(input),
      },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: { ...item, arguments: JSON.stringify(input), status: "completed" },
      },
      openai.completed,
    ]);
  },
  text: (text: string) =>
    sse([
      openai.created,
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "message", id: "msg_1" },
      },
      { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, delta: text },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: { type: "message", id: "msg_1" },
      },
      openai.completed,
    ]),
};

export const gemini = {
  tool: (name: string, args: unknown) =>
    sse([
      {
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name, args }, thoughtSignature: "fixture-signature" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    ]),
  text: (text: string) =>
    sse([
      {
        candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      },
    ]),
};

/** A provider that answers each request with the next scripted response. */
export function script(...responses: (() => Response)[]) {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected provider call");
    return next();
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    fetcher,
    body: (call: number) =>
      JSON.parse(String((fetcher.mock.calls[call] as [string, RequestInit])[1].body)) as unknown,
  };
}
