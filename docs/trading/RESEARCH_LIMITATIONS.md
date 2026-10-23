# Research limitations

What the evidence and our own tests cannot tell us. Read this before drawing any conclusion from
[RESEARCH_REVIEW.md](RESEARCH_REVIEW.md) or the results in
[STRATEGY_CATALOG.md](STRATEGY_CATALOG.md#4-results). Source ids resolve in
[SOURCES.md](SOURCES.md). Nothing in these documents is advice or a forecast.

---

## 1. Limits of the evidence

### 1.1 Short crypto history, dominated by 2017 to 2022

- Most crypto studies use samples that start between 2010 and 2014 and end between 2017 and 2023:
  T7 (BTC 2011 to 2018), T8 (2010 to 2017), T11 (2013 to 2023), T14 (2014 to 2018), C2 (2020 to
  2022), C1 (2020 to 2024). They overlap heavily, so agreement between them is less independent
  than it looks.
- These samples are dominated by a few bubbles and crashes (2017, 2018, 2021, 2022). Strategies
  that cut exposure in drawdowns look good mainly because of those few events.
- Early data is thin and illiquid (R1 recommends BTC from 2014 and ETH from 2016). R1 expects the
  trend evidence to weaken as the market matures, and T9 already finds no out-of-sample BTC
  predictability in its test window.

### 1.2 Overlapping samples and overlapping labels

- Multi-day signals and holding periods overlap, so daily observations are not independent. L3's
  binomial p-values (as small as 2e-297) are an example of the resulting overstatement (R3).
- Overlap shrinks the effective sample: daily BTC since 2017 is about 3,500 observations (R3), far
  fewer independent ones.

### 1.3 Structural breaks

- Crypto and equity correlation jumped after 2020 [G4, G5]; pre-2020 results may not describe the
  current dependence structure.
- Market structure changed: Binance's leverage cut in July 2021 reduced carry (C2); portfolio
  margin in April 2022 compressed perpetual deviations (C1); funding intervals and caps can change
  (E1). A 2024 spot-ETF break is plausible but unverified by any source read (R1).
- Volatility-managed equity strategies show multiple structural breaks (V2), and stat-arb profits
  decay after publication (M8, L2).

### 1.4 Publication and selection bias

- Studies that find an effect are more likely to be published; rule searches pick their best rule
  (T11's best lookback pair, M10's "optimal" threshold, T13's hyper-optimised windows). The
  multiple-testing literature (X1, X2, X6) exists because of this.
- Several sources contain internal inconsistencies found by the reviews: C2 (Sharpe 12.8 against
  11.468), M10 (start dates, total against annualised returns), M11 (overlay returns), M12 (pair
  set, hit rate), X2 (a combination count). Published numbers should not be reused without
  recomputation.

### 1.5 Reading depth

- Many key claims rest on abstracts, third-party summaries or search extracts, not on the papers'
  tables: for example T8 and T12 (abstract and summary), T9 and T10 (abstract), C3 (abstract and
  an intro excerpt), V3, V4 and V13 (abstract), and everything marked SN in
  [SOURCES.md](SOURCES.md). Numbers from these are the authors' or a summariser's reports, not
  verified values.
- Several citations (journal, volume, author order) are marked unverified in the registry.
- Some sources are working papers or vendor material with a commercial interest (C8 Ethena, C9 CF
  Benchmarks, C11 BitMEX, T12 with a vendor co-author per R4). R4 recommends treating their
  headline Sharpe ratios as upper bounds.

### 1.6 Gaps the reviews could not fill

- No peer-reviewed study verified by R1 on plain volatility targeting of BTC buy-and-hold.
- No verified source showing HMM-regime timing of BTC profitable after costs out of sample.
- No rigorous study of the long-run cost of tail hedging with BTC puts (R4).
- No peer-reviewed out-of-sample test of on-chain signals with point-in-time data (R2).
- Liquidation, auto-deleveraging and stablecoin-depeg risks were not quantified from primary
  sources (R2).
- Coinbase Institutional, Glassnode and CME research with strategy-survival evidence was not
  located (R4).

---

## 2. Limits of our own tests

These apply to the results in [STRATEGY_CATALOG.md](STRATEGY_CATALOG.md#4-results) (engine
`research-engine-1`, catalog `catalog-1`, evaluation `evaluation-1`).

### 2.1 Data

- **Daily bars only.** Decisions are taken on the daily close and nothing inside the day is seen:
  not intraday drawdowns, not stop or liquidation paths, not the basis between spot and perpetual
  within a day. Microstructure, options and intraday ideas are out of scope (see the catalog).
- **Single venue: Binance.** Spot BTCUSDT and ETHUSDT and the BTCUSDT USD-M perpetual. Results can
  differ on other venues (prices, outages, funding: C1 reports a Binance-Bybit funding
  correlation of 0.74). Venue failure risk (C10) is not modelled.
- **BTC and ETH only.** The rotation has two assets; there is no cross-sectional universe, so
  nothing here speaks to altcoins.
- **Quoted in USDT.** All results are in USDT, which carries its own stablecoin risk (R2), not
  modelled.
- **UTC daily bars.** Crypto trades 24/7 with no official close; the choice of close time and
  rebalancing day changes results (T11). Only one convention was tested.
- **History.** Spot from 2017-08-17 and the perpetual from late 2019; after warm-up, the in-sample
  period starts on 2018-08-19 (carry 2019-09-24). That is about seven years for spot and six for
  the carry, containing two large bear markets and a handful of independent trend episodes.

### 2.2 Execution and costs

- **Fill at the next open.** Signals from day t's close fill at day t+1's open, with no partial
  fills, queue or gap modelling beyond that.
- **Constant costs.** 10 bp fee on spot, 5 bp on the perpetual, plus 5 bp slippage per side on
  both, every day. Real costs vary with fee tier, BNB discounts, region (E2, E6) and stress: R4
  documents liquidity holes (E14) and spreads up to 13.6 bp on an otherwise one-tick market (O3).
  The 5 bp slippage is well above R4's measured normal spreads, but a constant cannot represent
  stress days. Only this one cost model was run; R1's stress cases (15, 25 and 50 bp per side)
  were not.
- **Daily rebalancing assumed.** Positions drift with prices and are traded back to the target
  weight every day, paying the stated costs on the difference. R1 and T11 discuss multi-day
  holds, which were not tested.

### 2.3 The cash rate

- Uninvested cash earns a constant 3% a year, which is also the hurdle of every Sharpe ratio. This
  is an assumption, not a measured series. R2 notes that T-bills averaged about 0.05% a year in
  2020 to 2022 (per C2) and were several percent in 2023: a constant 3% overstates the cash return
  in the early years and understates it in the high-rate years.
- This matters most for the carry trade, whose excess over cash is small (about 1.5 points a year
  in the walk-forward), and for strategies that sit in cash much of the time (mean reversion at
  14% to 18% exposure), whose returns are partly the assumed cash yield.

### 2.4 Margin and liquidation

- The carry book holds a short perpetual at 2x leverage (margin of half its notional). The backtest
  assumes the margin is topped up daily from the spot leg's gain; there is no liquidation,
  auto-deleveraging, transfer delay or liquidation penalty. A stress indicator reports only the
  worst intraday rise of the perpetual against the short on a day it was held (21.4% in-sample,
  12.7% walk-forward, with no day using more than half the margin). R2 recommended explicit
  liquidation counting for several margin levels; not done.
- Funding is charged at each recorded funding event, on the position held, which follows R4's
  recommendation; but daily bookkeeping cannot see a position opened or closed around a funding
  time within the day.

### 2.5 Validation design

- **The holdout was chosen with general knowledge of the period.** The boundary (2025-07-01) and
  the catalog were set in October 2026 by people who knew, in broad terms, how crypto markets
  behaved over 2025 and 2026. The holdout is untouched by parameter selection, but not blind in
  the strict sense.
- **The holdout is short and one-sided.** 478 days, during which BTC buy-and-hold lost 21.6% with
  a 53% drawdown and there were no days in the "uptrend-volatile" regime. Any strategy that holds
  cash part of the time beats buy-and-hold in such a window. Every holdout bootstrap interval of
  the Sharpe ratio includes zero.
- **Few independent years.** The walk-forward covers 19 windows of 90 days (about 4.7 years; the
  carry 15 windows, about 3.7 years), each chosen on the previous 730 days. With so few
  independent trend episodes, bootstrap intervals are wide (for example 0.18 to 2.18 for the SMA
  trend's walk-forward Sharpe).
- **Walk-forward coverage.** The 19 windows end on 2025-04-23; the days from then to the holdout
  are not in any walk-forward window.
- **Selection is deflated per strategy, not across the catalog.** The Deflated Sharpe ratio and
  PBO count the configurations inside each strategy's grid (3 to 9), not the 37 configurations
  across all six candidates, nor ideas considered and dropped. X1 and R3 say the trial count should
  include everything tried.
- **Thresholds.** The PBO limit of 0.25 is looser than the 0.05 the PBO paper suggests (X2). Holm
  or BHY adjustments (X6), White's Reality Check and the Ledoit-Wolf test (X4) were not applied.
- **Missing benchmarks.** R1 recommended comparing trend rules with the sign of the
  expanding-window mean return (T3's null), a volatility-matched buy-and-hold, and a random-entry
  strategy with the same time in market; R3 recommended the opposite-sign twin for mean reversion.
  None was run, so the trend results cannot separate timing skill from simply holding less BTC.
- **Annualisation.** Sharpe ratios are annualised with the square root of 365 without the
  autocorrelation correction X7 describes; for strategies holding positions for days, this can
  misstate the annual figure.
- **Regime labels.** The four regimes (BTC against its 200-day average, 30-day volatility against
  its running median) are one simple choice, computed from past data only; other definitions would
  give different breakdowns.

### 2.6 Data licences

- **Binance Vision bulk data** is licensed CC BY-NC-SA 4.0 with terms that allow personal,
  non-production research backtesting but prohibit live proprietary trading execution, automated
  commercial order generation, paid signals and commercial products [E5]. The REST API terms for
  Binance and Bybit were not reviewed (R2, R4).
- **Coin Metrics community data** is CC BY-NC 4.0 [E7]; **DefiLlama** grants a personal,
  non-commercial licence [E8]; the **Fear and Greed index** requires attribution next to the data
  [E9].
- **Deribit**: a 2021 terms update (seen only as a search extract) restricted market data and
  derived data to personal use; current terms not verified [E11].
- R4's implication for a self-hosted journal: cache data per user for personal use, do not ship
  bundled datasets, and do not publish derived series without checking current terms.

---

## 3. What would strengthen the evidence

Not commitments, just the gaps above restated as tests:

1. Run R1's null benchmarks (mean-sign, volatility-matched and random-entry) next to every trend
   result.
2. Re-run every strategy at R1's stress costs and with a time-varying cash rate.
3. Count trials across the whole catalog in the Deflated Sharpe ratio, and report Holm/BHY-adjusted
   p-values.
4. Model margin and liquidation explicitly for the carry at several margin levels, and replicate it
   on a second venue.
5. Keep recording signals forward (the paper ledger): only data after the catalog was frozen is a
   clean test, and it accumulates slowly.
