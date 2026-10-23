# Backtesting engine (strategy research)

The engine behind the **Strategy research** page: `packages/core/src/research/backtest.ts`
(accounting), `metrics.ts` (performance), `strategies.ts` (the rules) and `catalog.ts` (what
is tested). It is pure: no IO, no clock, no randomness, so the same inputs always give the same
result. This page states every rule the code follows; `scripts/research/reference.py`
re-implements them independently in numpy/scipy, and the tests require both to agree to
1e-12 on every daily return.

## Data

- Daily bars (UTC midnight to midnight) from Binance's public endpoints: spot BTCUSDT and
  ETHUSDT (`data-api.binance.vision/api/v3/klines`, from August 2017) and the USD-M BTCUSDT
  perpetual (`fapi.binance.com/fapi/v1/klines`, from September 2019), plus the perpetual's
  funding history (`fapi.binance.com/fapi/v1/fundingRate`, every settlement, normally 8-hourly).
- Only closed candles are stored (a candle whose close time is still in the future is
  dropped). Candles with non-positive prices, a high below the open or close, a low above them,
  or a timestamp not on a UTC midnight are refused, and nothing from that response is stored.
  Funding rates above 5% per period in absolute value are refused the same way.
- Instruments are aligned on the days **every** instrument a strategy trades has a bar for; a
  day missing from one is skipped for all.

## Timing (no look-ahead)

- On day _t_ the strategy is handed a view that ends at day _t_: each instrument's bars up to
  and including _t_, the funding events up to the close of _t_ (`time + 1 day`), and the
  weights it currently holds. It returns target weights (fractions of equity).
- The decision executes at the **open of day t + 1**. The day's return runs from that open to
  the open of day _t + 2_. The last two days of data can be decided on (by the live monitor)
  but not yet accounted.
- Tests: a strategy never sees a bar after the day it decides; changing prices after a date
  never changes a decision before it; a decision taken on a jump at day _t_'s close earns
  none of that jump.

## Accounting, per day

```
moves_i   = open_i[t+2] / open_i[t+1] − 1
gross     = Σ_i  w_i · moves_i
funding   = − Σ_perp  w_perp · Σ (funding rates with time in (open[t+1], open[t+2]])
cash      = max(0, 1 − Σ|w_i|) · cashRate / 365
costs     = Σ_i |w_i − drifted_i| · (feeBps_kind(i) + slippageBps_kind(i)) / 10 000
ret       = gross + funding + cash − costs
drifted_i (for the next day) = w_i · (1 + moves_i) / (1 + ret)
```

- A long perpetual pays a positive funding rate, a short receives it.
- **Drift**: positions move with prices between decisions, so holding a constant weight still
  trades back to it (and pays for it). Turnover is `Σ|target − drifted|`.
- Gross exposure `Σ|w|` is capped at the strategy's `maxGross` (1 for long-only, 2 for the
  hedged carry book); larger requests are scaled down proportionally. Non-finite weights are
  treated as 0.
- Costs, defaults (settings on the page): spot 10 bp, perpetual 5 bp commission (Binance taker,
  regular account), 5 bp slippage per side for both. The research reviews (SOURCES.md, cost
  model) measured BTC and ETH spreads far below that, so 5 bp is deliberately conservative.
- **Cash rate**, default 3% a year: an assumption, not a measured series (about the 2019 to
  2025 average 3-month US Treasury bill yield). Idle capital earns it, and it is the hurdle of
  every Sharpe ratio, so a strategy that sits in cash has a Sharpe ratio of about zero, not a
  flattering positive one.

## Margin (the carry book)

The carry strategy holds `a = 1 / (1 + 1/leverage)` of equity long spot and the same notional
short the perpetual (leverage 2, so `a = 2/3` and margin is half the short's notional). The
engine assumes margin is topped up daily from the spot leg (daily rebalancing). It does not
model liquidation; instead every report shows the **worst intraday rise of the perpetual on a
day a short was held** against the margin, and how many days used more than half of it.

## Metrics (`metrics.ts`)

- Simple daily returns, annualized over 365 days.
- CAGR: `growth^(365/days) − 1`. Volatility: sample standard deviation × √365.
- Sharpe: mean of daily excess returns (over the cash rate) / their sample standard deviation
  × √365. Sortino: the same mean / root mean square of the negative excess returns × √365.
  Null when the dispersion is negligible (below 1e-12), rather than an absurd number.
- Drawdown on the compounded curve; longest drawdown in days from a peak to its recovery (or
  the end). Calmar: CAGR / max drawdown.
- VaR 95%: minus the 5% quantile of daily returns (numpy's linear interpolation). CVaR 95%:
  minus the mean of the returns at or below it.
- Skewness and excess kurtosis with population moments (scipy's defaults).
- Trades: a run of consecutive days with a position in the same net direction. Win rate,
  average win and loss, profit factor and expectancy are over those runs.
- Relative: beta, correlation, annualized excess over the benchmark, tracking error and
  information ratio, on the days both have.

## Versions

`RESEARCH_ENGINE_VERSION`, `CATALOG_VERSION` and `EVALUATION_VERSION` are stored with every
report; a report from another version (or other costs) is recomputed by the worker.
