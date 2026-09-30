# AI coaching: analysis, memory and suggestions you apply

These features build on the AI chat ([ai-chat.md](ai-chat.md)) and the journal's own numbers.
The journal computes the facts (habits, market context, goals, lessons); the AI explains them
or proposes something. Every proposal is shown to you first: nothing in the journal changes
until you apply it. Requests go only to the AI provider chosen in Settings.

## Deeper analysis

### Habits (Reports → Habits)

`detectBehaviours` in `packages/core` measures each habit against the rest of your trades:

| Habit                           | Which trades                                                              |
| ------------------------------- | ------------------------------------------------------------------------- |
| Revenge trades                  | Opened within 15 minutes of a losing trade closing, on the same account.  |
| Trading on after losses         | Taken after two losses in a row on the same day (journal timezone).       |
| Sizing up after a loss          | Larger than the last trade on the symbol closed before it opened, a loss. |
| Size creeping up                | The latest third of a symbol's trades is 25% or more larger than before.  |
| Results fading later in the day | A day's fourth trade on, against its first three.                         |

A habit is flagged ("costing you") only with at least five trades on each side and a worse
average result; its cost is what those trades lost against your usual result. Others read
"no harm found" or "too few trades". The AI chat's `behaviour_patterns` tool returns the
same numbers, so answers about discipline cite them rather than estimates.

### Trade critiques with market context

When the journal knows where a trade's candles come from (the trade's **Market data &
replay**, else a chart saved on its symbol), a critique also gets: where the entry sat in the
day's range so far and against the day's VWAP, how far price went against the entry and in
its favour while open (in R with a stop), how much of that move the exit kept, whether the
stop and target were reached, and how far price ran after the exit. With **Include linked
chart analyses** on and the replay chart on screen, its picture goes with the critique.
The chat's `get_candles` tool includes the same facts.

### Playbook check (trade page → Strategy rule review → Check with AI)

For a trade with a playbook, the AI judges each written rule as followed, broken or "can't
tell", with one sentence of evidence (fills, stop, notes, market context). A rule it skips is
"can't tell". **Apply** sets that rule in your review; **Apply N suggestions** sets all the
decided ones.

### Pre-market plan draft (Charts → Plan → Draft the day's plan)

From the analysis's own levels (lines, labels, Fibonacci levels, zones), the previous
session's open, high, low and close, the average daily range and the day so far, the AI
proposes a bias and up to four scenarios, naming the level each price comes from. A price on
the wrong side for the direction (a long's invalidation above its trigger) is left out with
the reason. **Add** puts a scenario in the plan; it saves with the analysis.

### Levels from a screenshot (Charts → Support and resistance)

Choose or paste a chart picture (PNG, JPEG or WebP, scaled down in the browser when large).
The AI reads its horizontal lines and zones off the price axis and labels. Levels outside the
picture's axis, or far from the chart's current price, are marked as doubtful and not ticked;
low-confidence ones are not ticked either. **Add to the chart** draws the ticked lines and
zones. If the picture shows another symbol, the list says so.

### Monthly and quarterly reviews (Daily journal)

Goals are set per month or quarter: a metric (net P&L, win rate, profit factor, max drawdown,
average R, green days, trades per day, most trades in a day, revenge trades, trades reviewed,
trades with a stop, routines done) with "at least" or "at most" and a target, or a written
goal. Each is measured live from the period's trades (all accounts, by close day) and your
Progress routines; nothing measured is stored. **Suggest goals** proposes up to three from
the period before; **Add** keeps one. **Write the review** has the AI chat write the review
from the goals, the period against the one before, its weeks, flagged habits and recurring
lessons. It is saved as a chat you can follow up on. Goals live in their own table
(`review_goals`) and are included in the JSON export as `reviewGoals`.

## Memory

### Lessons that keep coming back (Daily journal)

Every Keep and Fix item in your day notes is read on the fly (the notes stay the only copy).
Items that say the same thing in other words are grouped ("no trades after 3pm", "No more
trading after 3 pm"), and each lesson counts its days, weeks and weeks in a row. Recaps and
weekly reviews (written or scheduled) are told which lessons came back, so they can say
"third week in a row". The chat's `recurring_lessons` tool reads the same list; like day
notes, it needs an unfiltered all-account conversation.

### Search your notes (Daily journal; "Find similar past days/trades")

Day notes, trade notes (with their labels) and notebook notes are cut into passages. With
OpenAI or Google Gemini as the AI provider, passages are indexed once as embeddings
(`text-embedding-3-small` or `gemini-embedding-001`), kept in their own table
(`note_passages`, by passage text, so only new or edited passages are sent), and matched by
meaning. Anthropic has no embeddings API, so with it (or on any provider error) the search
matches words (BM25) on the server, sending nothing. **Find similar past days** uses the day's
note and trades as the question and leaves that day out. The chat's `search_notes` tool
searches the same way; a filtered conversation searches only notes of trades in scope.

## Answers you can act on

### Suggested labels (trade page; Trades → select up to 20 → Suggest labels)

The AI proposes tags, mistakes (only ones the facts show) and a 1 to 5 execution rating, with
a reason, reusing the labels you already use and marking new ones as "(new)". Labels the
trade already has are left out. Each chip adds one label; **Apply all** adds everything.

### Column mapping help (Import, for an unrecognised file)

**Suggest with AI** sends the header row and the first five rows to the provider and fills
the column mapper with the columns it recognises (only real headers, one field each). The
importers' rule stands: nothing is imported until you check the mapping and preview it.

### Voice memo to note (day and trade pages)

**Voice memo** opens a box to dictate (or type) freely. **Make it a note** has the AI sort it
into short sections with **Keep** and **Fix** lists, keeping your facts and words and adding
nothing; it streams as it is written. **Add to note** appends it; its lessons then count in
lesson tracking.

## API

All routes take hand-checked JSON and never change journal data themselves:

- `GET /api/behaviour?<filters>`; `GET /api/lessons?to=&weeks=`.
- `POST /api/ai/playbook-check` `{ key, chartImage? }`.
- `POST /api/ai/suggest-labels` `{ keys }` (1 to 20).
- `POST /api/ai/suggest-mapping` `{ content }`.
- `POST /api/ai/structure-note` `{ text, kind: "day" | "trade", stream? }`.
- `POST /api/ai/plan-draft` `{ analysisId, day? }`.
- `POST /api/ai/chart-levels` `{ image, symbol?, lastPrice? }`.
- `GET|POST|DELETE /api/goals`; `POST /api/ai/suggest-goals` `{ kind, period }`;
  `POST /api/ai/period-review` `{ kind, period, timeZone? }` (streams chat events).
- `POST /api/notes-search` `{ query | similarTo: { date } | { tradeKey }, limit? }`.
- `POST /api/ai/critique` also takes `chartImage` (a PNG of the trade's chart).

Structured answers (checks, labels, mappings, plans, levels, goals) are requested as JSON
matching a schema and read by hand: an unreadable answer is an error, never a guess.

## Verification without an AI connection

`ai-actions.test.ts` replays provider answers at the `fetch` level (structured JSON for
Anthropic, OpenAI and Gemini; streamed text; OpenAI embeddings) for every route above.
`behaviour.test.ts` (core), `lesson-tracking.test.ts`, `trade-context.test.ts`,
`goals.test.ts`, `plan-draft.test.ts` and `note-search.test.ts` cover the calculations.
