# AI chat

**Ask your journal** (Reports), **Ask about this day** (a journal day) and the chat under a
trade's **AI review** are conversations: the AI looks up what it needs in the journal with
read-only tools, the answer appears as it is written, and follow-up questions continue the
same conversation. Conversations are saved and can be reopened from **Saved chats**.

It uses the AI provider chosen in Settings (Anthropic, OpenAI or Google Gemini). Requests go
from the journal's server straight to that provider; nothing else is contacted, except the
market data source you already use when the AI asks for a trade's candles.

## Scope

A conversation keeps the scope it started with, the same scope rules as the rest of the AI
([ai-scope.md](ai-scope.md)):

- **Ask your journal** and **Ask about this day** use the selected accounts and filters when
  the chat starts. Changing the page's filters later does not change an open chat; the chat
  says so and **New chat** starts one with the current filters.
- A trade's chat uses the trade's account, so the AI can compare it with your other trades
  there.
- Every tool starts from the conversation's trades. A tool's own filters are applied on top
  and can only narrow them: asking for another account returns no trades, never that
  account's data.
- The shared day note, and plan data that spans accounts, are read only in an unfiltered,
  all-account conversation. A filtered conversation sees the chart analyses of the symbols it
  traded, as with recaps.

## Tools

All tools read; none writes. Results are limited in size (lists are shortened first, with a
note saying how many were left out), and a turn makes at most eight lookups before it
answers.

