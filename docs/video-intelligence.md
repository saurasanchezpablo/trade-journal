# Video intelligence

**Video intelligence** (sidebar) checks what the analysts you follow on
[External analysis](external-analysis.md) claimed in their videos against what the market did
afterwards. It answers, with the evidence and the sample behind each number: which claims came
true, which were invalidated or never resolved, which analysts get the direction right but the
timing wrong, and what the setups they stated would have returned as trades after costs.

Predictions and simulated trades are kept apart everywhere: a right direction is not a
profitable trade, and only a setup that states an entry, a stop and a target is ever traded.

## Getting started

1. Follow channels on External analysis; their videos are stored with a transcript (from the
   captions or one you paste) or a summary.
2. Enable the market data sources that list what they talk about in **Settings → Market
   data**: Binance, Bybit or Coinbase for crypto; Yahoo Finance for stocks, ETFs, indices,
   futures and currency pairs (Kraken and Nasdaq as fallbacks). No key is needed for these.
3. On **Video intelligence → Processing**, select **Start: read every video**. Every stored
   video is queued once; new ones are queued as their summaries arrive. Videos with a transcript
   are read by your AI provider (Settings → AI), which uses tokens: the page counts them.

Nothing runs until you start it. `JOURNAL_VIDEO_INTELLIGENCE=off` stops even the check.

## Claims

A video is read into separate claims, each checked on its own terms:

| Kind        | What it is                                        | How it is checked                                  |
| ----------- | ------------------------------------------------- | -------------------------------------------------- |
| forecast    | "Price reaches 100 within five sessions"          | target against invalidation inside the horizon     |
| conditional | "If it breaks 95, the next target is 100"         | only after the trigger is traded through           |
| setup       | a trade with entry, stop and targets              | as a forecast, and simulated as a trade at level C |
| level       | a support or resistance expected to hold or break | as a forecast when it has a target or invalidation |
| commentary  | a view with a direction and nothing else          | direction at the horizon's end                     |

Each claim keeps:

- **origin**: `explicit` (the analyst said it), `inferred` (the AI read it from what they said)
  or `summary` (taken from the video's summary: a video with no transcript, no AI call, no
  quote). **Only what the analyst said** on the page shows explicit claims only.
- **evidence**: a verbatim quote and its time mark, looked up in the transcript after the AI
  answers: `verified` (word for word, punctuation and time marks aside), `approximate` (60% of
  its five-word runs found) or `not found`. The time mark links to that moment of the video.
- **probability**: only a probability the analyst stated. The AI's own confidence in reading
  the claim is stored separately and is never used as a probability.
- the instrument as named and its ticker when unambiguous, direction, timeframe, a stated
  horizon, the price they quote, trigger, targets, invalidation (on a close or a touch), entry
  zone, stop, indicators, what the video leaves unclear, and a recording date they state.

The transcript is someone else's text: instructions inside it are read as content, never
followed. Every AI answer is checked by hand (`readClaims`); a malformed claim is dropped, a
malformed answer fails the video, which is retried.

## Timing

- **Claim time** is the video's publication: a viewer could not act on it earlier, and judging
  from an earlier recording would credit moves nobody could trade on. A recording date the
  analyst states is kept and shown, not used.
- **Horizon**: the stated one ("this week", "five sessions"). With none, the system's, by
  timeframe: intraday a day, 1h to 4h ten days, daily a month, weekly and longer six months,
  unknown a month. A claim judged on the system's horizon says so ("system horizon").

## Market data

- **Instrument**: crypto, forex, stocks, ETFs and futures are resolved as a trade's candles
  are (`tradeMarketSource`): a coin on Binance, Bybit or Coinbase however it is written, a
  currency pair on Yahoo or Kraken, a stock on Yahoo or Nasdaq, a future as Yahoo's continuous
  front month. Indices are looked up by their usual names (S&P 500, SPX, US500: `^GSPC`;
  Nasdaq 100, DAX, Dow, Russell 2000, VIX, FTSE, Nikkei) on Yahoo. Commodity spot prices
  (gold, oil) have no keyless source and are not evaluated: their futures are a different
  instrument. Nothing is guessed across asset classes; an instrument no enabled source lists is
  **unevaluable**, with the reason.
