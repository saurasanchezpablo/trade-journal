"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  History,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import type { AnalysisFilters } from "@luxalgo/journal-core";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/use-api";
import {
  readChatStream,
  sameFilters,
  type ChatMessage,
  type Conversation,
  type ConversationKind,
} from "@/lib/ai-chat";
import { AiNotice } from "./ai-notice";
import { Markdown } from "./rich-editor";
import { usePrivacy } from "./privacy";

/** What a chat is about. A trade's chat uses the trade's account as its scope. */
export type ChatTarget =
  | { kind: "journal"; filters: AnalysisFilters; timeZone: string }
  | { kind: "day"; date: string; filters: AnalysisFilters; timeZone: string }
  | { kind: "trade"; tradeKey: string; timeZone: string };

interface Draft {
  text: string;
  tools: { id: string; label: string; ok: boolean | null }[];
}

const anchorOf = (target: ChatTarget) =>
  target.kind === "day" ? target.date : target.kind === "trade" ? target.tradeKey : null;

const listUrl = (target: ChatTarget) => {
  const params = new URLSearchParams({ kind: target.kind });
  const anchor = anchorOf(target);
  if (anchor) params.set("anchor", anchor);
  return `/api/ai/chat?${params}`;
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * A conversation with the journal: the model looks things up with read-only journal tools,
 * the answer appears as it is written, and follow-ups keep the conversation's scope.
 * Conversations are saved; `seed` (an earlier recap or critique) starts a new one.
 */
export function JournalChat({
  target,
  suggestions = [],
  seed,
  placeholder = "Ask a question about your trades",
  intro,
}: {
  target: ChatTarget;
  suggestions?: string[];
  seed?: string | null;
  placeholder?: string;
  intro?: string;
}) {
  const privateMode = usePrivacy();
  const history = useApi<{ conversations: Conversation[] }>(listUrl(target));
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (draft || messages.length) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [draft, messages.length]);

  const startNew = () => {
    if (busy) return;
    setActive(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
  };

  const open = useCallback(
    async (conversation: Conversation) => {
      if (busy) return;
      setLoadingId(conversation.id);
      setError(null);
      try {
        const response = await fetch(`/api/ai/chat/${encodeURIComponent(conversation.id)}`);
        const body = (await response.json()) as {
          conversation?: Conversation;
          messages?: ChatMessage[];
          error?: string;
        };
        if (!response.ok || !body.conversation) throw new Error(body.error ?? "Could not open it");
        if (!mounted.current) return;
        setActive(body.conversation);
        setMessages(body.messages ?? []);
        setShowHistory(false);
      } catch (cause) {
        if (mounted.current)
          setError(cause instanceof Error ? cause.message : "Could not open the conversation");
      } finally {
        if (mounted.current) setLoadingId(null);
      }
    },
    [busy],
  );

  const remove = async (conversation: Conversation) => {
    if (busy) return;
    await fetch(`/api/ai/chat/${encodeURIComponent(conversation.id)}`, { method: "DELETE" });
    if (active?.id === conversation.id) startNew();
    history.refresh();
  };

  const send = async (raw: string) => {
    const question = raw.trim();
    if (busy || !question) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError(null);
    setLastQuestion(question);
    setInput("");
    const pending: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: question,
      tools: [],
      status: "done",
      createdAt: new Date().toISOString(),
    };
    const startsNew = !active;
    setMessages((m) => [
      ...m,
      ...(startsNew && seed?.trim()
        ? [{ ...pending, id: "pending-seed", role: "assistant" as const, content: seed.trim() }]
        : []),
      pending,
    ]);
    const current: Draft = { text: "", tools: [] };
    setDraft({ ...current });
    let accepted = false;
    const body = active
      ? { conversationId: active.id, question, timeZone: target.timeZone }
      : target.kind === "trade"
        ? { question, kind: "trade", anchor: target.tradeKey, timeZone: target.timeZone }
        : {
            question,
            filters: target.filters,
            timeZone: target.timeZone,
            ...(target.kind === "day" ? { kind: "day", anchor: target.date } : {}),
          };
    const withSeed = startsNew && seed?.trim() ? { ...body, seed: seed.trim() } : body;
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withSeed),
        signal: controller.signal,
      });
      await readChatStream(response, (event) => {
        if (!mounted.current) return;
        switch (event.type) {
          case "conversation":
            accepted = true;
            setActive(event.conversation);
            break;
          case "text":
            current.text += event.delta;
            setDraft({ text: current.text, tools: current.tools });
            break;
          case "tool":
            current.tools = [...current.tools, { id: event.id, label: event.label, ok: null }];
            setDraft({ text: current.text, tools: current.tools });
            break;
          case "tool-done":
            current.tools = current.tools.map((t) =>
              t.id === event.id ? { ...t, ok: event.ok } : t,
            );
            setDraft({ text: current.text, tools: current.tools });
            break;
          case "done":
            setMessages((m) => [...m, event.message]);
            break;
          case "error":
            if (event.saved) setMessages((m) => [...m, event.saved!]);
            setError(event.message);
            break;
        }
      });
    } catch (cause) {
      if (!mounted.current) return;
      if (controller.signal.aborted) {
        // The server keeps what was written as a stopped answer; show the same here.
        if (current.text.trim())
          setMessages((m) => [
            ...m,
            {
              id: `stopped-${Date.now()}`,
              role: "assistant",
              content: current.text,
              tools: current.tools.map((t) => ({ name: "", label: t.label, ok: t.ok !== false })),
              status: "stopped",
              createdAt: new Date().toISOString(),
            },
          ]);
      } else {
        setError(cause instanceof Error ? cause.message : "AI request failed");
        if (!accepted) {
          // Refused before anything was saved: take the question back.
          setMessages((m) => m.filter((x) => x.id !== pending.id && x.id !== "pending-seed"));
          setInput(question);
        }
      }
    } finally {
      abort.current = null;
      if (mounted.current) {
        setDraft(null);
        setBusy(false);
        history.refresh();
      }
    }
  };

  const conversations = history.data?.conversations ?? [];
  const outOfScope =
    active && target.kind !== "trade" && !sameFilters(active.filters, target.filters);

  return (
    <div className="space-y-3" data-journal-chat>
      <div className="flex flex-wrap items-center gap-2">
        {intro && <p className="mr-auto text-xs text-muted-foreground">{intro}</p>}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showHistory}
            disabled={busy}
            onClick={() => setShowHistory((v) => !v)}
          >
            <History />
            Saved chats{conversations.length ? ` (${conversations.length})` : ""}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || (!active && !messages.length)}
            onClick={startNew}
          >
            <Plus />
            New chat
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-md border" role="region" aria-label="Saved chats">
          {conversations.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No saved chats yet.</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void open(c)}
                    disabled={busy}
                  >
                    <span className="block truncate text-sm">
                      {loadingId === c.id && (
                        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />
                      )}
                      {privateMode ? "Chat" : c.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatWhen(c.updatedAt)} · {c.messages ?? 0} messages · {c.scopeLabel}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Delete chat ${c.title}`}
                    onClick={() => void remove(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {active && (
        <p className="text-xs text-muted-foreground">
          Scope: {active.scopeLabel}
          {outOfScope &&
            ". This chat keeps the scope it started with; start a new chat to use the current filters."}
        </p>
      )}

      {(messages.length > 0 || draft) && (
        <div className="space-y-3" aria-live="polite" aria-busy={busy}>
          {messages.map((m) => (
            <Message key={m.id} message={m} privateMode={privateMode} />
          ))}
          {draft && <DraftMessage draft={draft} privateMode={privateMode} />}
          <div ref={bottom} />
        </div>
      )}

      {error && (
        <AiNotice
          error={error}
          onRetry={() => void send(lastQuestion)}
          onDismiss={() => setError(null)}
        />
      )}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <textarea
          aria-label={active ? "Ask a follow-up" : "Ask your journal a question"}
          value={input}
          rows={1}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={active ? "Ask a follow-up" : placeholder}
          className="min-h-9 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>
            <Square />
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            {active ? <Send /> : <Sparkles />}
            {active ? "Send" : "Ask"}
          </Button>
        )}
      </form>

      {!active && !messages.length && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:cursor-wait disabled:opacity-50"
              onClick={() => void send(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolChips({ tools }: { tools: { label: string; ok: boolean | null }[] }) {
  if (!tools.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Journal lookups">
      {tools.map((tool, index) => (
        <li
          key={index}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {tool.ok === null ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-label="Looking up" />
          ) : tool.ok ? (
            <Check className="h-3 w-3" aria-label="Done" />
          ) : (
            <CircleAlert className="h-3 w-3" aria-label="Failed" />
          )}
          {tool.label}
        </li>
      ))}
    </ul>
  );
}

function Message({ message, privateMode }: { message: ChatMessage; privateMode: boolean }) {
  if (message.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
          {privateMode ? "Question hidden in privacy mode" : message.content}
        </p>
      </div>
    );
  return (
    <article className="space-y-2" aria-label="Answer">
      <ToolChips tools={message.tools} />
      <div className="text-sm leading-relaxed">
        {privateMode ? (
          <p className="text-muted-foreground">Answer hidden in privacy mode.</p>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}
      </div>
      {message.status !== "done" && (
        <p className="text-xs text-muted-foreground">
          {message.status === "stopped" ? "Stopped" : "Cut short by an error"}
        </p>
      )}
    </article>
  );
}

function DraftMessage({ draft, privateMode }: { draft: Draft; privateMode: boolean }) {
  return (
    <article className="space-y-2" aria-label="Answer being written">
      <ToolChips tools={draft.tools} />
      {draft.text ? (
        <div className="text-sm leading-relaxed">
          {privateMode ? (
            <p className="text-muted-foreground">Answer hidden in privacy mode.</p>
          ) : (
            <Markdown>{draft.text}</Markdown>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          {draft.tools.length ? "Looking through your journal…" : "Thinking…"}
        </p>
      )}
    </article>
  );
}