| Tool                                        | What it reads                                                                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journal_overview`                          | Totals for the scope or a slice (P&L, win rate, profit factor, drawdown, streaks, R), per account with its currency, and the strategies, symbols, tags and mistakes in scope with the ids other tools filter by. |
| `find_trades`                               | Trades matching filters, sorted by open or close time, net P&L, realized R or holding time, at most 50 per call, with paging.                                                                                    |
| `group_stats`                               | Closed trades grouped by any Reports dimension (symbol, strategy, tag, mistake, weekday, hour, holding time, R bands, ...), optionally split by a second one.                                                    |
| `get_trade`                                 | One trade: its fills, notes, stop and target, tags, mistakes, rating, strategy and the strategy's rules.                                                                                                         |
| `get_candles`                               | Candles around one trade, how far price went for and against the entry while it was open, and the trade's market context (range, VWAP, capture).                                                                 |
| `get_day`                                   | One journal day: its trades and totals, the day note (unfiltered scope only), and the day's chart analyses with plan grades and price action.                                                                    |
| `behaviour_patterns`                        | Habits measured against the rest (revenge trades, trading on after losses, sizing up, late fade); see [ai-coaching.md](ai-coaching.md#habits-reports--habits).                                                   |
| `recurring_lessons`                         | Keep and Fix lessons from day notes, grouped, with weeks in a row (unfiltered all-account conversations only).                                                                                                   |
| `search_notes`                              | Your notes searched by meaning (by words without an embedding provider).                                                                                                                                         |
| `list_chart_analyses`, `get_chart_analysis` | Saved chart analyses, and one in full: drawings with their prices, zones, indicators, notes and trade plan.                                                                                                      |

The filters are the journal's filter fields (`symbol`, `tag`, `from`, `pnlMin`, `weekdays`,
`entryAfter`, ...), checked like the page's: an unknown field or a malformed value is an error
the AI sees and can correct.

`get_candles` needs to know where the symbol's candles come from: a chart you saved on that
symbol (its source and dataset are used), or the trade's **Market data & replay** once loaded.
Without either it answers that no source is known.

## Answers as they are written

Chat answers, trade critiques, recaps and the weekly review are streamed: the text shows as
the provider writes it. Chat answers also show each lookup as it runs. **Stop** ends an
answer; what was written so far is kept and marked as stopped. A recap joins the day note once
it is complete, as before.

## Saved conversations

Conversations are stored in the journal's database, in tables of their own
(`ai_conversations`, `ai_messages`, created on first use). The most recent 200 are kept; a
conversation holds up to 60 messages, after which the chat asks you to start a new one. A
follow-up sends the conversation's last 20 messages as text; lookups are made again when
needed rather than resent. Delete a conversation from **Saved chats**.

In privacy mode, questions and answers are hidden on screen.

## Scheduled digests

**Daily journal → Scheduled digests** has the AI write, on schedule, a **session recap** (at a
time you choose, on the weekdays you choose) and a **weekly review** (the seven days ending on
the weekday you choose), in the journal's timezone. Both are off until you switch them on.

- Each digest is an AI chat with the same tools and scope rules as above: a recap covers all
  accounts for that day (so it reads the day note), a weekly review covers all accounts from
  the week's first day to its last. It is saved like any chat, so you can open it and ask
  follow-ups: a recap opens on its journal day, a weekly review on Reports.
- It is sent through the background alerts delivery ([alerts.md](alerts.md#how-you-are-notified)):
  the browsers you turned notifications on for, and the webhook (such as an ntfy topic). With
  neither set up, digests are still written and listed on the card.
- The notification says how many trades were reviewed and opens the chat. **Put the start of
  the review in the notification** adds its first sentences instead; they can include amounts,
  which then show on lock screens and in webhook messages.
- Days with no closed trades and no day note, and weeks with neither trades nor Keep/Fix
  lessons, are skipped without asking the AI.
- The server checks once a minute. A slot missed while it was down is still sent if it is
  recent (up to three hours late for a recap, a day for the weekly review), never a stale one.
  Each digest is sent once per day or week; **Send today's recap now** and **Send this
  week's review now** write one on demand (again if it was already sent).
- The card lists the latest digests: sent (and to how many devices), skipped or failed, with
  the reason. A digest the server was writing when it stopped shows as failed (interrupted)
  and can be sent again at once. They are kept in their own table (`ai_digests`, created on first use); the most
  recent 120 are kept. `JOURNAL_AI_DIGESTS=off` stops the check entirely.

## API

- `POST /api/ai/chat` streams one turn as newline-delimited JSON (`application/x-ndjson`):
  `conversation` first, then `text` deltas and `tool` / `tool-done` lookups, then `done` with
  the saved answer, or `error` with a message that never includes the provider's own text.
  - A new chat sends `question`, `filters` and `timeZone` like Ask; optional `kind` (`day`
    with `anchor` YYYY-MM-DD, or `trade` with the trade key as `anchor` and no filters) and
    `seed`, an earlier recap or critique to follow up on.
  - A follow-up sends `conversationId` and `question` (and optionally `timeZone`).
  - Invalid requests are refused with a JSON 400 before any provider call.
- `GET /api/ai/chat?kind=&anchor=` lists conversations; `GET /api/ai/chat/{id}` returns one
  with its messages; `DELETE /api/ai/chat/{id}` removes it.
- `GET /api/ai/digests` returns the digest settings, where they are delivered and the latest
  digests; `PUT` saves `{ recap: { enabled, time, weekdays }, weekly: { enabled, weekday,
time }, summaryInNotification }` (times `HH:MM`, weekdays 0 Sunday to 6 Saturday).
  `POST /api/ai/digests/run` with `kind` (`day` or `week`) and optional `period` (YYYY-MM-DD,
  default today) writes and sends one now.
- `POST /api/ai/recap`, `/api/ai/critique` and `/api/ai/weekly` take `stream: true` for the
  same `text` events followed by `done` with their usual payload.

## Verification without an AI connection

`pnpm exec vitest run apps/web/tests/ai-chat.test.ts` replays provider streams in the
Anthropic, OpenAI (Responses) and Gemini formats at the `fetch` level: tool calls and their
results, a follow-up's history, the scope never widening, provider failures, stopping part
way, and the streamed recap, critique and weekly review. `ai-digests.test.ts` covers the
schedule (weekdays, timezone, catch-up), sending once per period, skipping empty days, the
notification's wording and links, and the settings API; `alert-explain.test.ts` the notes on
alerts.