- **Candles**: the finest size with at most 400 candles across the horizon (1h for ten days),
  read from 120 candles before the claim to one more horizon after it (for late targets), never
  past now, closed candles only. They are stored (`vi_series`, `vi_candles`) with their source,
  symbol, size and retrieval time, and the evaluation reads them back from storage: an outcome
  can always be computed again from the stored claim, the stored candles and the evaluator
  version.
- **Look-ahead**: the reference price is the close of the last candle that had closed by the
  claim's time, and only candles opening at or after the claim count as afterwards. Nothing
  after the claim describes what was known then.
- A price quoted in the video more than 10% from the market's is flagged on the claim: often a
  sign of the wrong instrument.

## Outcomes

`packages/core/src/claims.ts` (`evaluateClaim`), deterministic and unit-tested:

| Status          | Meaning                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| target hit      | the nearest target in the claim's direction traded before the invalidation, inside the horizon        |
| invalidated     | the invalidation came first (on a close when the analyst said so, else a touch)                       |
| ambiguous       | both inside one candle: the candle cannot tell which came first; never counted as a win               |
| expired         | the horizon ended with neither                                                                        |
| target hit late | expired, but the target traded later (before any invalidation)                                        |
| not triggered   | a conditional claim whose trigger never traded inside the horizon                                     |
| pending         | the horizon has not ended yet: never a failure                                                        |
| unevaluable     | no instrument, no candles, no direction and no one-sided target, or nothing to check; with the reason |

Also measured: time to target and to invalidation (from the claim, or from the trigger), the
best and worst move from the reference inside the horizon (MFE, MAE), and **direction at the
horizon**: the close at the horizon's end against the reference (moves under 0.05% are flat).
A neutral claim with targets all on one side is evaluated on that side, noted.

Pending and not-yet-evaluable claims are evaluated again every six hours as candles arrive.

## Strategy levels and simulated trades

- **A**: a checkable prediction. **B**: some trade rules (an entry or a stop) but not enough
  to trade. **C**: an entry, a stop and a target stated: simulated (`simulateSetup`).
- Execution: one trade; a limit entry at the near edge of the stated zone between publication
  and the horizon's end (at the open when a candle opens past it); exit at the stop, at the
  nearest target once price trades beyond it by the target buffer, or at the close of the last
  candle inside the horizon. A gap past the stop exits at the open. A stop and a target inside
  one candle count as the stop and flag the trade ambiguous. The entry candle can stop the
  trade out but cannot take its target. A trade whose horizon has not ended and data ran out
  stays open and is left out of the statistics.
