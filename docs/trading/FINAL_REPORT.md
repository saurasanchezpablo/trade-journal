# Strategy research: final report

Research run on Binance daily data through 22 October 2026 (the last closed day at the time),
costs of 10 bp (spot) and 5 bp (perpetual) commission plus 5 bp slippage per side, and a 3%
cash rate. Every figure below is after costs and comes from that run; the full tables are in
[STRATEGY_CATALOG.md](STRATEGY_CATALOG.md), section 4.

## Outcome

**None of the six candidate strategies meets the evidence standard.** All are labelled
**experimental**: positive out of sample, but each fails at least one pre-declared criterion.
None was rejected (all beat cash in the walk-forward test). The module is built as the spec
requires for this case: research, validation and monitoring infrastructure, with honest labels.

| Strategy                            | Walk-forward Sharpe (BTC over the same days) | Walk-forward max drawdown (BTC) | Holdout return (cash) | Fails                                   |
| ----------------------------------- | -------------------------------------------- | ------------------------------- | --------------------- | --------------------------------------- |
| BTC time-series momentum            | 0.95 (0.97)                                  | 66.5% (76.6%)                   | 9.1% (4.0%)           | PBO 0.74, bootstrap interval, benchmark |
| BTC moving-average trend            | 1.16 (0.97)                                  | 54.0% (76.6%)                   | 11.6% (4.0%)          | PBO 0.86                                |
| BTC trend with volatility targeting | 1.15 (0.97)                                  | 32.7% (76.6%)                   | 9.7% (4.0%)           | PBO 0.27 (limit 0.25)                   |
| BTC short-term mean reversion       | 0.49 (0.97)                                  | 33.2% (76.6%)                   | 13.6% (4.0%)          | DSR 0.764, PBO, interval, benchmark     |
| BTC/ETH relative strength           | 0.85 (0.97)                                  | 66.2% (76.6%)                   | 39.0% (4.0%)          | PBO 0.89, interval, benchmark           |
| BTC funding carry                   | 3.28 (judged against cash)                   | 0.2%                            | 4.0% (4.0%)           | Holdout: never traded                   |

BTC buy and hold, the benchmark, returned -21.6% over the holdout (1 July 2025 to 21 October 2026) with a 53% drawdown, so every strategy that spent time in cash looks good there; the
holdout bootstrap intervals all include zero.

## What the evidence supports

- **Trend filters on BTC reduced drawdowns** out of sample, as the literature leads one to
  expect, with risk-adjusted returns close to or somewhat above buy and hold's. Which window to
  use is not reliably chosen from the data (high PBO, configurations changing across
  walk-forward windows). Trend with volatility targeting came closest to the standard; its
  higher Sharpe ratio comes from lower volatility, not higher return.
- **Daily mean reversion** showed no robust edge, as the reviewed evidence predicted.
- **The funding carry** earned about 1.5 points a year over cash in the walk-forward (4.5% a
  year against 3%), with very low measured volatility that daily bookkeeping understates. With
  its chosen 15% entry threshold it never traded in the holdout.

## What was built

- A pure, deterministic backtesting and validation engine in `packages/core/src/research/`:
  next-open execution, commission, slippage and drift-aware turnover, perpetual funding, a cash
  rate, gross exposure caps; performance, trading and relative metrics; Probabilistic and
  Deflated Sharpe ratios, PBO by CSCV, a stationary bootstrap, walk-forward, regime labels;
  the evidence standard. Checked against an independent numpy/scipy implementation to 1e-12.
- Server: Binance data adapters with provenance and incremental updates, fork-owned storage,
  the research runner, a daily monitor with stale-data checks, deduplicated signals and
  alerts, a paper ledger replayed from recorded signals, and a resumable background worker.
- UI: the Research page (strategies, paper trading, method, data) and a page per strategy
  (results by category with charts, selection bias, regimes, signals and paper), in English and
  Spanish.
- Tests: 52 core tests (engine against the reference, look-ahead, costs, funding, drift,
  determinism, DSR and PBO behaviour on noise, categories, the standard, paper replay) and 14
  app tests (data validation, incremental download, dedup, late signals, alert retries, stale
  data, paper ledger, API validation, busy guard), plus a live test against the real endpoints.

## Safety

No order can be placed: there is no order code, no exchange account and no credential. Market
data is public and keyless, requested within published rate limits. No secret is stored, logged
or sent.

## Limits and next steps

The limits are in [RESEARCH_LIMITATIONS.md](RESEARCH_LIMITATIONS.md): one venue, two assets,
daily bars, about seven years before a 16-month holdout, constant cost and cash-rate
assumptions, no liquidation model. Evidence that would change the verdicts: a longer holdout
(the paper ledger accumulates one), the same rules on other venues and assets, a time-varying
cash rate, and an intraday check of the carry's margin and basis risk.
