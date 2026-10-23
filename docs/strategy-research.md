# Strategy research

**Strategy research** (sidebar, a beta feature: switch it on under **Settings, Beta features**) tests a small catalog of trading strategies, chosen from the
published evidence, on Binance's daily history after costs, judges them against a standard
declared before the results, and can monitor and paper trade them. It never places an order and
needs no exchange account: market data comes from Binance's public, keyless endpoints.

Nothing on the page is investment advice. In the latest research run, none of the six candidate
strategies met the evidence standard; all are labelled experimental.

## Using it

1. **Download and run the research**: downloads the daily candles (BTC and ETH spot since 2017,
   the BTC perpetual and its funding since 2019; about a minute the first time) and evaluates
   every strategy. The **Strategies** tab lists the verdicts and the key numbers of each kind of
   evidence; a strategy's page shows everything.
2. **Start monitoring and paper trading** (optional): every day after the UTC close, each
   strategy's frozen configuration decides; the decision is recorded once, a change of position
   sends an alert (kind **Strategy signals** on the Alerts page), and the **Paper trading** tab
   replays the recorded signals at the next open. Stop it at any time; **Reset paper ledger**
   starts the ledger again.
3. **Cost assumptions** (on the page): commission for spot and perpetuals, slippage, and the
   cash rate (an assumption, 3% a year by default: idle capital earns it and every Sharpe
   ratio is measured against it). Run the research again after changing them.

## What the numbers mean

Results are kept in four categories that are never added together:

- **In-sample**: the best configuration of a small grid, chosen and measured on the same days.
  Optimistic by construction.
- **Walk-forward (out of sample)**: every 90 days, the configuration that did best over the
  previous two years trades the next 90.
- **Holdout**: the in-sample choice, frozen, from 1 July 2025, days no choice ever saw.
- **Paper (live)**: the monitor's recorded signals since monitoring started.

Each is compared with BTC buy and hold over exactly the same days (cash for the market-neutral
carry). The verdicts follow the pre-declared standard: Deflated Sharpe ratio, probability of
backtest overfitting, a bootstrap interval, the benchmark and the holdout.

## Documents

In [docs/trading/](trading/):

- [IMPLEMENTATION_PLAN.md](trading/IMPLEMENTATION_PLAN.md): the audit and the plan.
- [RESEARCH_REVIEW.md](trading/RESEARCH_REVIEW.md), [SOURCES.md](trading/SOURCES.md): what the
  evidence says, family by family, and every source with how it was read.
- [STRATEGY_CATALOG.md](trading/STRATEGY_CATALOG.md): the ranking, the selection, and the
  results with their interpretation.
- [BACKTESTING.md](trading/BACKTESTING.md), [VALIDATION.md](trading/VALIDATION.md),
  [MONITORING.md](trading/MONITORING.md): the rules, formulas and background behaviour.
- [RESEARCH_LIMITATIONS.md](trading/RESEARCH_LIMITATIONS.md): what these results cannot show.
- [FINAL_REPORT.md](trading/FINAL_REPORT.md): the summary.

## Settings

`JOURNAL_STRATEGY_RESEARCH=off` stops the background worker entirely (it is idle until
monitoring is started anyway). `LIVE_RESEARCH=1 pnpm exec vitest run
apps/web/tests/strategy-research.live.test.ts` runs the whole research against the real
endpoints (with `RESEARCH_DATA_DIR` to keep the scratch journal, never `apps/web/data/`).
`python3 scripts/research/reference.py` regenerates the independent reference results the core
tests compare against.
