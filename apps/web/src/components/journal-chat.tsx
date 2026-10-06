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
import { useI18n } from "./i18n";

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

const formatWhen = (iso: string, timeZone: string, locale: string) =>
  new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
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
  placeholder,
  intro,
  openId,
  starter,
}: {
  target: ChatTarget;
  suggestions?: string[];
  seed?: string | null;
  placeholder?: string;
  intro?: string;
  /** A saved conversation to open at once, such as a digest's from its notification. */
  openId?: string | null;
  /** A first turn another route writes (such as a period review), shown as a button. */
  starter?: { label: string; display: string; url: string; body: Record<string, unknown> } | null;
}) {
  const { t, tn, intl } = useI18n();
  const privateMode = usePrivacy();
  const history = useApi<{ conversations: Conversation[] }>(listUrl(target));
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What Try again sends: the question, and the route it went to when a starter asked it.
  const [last, setLast] = useState<{
    question: string;
    override?: { url: string; body: Record<string, unknown> };
  }>({ question: "" });
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Only the latest conversation asked for is shown: opening one, starting a new chat or
  // sending makes any answer still on its way from an earlier open stale.
  const openSeq = useRef(0);
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
    openSeq.current++;
    setLoadingId(null);
    setActive(null);
    setMessages([]);
    setError(null);
    setShowHistory(false);
  };

  const open = useCallback(
    async (conversation: Conversation) => {
      if (busy) return;
      const seq = ++openSeq.current;
      const current = () => mounted.current && seq === openSeq.current;
      setLoadingId(conversation.id);
      setError(null);
      try {
        const response = await fetch(`/api/ai/chat/${encodeURIComponent(conversation.id)}`);
        const body = (await response.json()) as {
          conversation?: Conversation;
          messages?: ChatMessage[];
          error?: string;
        };
        if (!response.ok || !body.conversation)
          throw new Error(body.error ? t(body.error) : t("Could not open it"));
        if (!current()) return;
        setActive(body.conversation);
        setMessages(body.messages ?? []);
        setShowHistory(false);
      } catch (cause) {
        if (current())
          setError(cause instanceof Error ? cause.message : t("Could not open the conversation"));
      } finally {
        if (current()) setLoadingId(null);
      }
    },
    [busy],
  );

  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!openId || opened.current === openId) return;
    opened.current = openId;
    void open({ id: openId } as Conversation);
  }, [openId, open]);

  const remove = async (conversation: Conversation) => {
    if (busy) return;
    setRemoveError(null);
    try {
      const response = await fetch(`/api/ai/chat/${encodeURIComponent(conversation.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error ? t(body.error) : t("Request failed ({status})", { status: response.status }),
        );
      }
      if (!mounted.current) return;
      if (active?.id === conversation.id) startNew();
    } catch (cause) {
      if (mounted.current)
        setRemoveError(
          t("Could not delete the chat: {reason}", {
            reason: cause instanceof Error ? cause.message : t("the request failed."),
          }),
        );
    } finally {
      if (mounted.current) history.refresh();
    }
  };

  const send = async (raw: string, override?: { url: string; body: Record<string, unknown> }) => {
    const question = raw.trim();
    if (busy || !question) return;
    const controller = new AbortController();
    abort.current = controller;
    openSeq.current++;
    setLoadingId(null);
    setBusy(true);
    setError(null);
    setLast({ question, override });
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
    const withSeed = override
      ? override.body
      : startsNew && seed?.trim()
        ? { ...body, seed: seed.trim() }
        : body;
    try {
      const response = await fetch(override?.url ?? "/api/ai/chat", {
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
            setError(t(event.message));
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
        setError(cause instanceof Error ? cause.message : t("AI request failed"));
        if (!accepted) {
          // Refused before anything was saved: take the question back.
          setMessages((m) => m.filter((x) => x.id !== pending.id && x.id !== "pending-seed"));
          // A starter's label is not a question to edit; Try again runs the starter again.
          if (!override) setInput(question);
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
            {conversations.length
              ? t("Saved chats ({count})", { count: conversations.length })
              : t("Saved chats")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || (!active && !messages.length)}
            onClick={startNew}
          >
            <Plus />
            {t("New chat")}
          </Button>
        </div>
      </div>

      {removeError && (
        <p role="alert" className="text-xs text-destructive">
          {removeError}
        </p>
      )}

      {showHistory && (
        <div className="rounded-md border" role="region" aria-label={t("Saved chats")}>
          {conversations.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{t("No saved chats yet.")}</p>
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
                      {privateMode ? t("Chat") : c.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatWhen(c.updatedAt, target.timeZone, intl)} ·{" "}
                      {tn(c.messages ?? 0, "{count} message", "{count} messages")} ·{" "}
                      {t(c.scopeLabel)}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    // Privacy mode hides the title, also from screen readers.
                    aria-label={
                      privateMode
                        ? t("Delete chat from {when}", {
                            when: formatWhen(c.updatedAt, target.timeZone, intl),
                          })
                        : t("Delete chat {title}", { title: c.title })
                    }
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
          {outOfScope
            ? t(
                "Scope: {scope}. This chat keeps the scope it started with; start a new chat to use the current filters.",
                { scope: t(active.scopeLabel) },
              )
            : t("Scope: {scope}", { scope: t(active.scopeLabel) })}
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
          // Once the conversation exists, a retry is a follow-up in it.
          onRetry={() => void send(last.question, active ? undefined : last.override)}
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
          aria-label={active ? t("Ask a follow-up") : t("Ask your journal a question")}
          value={input}
          rows={1}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={
            active ? t("Ask a follow-up") : (placeholder ?? t("Ask a question about your trades"))
          }
          className="min-h-9 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {busy ? (
          <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>
            <Square />
            {t("Stop")}
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            {active ? <Send /> : <Sparkles />}
            {active ? t("Send") : t("Ask")}
          </Button>
        )}
      </form>

      {!active && !messages.length && starter && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void send(starter.display, { url: starter.url, body: starter.body })}
        >
          <Sparkles />
          {starter.label}
        </Button>
      )}

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
  const { t } = useI18n();
  if (!tools.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t("Journal lookups")}>
      {tools.map((tool, index) => (
        <li
          key={index}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          {tool.ok === null ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-label={t("Looking up")} />
          ) : tool.ok ? (
            <Check className="h-3 w-3" aria-label={t("Done")} />
          ) : (
            <CircleAlert className="h-3 w-3" aria-label={t("Failed")} />
          )}
          {t(tool.label)}
        </li>
      ))}
    </ul>
  );
}

function Message({ message, privateMode }: { message: ChatMessage; privateMode: boolean }) {
  const { t } = useI18n();
  if (message.role === "user")
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
          {privateMode ? t("Question hidden in privacy mode") : message.content}
        </p>
      </div>
    );
  return (
    <article className="space-y-2" aria-label={t("Answer")}>
      <ToolChips tools={message.tools} />
      <div className="text-sm leading-relaxed">
        {privateMode ? (
          <p className="text-muted-foreground">{t("Answer hidden in privacy mode.")}</p>
        ) : (
          <Markdown externalImages="ask">{message.content}</Markdown>
        )}
      </div>
      {message.status !== "done" && (
        <p className="text-xs text-muted-foreground">
          {message.status === "stopped" ? t("Stopped") : t("Cut short by an error")}
        </p>
      )}
    </article>
  );
}

function DraftMessage({ draft, privateMode }: { draft: Draft; privateMode: boolean }) {
  const { t } = useI18n();
  return (
    <article className="space-y-2" aria-label={t("Answer being written")}>
      <ToolChips tools={draft.tools} />
      {draft.text ? (
        <div className="text-sm leading-relaxed">
          {privateMode ? (
            <p className="text-muted-foreground">{t("Answer hidden in privacy mode.")}</p>
          ) : (
            <Markdown externalImages="ask">{draft.text}</Markdown>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          {draft.tools.length ? t("Looking through your journal…") : t("Thinking…")}
        </p>
      )}
    </article>
  );
}
