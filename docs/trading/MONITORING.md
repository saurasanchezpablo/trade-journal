# Monitoring, signals and paper trading

The background side of strategy research (`apps/web/src/server/strategy-research/`). Nothing
here places an order, holds exchange credentials or uses an account: Binance is read through
its public, keyless endpoints only.

## The worker

Started from `instrumentation-node.ts` (`JOURNAL_STRATEGY_RESEARCH=off` stops even the check)
and idle until **Start monitoring and paper trading** is pressed. Every 10 minutes:

1. **Download** the candles and funding that closed since the last download, when a new UTC
   day has started, every 6 hours otherwise, or after a failed download. Requests go through
   the journal's shared market transport, one at a time per host and spaced well under
   Binance's published limits (700 ms between futures requests: funding history allows 500
   requests in 5 minutes).
2. **Research** again when a report is missing, from another engine, catalog or evaluation
   version, computed with other costs, or a week old.
3. **Monitor**: record the day's signals (below).

A tick while one runs does nothing; each step records its error (shown on the page) and the
next success clears it. A restart resumes on the next tick: every step is idempotent.

## Signals

For every strategy whose research chose a configuration, that **frozen** configuration decides
on each closed day the same way the backtest does (`decisionsThrough` in core), with the same
held-weights state.

- One row per strategy and day (`UNIQUE (strategy_id, decision_time)`): running the monitor
  again, or after a restart, never records a day twice and never rewrites one.
- The first run records only the latest day: there is no paper history before monitoring.
- After a gap (the server was off), the missed days are recorded then, as **late** signals.
- **Stale data**: when an instrument's last closed day is before yesterday (UTC), the
  strategies that use it are skipped and the page says which data is behind.
- Each signal stores its weights, the previous weights, whether it changed, the reason in
  words and the inputs (the moving average, the trailing funding, and so on).

## Alerts

A changed signal of a candidate (not the benchmark) sends one notification through the
journal's alert delivery (kind **Strategy signals**, on the Alerts page, source
`strategy:<id>`, mutable). It is marked sent only once delivery returns; a failure is retried
on the next run, so an alert is neither lost nor sent twice. The text says it is a paper
signal and that no order is placed.

## Paper ledger

The paper ledger is computed, not stored: the recorded signals are replayed through the same
backtest accounting (`replaySignals`), from the first signal's execution.

- **Execution time**: a signal recorded within 30 minutes of the day's close executes at that
  open (the paper fill is the daily open, so up to 30 minutes of hindsight on the fill price,
  a stated approximation). Recorded later, it executes at the next day's open.
- On each day the position is the **most recent decision** among the signals executable by
  then, so a late older signal never overrides a newer one recorded in time.
- **Reset paper ledger** forgets every recorded signal; the ledger starts again from the next
  run.

The paper category is shown apart from every backtest category, with the warning that a few
weeks of results say almost nothing about a strategy.

## Tests

`apps/web/tests/strategy-research.test.ts` (against a fake of the three Binance endpoints):
closed candles only, malformed data refused, incremental download without duplicates, stale
detection, one signal per day however often the monitor runs, late signals after a restart,
one alert per change with retries, paper ledger equal to the replay, the API's validation, the
busy guard and error recording. `tests/strategy-research.live.test.ts` (`LIVE_RESEARCH=1`) runs
everything against the real endpoints.
