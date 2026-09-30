# Backtesting

**Backtesting** (sidebar) tests a setup on past candles before it risks money, in two ways:

- **Replay**: a manual (discretionary) backtest. The chart hides the future and reveals
  candles one at a time while you place orders; every trade is logged and summed up.
- **Strategy tester**: runs a Pine Script `strategy()` over a date range, as TradingView's
  strategy tester does.

Both use the market data sources you enabled (Settings → Market data); the keyless ones
(Binance, Bybit, OKX, Kraken, Coinbase, Nasdaq, Yahoo Finance) are enough. Backtest trades
live apart from your journal: they never enter the dashboard, reports or prop firm figures.

## Replay sessions

**New replay session**: the source (and its market, where it has several), the symbol, the
candle size, where the replay starts (in the journal's timezone), the starting balance, its
currency and the risk per trade. The chart opens on the start with some history before it.

### Replaying

- **Play** reveals candles at the chosen speed (0.5× to 16×, candles a second), each one
  drawn forming from open to close (through its low then high, or high then low for a down
  candle, an illustration of an order the candle cannot tell); **Next candle** (or the right
  arrow) reveals one; **+10** and **+100** skip ahead; **Skip to** runs to a date and time.
  Space plays and pauses. Candles are loaded ahead as the replay moves.
- The replay only moves forward: a trade already taken is never replayed differently.
  **Start the session over** (Settings tab) clears its trades and goes back to the start.
- **Pause on fills and exits** (on by default) stops playing, and skipping, when an order
  fills or a position closes, so you can react.
- The **chart timeframe** can be any size from the session's up: a larger candle is built
  from the session's revealed candles, so the one still forming never shows the future.
- The chart keeps your drawings, and the built-in indicators you choose in Settings.

### Orders

The order ticket places a **market** order (filled at the current close, plus slippage), a
**limit** (a buy below the price, a sell above it) or a **stop** (a buy above, a sell below:
a breakout entry), each with an optional **stop loss** and **take profit** (the 1R, 2R and 3R
buttons set a target from the stop's distance). With a stop, the **size comes from your
risk**: a share of the balance or an amount, divided by the stop's distance times the
contract multiplier, rounded down to the lot size; or type a quantity. One position at a
time. The open position's stop and target can be moved (**Stop to breakeven**), and it can be
closed at market. Pending orders can be cancelled.

### How orders fill

Each revealed candle is checked the way a broker would:

- A limit fills when the candle reaches its price, at the open instead if it opened past it
  (a better price); a stop fills when reached, at the open if it gapped past (a worse price),
  plus slippage.
- An open position leaves at its stop or target when a candle reaches one; a candle that
  opens past the stop exits at that open (slippage included), past the target at that open.
- **One candle reaching both the stop and the target** cannot say which came first. The
  session's rule decides: the stop by default (the careful assumption), or the target; the
  same applies to an entry and its stop inside one candle. Such trades are marked **candle
  rule** in the list and counted in the report.
- Commission is charged on every fill: an amount per fill plus a share of its value.
  Changing commission or slippage applies to fills from then on.

### Results

- **Trades**: every closed trade with its entry and exit, why it closed (stop, target, by
  hand), size, net result, R (the net result over the stop's distance at entry), MAE and MFE
  (its worst and best open result) and candles held, with a note of your own.
- **Report**: net profit and return, win rate, profit factor, average R, expectancy, average
  win and loss and their ratio, largest win and loss, maximum drawdown (money and share of
  the peak), streaks, commission, candles in a trade, the equity curve, and all, long and
  short trades side by side.
- **Notes**: what you are testing and what you learn.

The session saves as you go: the replay's position, the orders, the position, the trades,
drawings and notes.

## Strategy tester

Choose a source, symbol, candle size and range (up to 20,000 candles), and a strategy: one
of the examples (a moving average crossover; RSI mean reversion with a stop and a target),
a strategy you saved in the chart's Pine editor, or code typed in the box. **Run the
strategy** loads the candles, runs the script on a chart (its entries and exits drawn), and
shows its performance summary (the same report as replay, from its closed trades), buy and
hold over the same candles, and the list of trades with each one's run-up and drawdown.
Capital, sizing and commission are the script's own, set in its `strategy()` line.

## Storage and code

Sessions are one table, `backtest_sessions`, created on first use (`server/backtest/store.ts`);
a session's engine state is one JSON document checked on every save
(`lib/backtest-session.ts`). The fill engine and report are pure, in
`packages/core/src/backtest.ts`. The page is `app/backtest`, its parts
`components/backtest/*`, the chart's pure helpers `lib/backtest-replay.ts`, and the example
strategies `lib/backtest-strategies.ts`.

## API

- `GET /api/backtests` lists sessions with their results; `POST` creates one:
  `{ name, provider, dataset?, symbol, resolution, startAt, settings?, playbookId? }`.
- `GET /api/backtests/{id}`; `PATCH` saves any of `{ name, notes, cursorAt, settings, state,
drawings, playbookId }`; `DELETE` removes it.

## Verification

`pnpm exec vitest run packages/core/tests/backtest.test.ts apps/web/tests/backtest.test.ts
apps/web/tests/backtest-strategies.test.ts` covers fills, gaps and the same-candle rule,
sizing, commission, excursions, the report, the higher-timeframe view, dates across a
daylight saving change, saving through the API, and the example strategies trading.