- Costs (Strategies tab): commission per side and slippage per fill in basis points (5 and 5
  by default), and the target buffer (2). Gross and net returns are kept, the trade's result in
  R (net over the stop's distance), and the same trade at no cost and at twice the costs.
  Changing the costs simulates every setup again.
- These are hypothetical results of the stated rules, not the analyst's own trading record.

## Metrics

| Metric                     | Definition                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Settled                    | target hit, invalidated, expired or target hit late                                                                                     |
| Target hit rate            | target hit / settled, with its 95% Wilson interval                                                                                      |
| Direction right at horizon | correct / (correct + incorrect) among claims whose horizon ended                                                                        |
| Right but missed           | direction right at the horizon, yet invalidated or expired: timing or risk                                                              |
| Median time to target      | over claims whose target was hit                                                                                                        |
| Brier score                | mean of (stated probability − outcome)² over explicit claims with a stated probability that settled; 0 perfect, 0.25 a coin flip at 50% |
| Win rate                   | simulated trades with a positive net return / closed trades, with its Wilson interval                                                   |
| Expectancy                 | mean net return per trade, with a 95% normal interval                                                                                   |
| Average R                  | mean net result in R                                                                                                                    |
| Profit factor              | sum of winning net returns / sum of losing ones (none without a losing trade)                                                           |
| Max drawdown               | largest fall of the cumulative net return, trade after trade (additive, no compounding)                                                 |

Groups (analyst, instrument, direction, kind, market regime, origin) are listed by how much
evidence they hold, never by rate. A group with fewer than 20 settled claims (or closed
trades) shows a **small sample** warning: its rate should not be compared. Market regime is
read from the 120 candles before the claim: trend (the close against its 50-candle average) and
volatility (the last 14 candles' range against the 100 before; high above 1.25×).

## Processing

- One job per video (`vi_jobs`): queued, running, done, failed or nothing to read. The worker
  takes one video at a time, up to three a minute, and records each step, so a restart puts a
  running job back in the queue.
- A failed extraction (provider error, unreadable answer) is retried an hour later, then two;
  after three attempts it waits for **Retry failed**. A claim that cannot be evaluated is
  stored as unevaluable with its reason and never stops the video or the batch.
- Idempotent: a video is queued once; its claims are replaced as a whole when it is read again
  (**Read again**, or a new extractor version). Versions are stored on every claim
  (`claims-extract-1`) and evaluation (`claims-eval-1`): a new evaluator re-evaluates every
  claim without reading the videos again.
- **Pause** lets the video under way finish its step; **Cancel queued** stops the queue.
- Unfollowing a channel removes its videos' claims and jobs.

## Storage and code

Fork-owned tables, created on first use: `vi_claims`, `vi_evaluations`, `vi_jobs`,
`vi_series`, `vi_candles`; settings under `videoIntelligence`. No migration is needed and
nothing in the journal's schema changes.

- `packages/core/src/claims.ts`: evaluation, simulation, regime, Wilson intervals, Brier score,
  tallies and trade statistics.
- `lib/video-claims.ts`: the claim shape, the AI schema and its hand-checked reading, quote
  verification, timing and horizons, claims from a summary. `lib/video-intelligence.ts`: the
  page's payload types.
- `server/video-intelligence/`: `extract.ts` (AI extraction, long transcripts in parts),
  `market.ts` (instrument resolution, candles, evaluation), `worker.ts` (the background
  queue, started from `instrumentation-node.ts`), `analytics.ts` (groups), `store.ts`.
- `app/api/video-intelligence/**`, `app/video-intelligence/**`, `components/video-intelligence/*`.

## API

- `GET /api/video-intelligence?channel=&instrument=&direction=&kind=&status=&explicit=1&from=&to=`:
  settings, report, claims (up to 500) and jobs.
- `PUT /api/video-intelligence` `{ commissionBps, slippageBps, targetBufferBps }`.
- `POST /api/video-intelligence/actions` `{ action, videoId? }`: `start`, `pause`, `resume`,
  `cancel`, `retry`, `reprocess` (one video), `reevaluate`.
- `GET /api/video-intelligence/videos/{id}`: claims with evaluations, the job, the transcript
  and the stored candles each evaluation used.

## Limits

- Claims are only as good as the transcript: a video watched by Gemini (no captions) has no
  transcript, so its claims come from its summary, without quotes.
- Coverage depends on the enabled sources and how far back they keep candles (Yahoo keeps
  intraday candles for 60 days to two years; older claims get coarser candles).
- No order book: fills are from candles under the stated rules; intrabar order is unknown and
  resolved the careful way, flagged.
- The library is the videos you followed: channels you stopped following, and videos never
  stored, are not in it. Results describe that selection, not the analyst's whole record.

## Verification

`pnpm exec vitest run packages/core/tests/claims.test.ts apps/web/tests/video-intelligence.test.ts`
covers outcomes (target, invalidation, same-candle ambiguity, pending, expiry, late targets,
conditional triggers, close-based invalidation, look-ahead), simulated fills (gaps, buffers,
same-candle stops, costs, time exits, open trades), statistics, extraction with a fake AI
(quote verification, probabilities, summaries, long transcripts), the job queue (idempotency,
retries, resuming), unevaluable instruments, and the API.
