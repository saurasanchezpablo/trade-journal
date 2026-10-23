# Research review: systematic strategies for BTC and liquid crypto

This is the evidence review behind the strategy research module (`packages/core/src/research/`).
It summarises what the literature and public documentation say, family by family, and whether
each idea can be tested with free daily data on this platform. It is research, not advice: nothing
here says that any strategy will make money in the future.

Companion documents:

- [SOURCES.md](SOURCES.md): every source cited here by id (T1, C2, X1, ...), with its full
  reference, type and how it was read.
- [STRATEGY_CATALOG.md](STRATEGY_CATALOG.md): the ranked list of candidate ideas, the seven
  strategies implemented in `catalog.ts`, and their measured results.
- [RESEARCH_LIMITATIONS.md](RESEARCH_LIMITATIONS.md): the limits of the evidence and of our own
  tests.

Reviewed: 2026-10-22 (sources), written up 2026-10-23.

---

## 1. Method

### 1.1 How the evidence was gathered

Four desk reviews were run in parallel on 2026-10-22, each on a slice of the field:

| Review | Scope                                                                             | Families covered here |
| ------ | --------------------------------------------------------------------------------- | --------------------- |
| R1     | Trend following, time-series momentum, volatility targeting, regimes              | A, E, G               |
| R2     | Crypto-native carry (funding, basis), on-chain and alternative data, data sources | C, H, I               |
| R3     | Mean reversion and stat-arb, machine learning, validation formulas                | B, F, validation      |
| R4     | Microstructure, volatility and options, practical costs, feasibility              | D, E, costs           |

Each reviewer searched the web, downloaded papers where possible, read official documentation,
and in R2 and R4 also called public, keyless endpoints to check history depth and limits. Each
kept a source registry stating, per source, what was actually read. Numbers were only to be
quoted if they were seen in the source; anything else was marked unverified. This document merges
the four registries without adding sources: if a paper is not in [SOURCES.md](SOURCES.md), it was
not used.

### 1.2 Reading depth

Every source in [SOURCES.md](SOURCES.md) carries one reading-depth code:

| Code  | Meaning                                                                      |
| ----- | ---------------------------------------------------------------------------- |
| FT    | Full text, or the relevant sections of it, read                              |
| WP-FT | Full text of a working-paper version read (the published version may differ) |
| ABS   | Abstract or publisher landing page only                                      |
| SUM   | A third-party summary read (named in the registry)                           |
| SN    | Only a search-engine extract; the weakest level                              |
| DOC   | Official documentation read                                                  |
| LIVE  | Endpoint called live on 2026-10-22                                           |
| NR    | Not read; listed for completeness and not used as evidence                   |

A claim resting on ABS, SUM or SN is marked as such where it appears below. Numbers from ABS or
SUM sources are second-hand reports of the paper, not verified against its tables.

### 1.3 Source-quality hierarchy

Claims were weighed by the kind of source, from strongest to weakest:

1. Peer-reviewed, with an out-of-sample test (held-out period, walk-forward, or real-time design).
2. Peer-reviewed, in-sample only (full-sample sorts or regressions, parameters chosen on the
   evaluation data).
3. Working paper or preprint (not yet peer reviewed, or venue unverified).
4. Practitioner, vendor or press material (often one year, in-sample, no costs, or with a
   commercial interest).
5. Documentation (exchange and data-provider docs): authoritative for mechanics, fees and
   endpoints, silent on whether a strategy works.

Own measurements (R4's probes, R2's live calls, and our own backtest) are a separate category:
reproducible, but not peer reviewed.

A claim is only as strong as the weaker of its source quality and its reading depth: a
peer-reviewed paper read at abstract level supports "the authors report X", not "X is true".

### 1.4 Labels used per family

- **Established**: several independent sources agree, at least one read in full, preferably with
  out-of-sample evidence.
- **Preliminary**: one study, a working paper, or in-sample results only.
- **Contested**: credible sources disagree.
- **Unsupported**: no credible evidence found, or the evidence found points the other way.
- **Testable here**: whether the idea can be tested with free daily data the platform already
  downloads (Binance spot and USD-M daily klines and funding history), and whether it was.

---

## 2. Family A: trend following and momentum

**Established (cross-asset, mostly futures):**

- Time-series momentum (TSMOM) payoffs are convex: it earns most in extreme markets [T1 FT],
  and the same "smile" shows in annual data from 1880 to 2016 [T4 FT]. T1 reports a diversified
  58-futures portfolio with Sharpe above 1, gross of costs, with an out-of-sample check on
  1966 to 1985.
- The same strategies lose sharply at fast reversals: T1 reports losses from March to May 2009,
  and T5 [ABS] finds momentum crashes cluster in "panic" states, after declines and while
  volatility is high, as markets rebound. This is the main failure mode for any BTC trend rule.

**Contested:**

- Whether TSMOM is real predictability or an artefact of volatility scaling and pooling. T2 [SUM]
  reports TSMOM alpha of 1.27% a month with volatility scaling and 0.41% without, and an advantage
  that vanishes in 2009 to 2013. T3 [ABS + SUM] finds little asset-by-asset predictability in or
  out of sample, and a rule based on the sign of the historical mean does about as well. For a
  single asset like BTC, R1's reading is that a trend rule may mostly harvest BTC's large drift
  while cutting exposure in drawdowns, rather than exploit autocorrelation.
- Cross-sectional crypto momentum. T14 [WP-FT] reports 1- to 4-week long-short quintile returns of
  2.7%, 3.3%, 4.1% and 2.5% a week, gross and in-sample, concentrated in coins above median size.
  M1 [ABS] finds the previous day's return reverses in a 3,600-coin cross-section (illiquidity),
  with daily momentum only in the largest coins. T11 [WP-FT] finds cross-sectional momentum weak
  after costs, with 5 of 21 portfolios liquidated. T16 [FT, partial] finds equal-weighted momentum
  in the top 30 coins insignificant because of one -255% weekly crash in the short leg (December
  2020); volatility scaling raised payoffs but did not change the tails. R1 also notes that T16
  cites earlier studies finding no or negative momentum, which were not opened.

**Reasonably supported in crypto, with short, overlapping samples (mostly 2013 to 2022):**

- Short-horizon continuation in BTC at weekly frequency [T7 WP-FT]: weekly lags 1 to 3 remain
  significant with bootstrapped t-statistics (2.17, 2.73, 2.47). At daily frequency the evidence
  is weaker: the lag-1 coefficient has a regular t of 2.96 but a bootstrapped t of only 1.22
  (R1's reading of T7's Table 14). R3 quotes T7's in-sample statement that a one-standard-deviation
  daily return predicts +0.33% the next day without the bootstrap caveat; the two reports agree on
  the number but R1's reading is the more cautious one and is the one adopted here.
- Price-to-moving-average rules on BTC [T8, ABS + SUM]: per a third-party summary of the 2018
  working paper, gross Sharpe ratios of 2.6 (5-day SMA) to 2.2 (100-day) against 2.0 for
  buy-and-hold over 2010 to 2017, with maximum drawdowns of about -66% to -70% against -89.5%. The
  rules lowered drawdowns but did not remove them. The published abstract states in- and
  out-of-sample predictability.
- Large rule searches with data-snooping controls: T9 [ABS] finds technical rules profitable above
  typical costs overall but **no out-of-sample predictability for Bitcoin specifically**; T10
  [ABS] (75,360 rules, costs, multiple-testing selection) reports out-of-sample outperformance
  "especially on a risk-return basis".
- Long-only trend timing of the crypto market beats buy-and-hold mostly by avoiding downside, not
  by shorting [T11 WP-FT]: best pair 28-day lookback, 5-day hold, Sharpe 1.51 against 0.84, at 15
  bp costs with daily mark-to-market. The best pair was chosen by regression on the same sample.
  Shorting the market after declines lost in most cases.

**Preliminary:**

- Donchian-breakout ensemble with volatility sizing on BTC and a rotating top-20 altcoin universe
  [T12, ABS + SUM; also read at ABS level by R4]: Sharpe above 1.5 and 10.8% annual alpha against
  BTC, net of fees. A working paper with a vendor co-author (R4); BTC-only results were not seen.
  R1 values it as a fully specified rule published in 2025, which makes data after its sample a
  clean out-of-sample test.
- CTREND, an ML-aggregated trend factor across 3,000+ coins [T17 ABS]: reported to survive costs
  and to hold in large, liquid coins. Not a BTC/ETH timing rule.
- T13 [FT] is kept as a cautionary example: hourly SMA/EMA crossovers optimised with negligible
  costs, a headline 255% walk-forward annual return, and the authors' own finding that optimal
  windows wander between 200 and 1,000 hours.

**Unsupported or weak:**

- Long/short trend on BTC: short legs have historically been the losing side [T11, T16].
- Any single "best" lookback: the literature's best windows were chosen in-sample (T11, T13).

**Testable here: yes.** Daily closes are enough for TSMOM, SMA filters, Donchian ensembles and a
two-asset BTC/ETH rotation. Implemented: `btc-tsmom`, `btc-sma-trend`, `btc-eth-rotation`. Not
implemented: the T12 Donchian ensemble and R1's benchmark of the sign of the expanding-window mean
(T3's null). A cross-sectional universe needs survivorship-free coin lists and is out of scope.

---

## 3. Family B: mean reversion and statistical arbitrage

**Established:**

- The sign of short-horizon predictability depends on liquidity and horizon. Large, liquid coins
  show momentum at 1 to 4 weeks [T14, T7]; daily and weekly reversal sits in small, illiquid coins
  [M1 ABS, M2 ABS, M3 WP-FT]. In M3 (fixed costs of 30 bp long and 40 bp short), equal-weighted
  reversal earns 1.68% a day net, which R3 reads as a microstructure warning sign, while "none of
  the [value-weighted] strategies generate positive and statistically significant returns" after
  costs. For BTC and ETH alone, R3's prior is no exploitable daily reversal.
- Short-term reversal behaves like a liquidity-provision premium that rises with volatility: in
  equities with the VIX [M4 WP-FT], and in crypto cross-sectionally, where reversal profits are
  larger in smaller, more volatile, less liquid pairs [M3]. The crypto evidence is cross-sectional,
  not BTC time-series.
- Cross-exchange price gaps were large before 2018 and became hard to exploit afterwards: D10
  [secondary summaries only] documents a US-Korea gap near 40% for several days around the turn of
  2018; M13 [WP-FT, partial] finds opportunities "decreased greatly from April 2018 onward".

**Preliminary:**

- Hourly BTC-anchored cointegration and copula pairs: M10 [FT, preprint] reports Sharpe 0.97 on
  Binance perps 2021 to 2023 after 0.04% taker fees, with the entry threshold chosen on the same
  sample; M11 [FT] on a similar universe and period finds market-neutral variants negative net at
  every threshold and at costs down to 0.04% round trip.
- Equity stat-arb decays: M8 [WP-FT] reports PCA stat-arb Sharpe 1.44 over 1997 to 2007 but 0.9
  over 2003 to 2007; L2 [ABS] reports ML stat-arb profits declining in recent years.

**Contested:**

- Whether BTC daily returns mean-revert or trend: T7 points to momentum (in-sample, 2011 to 2018);
  M5 [ABS] finds larger next-day moves after overreaction days, an unprofitable contrarian
  strategy, and a momentum version "not statistically different from the random ones".
- Which pairs method works in crypto: M9 [ABS] finds everything underperforms, with daily distance
  pairs at -0.07% a month against 11.61% a month at 5 minutes; M10 and M11 disagree at hourly
  frequency.

**Unsupported:**

- Stable daily BTC-ETH cointegration: no study located documents it. M12 [FT, partial] claims a
  dynamic analysis including BTC-ETH but reports no stability statistics, models no costs and is
  internally inconsistent; it is kept as a cautionary example.
- Daily crypto pairs trading profitable net of costs (M9).

**Testable here: partly.** Time-series reversal, volatility-conditioned reversal and overreaction
rules (R3's MR1, MR2, MR6) and the BTC-ETH spread rules (MR3, MR4) need only daily OHLCV for two
assets, though spread rules need a short leg (perpetuals, with funding). Implemented: one
long-only variant, `btc-mean-reversion`, as the catalog's required mean-reversion candidate; its
rule differs from R3's specs (see the catalog). Not testable: weekly cross-sectional reversal
without a point-in-time universe, and cross-exchange arbitrage, which needs synchronous intraday
multi-venue data.

---

## 4. Family C: crypto-native carry (funding and basis)

**Established:**

- Funding mechanics are documented and stable in form [E1 DOC, E6 DOC]: on Binance and Bybit
  linear perpetuals, funding is a premium term plus a clamped interest term of 0.03% a day (0.01%
  per 8 hours), capped per contract; only positions open at the funding time pay or receive, and
  Binance charges no fee on funding. Intervals can change (some contracts run 1h or 4h).
- The gross perpetual carry (long spot, short perpetual) was large and positive on average on
  Binance from 2020 to 2024, before costs and margin. C2 [FT, draft v1.0]: BTC USDT-margined carry
  21.84% a year, volatility 1.90%, Sharpe 11.468 over August 2020 to June 2022, with no costs, no
  margin and a 0% risk-free rate (the draft's introduction says 12.8, an internal inconsistency);
  median funding 0.01% per period, "about 11% per year". C1 [FT, working paper] reports always-on
  carry at BTC Sharpe 2.24 and 10.18% a year, ETH 2.66 and 13.22%, and BNB -0.66 and -5.14% with a
  -33.61% drawdown (zero-fee tier, January 2020 to March 2024). C3 [ABS; R4 also read an intro
  excerpt] reports BTC/ETH carry averaging above 10% a year and reaching up to 60%.
- Carry is time-varying and collapses in deleveraging episodes. C1's decomposition gives a BTC
  funding contribution of 19.63% (2020), 30.05% (2021), 4.09% (2022), 5.46% (2023) and 18.15%
  (2024, partial). C7 [FT, practitioner] records Binance funding at -0.042% on 12 May 2022. C8
  [FT, vendor] reports 15.9% (BTC) and 17.5% (ETH) of days with net-negative funding over about
  three years to December 2024, with a longest negative streak of 13 days.
- Exchange counterparty risk is real: the regulator's judgment against FTX and Alameda (USD 12.7bn)
  found customer funds commingled and misappropriated [C10 FT]. A carry book holds both legs on a
  venue.

**Preliminary:**

- Threshold ("random-maturity") arbitrage beats always-on carry [C1]: BTC Sharpe 3.35 at the
  paper's "high" fee tier. R2 records three caveats seen in the text: that tier is a high-volume
  maker (6.75 bp spot, 1.44 bp futures), far below a retail taker's costs; Sharpe ratios under
  costs are annualised over active hours only; and returns come mostly from price convergence, not
  funding.
- Perpetual design cuts arbitrage drawdowns by more than half against dated futures [C4, abstract
  and introduction].
- Funding and basis as a crash or regime signal: C3 [ABS] reports that high carry predicts crashes;
  C9 [FT, practitioner] reports basis correlations of 0.50 and 0.54 with momentum scores and a
  one-year, in-sample, fee-free overlay.
- Compression after 2024: C11 [FT, practitioner press release with no methodology] reports the
  occurrence of extreme BTC funding on BitMEX fell about 90% from 2016 to 2025; C12 [SN only] says
  funding arbitrage is saturated. R4's conclusion: carry is real but compressed and crash-exposed.

**Unsupported:**

- A capturable cross-exchange funding differential at retail scale: C1 reports a Binance-Bybit
  funding correlation of 0.74, divergences mainly in stress, and no cross-venue margining. R2
  found no evidence the remaining dispersion survives fees, transfers and duplicated capital.

**Disagreements and gaps:** the reports agree on the direction (carry existed, is time-varying,
and is now smaller); they rely on working papers and practitioner material for the recent period.
Liquidation and auto-deleveraging mechanics were not verified from primary documents (R2), and
C6 [ABS] finds no reliable per-event early warning for liquidation cascades.

**Testable here: yes, approximately.** Binance funding history is free from 2019-09-10 (BTCUSDT),
with daily spot and perpetual klines. R2's cost arithmetic: a VIP-0 round trip of both legs costs
about 0.24% to 0.31% of notional, about 10 days of baseline funding. Implemented:
`btc-funding-carry`, gated on trailing funding, with 2x leverage on the short leg. Not
implemented: the perpetual-quarterly calendar spread (quarterly klines from 2021-02-03; the basis
endpoint keeps only 30 days), the funding-dispersion cross-section, and anything on CME, which has
no free licensed history (R2).

---

## 5. Family D: market microstructure

**Established (as explanation, not prediction):**

- Order-flow imbalance at the best quotes explains most short-interval price changes [D1 ABS,
  equities]; in crypto, trade-flow imbalance explains contemporaneous changes better [D7 ABS].
  These are contemporaneous or sub-second relations; D9 [ABS] predicts 500 ms returns and needed a
  live experiment to show profitability.
- Square-root market impact holds over four decades on a Bitcoin exchange [D5 ABS]. For this
  platform it is a cost-model input. R4 measured Binance USD-M BTCUSDT depth of about 37.8M to 41.1M
  USDT within 0.2% of mid on 2026-10-01 [O2], so retail orders are far from the impact regime in
  normal conditions; liquidity holes are the risk (0.1% ask depth fell from 100 BTC to 1.2 BTC on
  2023-10-16, per E14 [FT, press citing Kaiko]).
- Quoted BTC spreads are about one tick: R4's sample of 10.3M Binance USD-M book updates on one day
  in 2024 gave a median relative spread of 0.014 bp and a maximum of 13.6 bp [O3]. Fees, not
  spreads, dominate retail costs for BTC.

**Contested:**

- VPIN: defined on one-minute bars with bulk volume classification [D2, abstract and method], but
  D3 [ABS] finds it "a poor predictor of short run volatility" with a mechanical link to trading
  intensity. D8 [WP, partial FT], on Binance one-minute candles 2021 to 2023, finds Roll and VPIN
  help predict the sign of changes in realised volatility and kurtosis (average AUC above 0.55),
  not returns. The accuracy of bulk volume classification itself is disputed (D11, bibliographic
  record only, not verified).
- Spot versus derivatives price discovery: D12 [SN] finds BitMEX derivatives lead spot; D13 [SN]
  finds spot leads CME/CBOE futures. Results depend on venue and period.

**Unsupported for this platform:** market making (D4 FT: fill probability, queue position and
adverse selection are unobservable on candles), order-book imbalance as alpha, latency and
cross-venue arbitrage.

**Testable here: no, as strategies.** The research engine is daily. R4 classifies microstructure
signals as infeasible for a non-co-located retail account, and usable at most as diagnostics
(Binance klines carry exact taker-buy volume per bar [E4, E5]; Bybit klines do not [O5]). What
does carry over is the cost model: fill at the next open, fees from published schedules, a small
adverse slippage and a stress case.

---

## 6. Family E: volatility, volatility targeting and options

**Established:**

- Volatility is persistent and forecastable over short horizons; mean returns are not. This
  underlies the volatility-scaling papers [V1 WP-FT, V5 FT, T6 ABS].
- Volatility targeting thins the left tail and reduces vol-of-vol in every asset class studied
  (60+ assets, daily data from 1926) [V5 FT]. Its Sharpe gain is confined to equities and credit,
  which V5 ties to the leverage effect; it is negligible for bonds, FX and commodities.
- HAR-type models forecast BTC volatility better than daily GARCH [V6 FT for the model; V7 SEC
  snippets only; V8 ABS]. Both crypto papers use intraday realised variance; with daily OHLCV only
  range-based proxies are available, a substitution none of the sources tests.

**Contested:**

- Whether volatility-managed portfolios add value in real time. V1 reports large spanning alphas
  (market alpha 4.9%, 25% higher Sharpe) and says the market strategy survives costs; V2 [FT]
  finds real-time combinations underperform the unmanaged portfolio in 72 of 103 cases, due to
  structural breaks; V3 [ABS] finds that after costs only the market factor survives; V4 [ABS]
  reports a conditional multifactor version that survives out of sample and net of costs.
- Whether BTC has the leverage effect that makes volatility targeting raise the Sharpe ratio. V13
  [ABS] reports scale- and time-dependent asymmetry, inverse in minor coins, with no BTC-specific
  result in the abstract. R1: a Sharpe gain from volatility targeting BTC should not be assumed;
  the tail-thinning benefit is the more defensible expectation. In crypto momentum, volatility
  scaling raised payoffs but "does not change the tail risk" [T16].

**Preliminary (options):**

- A crypto variance risk premium exists on average: V10 [WP, most of the full text] reports an
  annualised monthly VRP of 0.14 overall on Deribit, July 2017 to December 2022, with an episode in
  March to April 2020 below -2. It does not backtest a short-variance strategy.
- Option trading costs are large relative to premium: in R4's snapshot of the BTC chain, the
  median quoted spread was 3.4% of mid, and 8.6% for the 20 most traded options [O4]. V12 [SN]
  reports an illiquidity premium in delta-hedged option returns.
- Smile-adjusted deltas beat Black-Scholes in some periods for hedging with the perpetual [V11
  ABS].

**Unsupported:** systematic tail hedging with puts: no rigorous study of its long-run cost was
found (R4 gap). The only supported inference is that, with a positive average VRP, protection has
a negative expected carry.

**Testable here: volatility targeting yes; options no.** Volatility targeting needs only daily
returns and was folded into `btc-trend-vol`. Options backtests would be mark-to-model at best:
Deribit's DVOL index is free from 2021-03-24 [O1], but historical option quotes are not (E12 is a
paid vendor), and filling at mark or mid would overstate any option strategy given the spreads
above. A DVOL-based regime filter is testable from 2021 but was not implemented.

---

## 7. Family F: machine learning

**Established:** no study shows that deep networks or transformers beat simple baselines for
daily BTC/ETH direction after costs. The best-designed evidence points the other way (R3):

- In L3 [FT], minute-level BTC, 2019, the 60-minute accuracy of logistic regression (0.5386) is
  close to the LSTM's (0.5601); long-short profits of up to 39% a month before costs turn negative
  after 30 bp round trip. Its binomial p-values treat overlapping labels as independent.
- In L4 [FT, dissertation chapter], daily cross-section of the 100 largest coins, logistic
  regression's long-short Sharpe (2.74) roughly matches random forest (2.73) and exceeds gradient
  boosting (2.49).
- L5 [ABS] finds "benefits from model complexity are limited" and alphas "concentrated in
  hard-to-trade assets".
- L7 [ABS, non-financial datasets] finds one-layer linear models beat transformer forecasters on
  all nine benchmarks.

**Preliminary:** ML cross-sectional crypto strategies with high after-cost Sharpe ratios: L4
reports out-of-sample Sharpe 3.23 (LSTM) against 1.33 for buy-and-hold at 15 bp per half-turn,
but assumes mid-price fills and free shorting, and is driven by the long leg in a bull market. L1
[ABS] is the foundational equity case, at a scale (about 30,000 stocks, decades) not available for
BTC/ETH.

**Methodological warning:** leakage affected 329 papers across 17 fields in L6 [ABS]; in its civil
war case study every claimed advantage of complex ML over logistic regression disappeared once
leakage was fixed.

**Testable here: technically yes, not justified.** Daily BTC since 2017 is about 3,500
observations (R3), fewer once labels overlap. R3's recommendation: a regularised linear or logistic
baseline and HAR for volatility; gradient boosting only as a gated challenger (beat the linear
baseline net of costs, DSR at least 0.95, PBO clearly below 0.5); no LSTM, transformer or TCN
models for daily BTC/ETH. Not implemented.

---

## 8. Family G: regimes and portfolio construction

**Established:**

- Negative-tail correlations are higher than normality implies; positive tails are not [G3 ABS].
  Diversification across correlated risk assets weakens in bear markets. G3 also warns that
  conditioning on large moves mechanically raises measured correlation.
- Crypto and equity correlation rose after 2020: BTC/S&P 500 correlation 0.01 in 2017 to 2019 and
  0.36 in 2020 to 2021 [G4, IMF blog, FT]; BTC fell with equities in March 2020 [G5 ABS].

**Preliminary:**

- Hidden Markov and Markov-switching models fit BTC returns well, with 4 to 5 states preferred by
  information criteria [G1 ABS, working paper; G2]. R1 read G2 at abstract level; R3 read it via a
  summary of the HTML and records that its out-of-sample evidence is 30 one-step-ahead densities
  with fixed parameters, no significance test seen, and no trading test. This is descriptive regime
  structure.

**Unsupported:** profitable HMM-regime timing of BTC after costs out of sample: neither R1 nor R3
found a verified source. A 2024 spot-ETF structural break is plausible but unverified by any source
read (R1).

**Contested by extension:** V4's conditional multifactor allocation suggests a BTC + ETH + cash
allocation could succeed where single-asset scaling fails; nothing read tests it in crypto.

**Testable here: yes for simple regimes.** A trend or volatility regime from daily closes is
straightforward. `btc-trend-vol` uses a moving-average filter as its regime and sizes by realised
volatility; the evaluation also reports every strategy by four regimes (BTC above or below its
200-day average, 30-day volatility above or below its running median), computed from past data
only (`validation.ts`). HMMs are testable from daily data but the prior is null (R1) and they were
not implemented. R3 suggests using them as descriptive labels, not trade signals.

---

## 9. Family H: on-chain, macro and alternative data

**Unsupported (as daily trading signals):**

- Generic daily predictors: H1 [ABS] finds that attention and trading volume, significant in
  sample elsewhere, have no significant out-of-sample predictability for BTC, ETH and XRP; the
  only meaningful predictor is the change in stochastic correlation with stocks (out-of-sample R²
  up to 2.69% for BTC). This contradicts T7's in-sample attention result (R2).
- MVRV, NVT and exchange-flow thresholds: R2 found practitioner material and theses [SN] but no
  peer-reviewed out-of-sample test with point-in-time data.
- Macro releases: H6 [ABS] finds Bitcoin "orthogonal to monetary and macroeconomic news" in an
  intraday event study.
- Social sentiment: H7 [SN] finds an effect only up to 15-minute horizons, too small to trade.

**Preliminary:**

- USDT net exchange inflows predict BTC and ETH intraday returns [H2 ABS, preprint; OOS not stated
  in the abstract]; BTC's own inflows generally do not.
- Stablecoin issuances coincide with positive abnormal returns in a 24-hour window [H4 SN, event
  study, 2019 to 2020].

**Contested:**

- ETF flows: H3 [ABS] reports net flows predict BTC price levels with R² of 95% in the first weeks
  of trading, and also that price increases lead ETF volume. R2's assessment: a levels-on-levels
  regression over a trending window is prone to spurious correlation.
- Tether and the 2017 rally [H5 SN]: disputed, historical.

**Documented data defect:** Coin Metrics' standard exchange-flow metrics attribute all addresses
currently known to an exchange back through history, and point-in-time versions exist to avoid
that look-ahead [E7 DOC]. Free values are flagged provisional ("flash"). A positive result on the
free, non-point-in-time series is presumptively contaminated (R2).

**Testable here: partly, not done.** Free daily series exist (Coin Metrics community data,
DefiLlama stablecoins, the Fear and Greed index [E7, E8, E9]), with non-commercial or attribution
terms. Given the evidence and the look-ahead problem, none was implemented.

---

## 10. Family I: other ideas

- **Calendar effects** [I1, SN only]: one study reports a day-of-week anomaly (2010 to 2017);
  others find no classical return effect, only lower weekend volatility. Return effects are
  unsupported for trading; volatility seasonality is plausible.
- **Rebalancing day and close time**: crypto trades 24/7 with no official close; T11 finds the
  rebalancing weekday changes results (R1). This is a robustness issue for every daily strategy,
  including ours (UTC daily bars).
- **Cross-exchange price arbitrage**: large before 2018, hard to exploit since [D10, M13]; needs
  intraday multi-venue data and capital on several venues. Not testable here.
- **Venue and custody risk** [C10]: not a strategy, but a risk every exchange-held strategy carries
  and no backtest prices.

---

## 11. Validation methodology (applies to every family)

R3 transcribed the formulas from full texts and reproduced the papers' worked examples:

- Sharpe ratio sampling error and time aggregation [X7 FT]: daily strategy P&L with
  autocorrelation must not be annualised by the square root of 365 without a correction.
- Deflated Sharpe ratio [X1 FT]: corrects the selected Sharpe ratio for the number of trials and
  for non-normal returns. R3 reproduced the paper's example (DSR 0.9004 at 100 trials).
- Probability of backtest overfitting by combinatorially symmetric cross-validation [X2 FT]. The
  paper suggests rejecting models with PBO above 0.05; it also contains a typo in a combination
  count (12,780 for 12,870), found by R3.
- Purging, embargo and walk-forward critique [X3 FT]: walk-forward tests a single path.
- Stationary bootstrap [X5, original not read; procedure from a secondary source] and the
  Ledoit-Wolf studentised test for Sharpe differences [X4 FT].
- Multiple-testing hurdles [X6 FT]: Bonferroni, Holm and BHY, and the headline that a new factor
  needs a t-ratio above 3.0.

The platform's evaluation (`evaluate.ts`, `validation.ts`) uses the deflated Sharpe ratio, PBO by
CSCV (10 blocks, 252 splits), a stationary bootstrap of the Sharpe ratio (mean block 10 days, 2,000
resamples), a 730-day/90-day walk-forward before the holdout, and a frozen holdout from
2025-07-01. Its PBO limit (0.25) is looser than the paper's customary 0.05. Holm/BHY adjustment,
White's Reality Check and the Ledoit-Wolf test are not implemented.

---

## 12. What this means for the platform

1. The best-supported daily idea for BTC is a **long/flat trend filter**, with the realistic
   expectation (R1) of lower drawdowns and similar risk-adjusted returns to buy-and-hold, not
   higher returns. Its supporting samples are dominated by 2013 to 2022, and one large study finds
   no out-of-sample BTC predictability [T9].
2. **Volatility targeting** should be judged on drawdown and tail metrics; a Sharpe gain is not
   expected from the cross-asset evidence for an asset with an unclear leverage effect.
3. **Daily mean reversion** on BTC has a null prior from the literature.
4. **Funding carry** is the one crypto-native idea with strong documentary support, but its
   realistic retail edge is much smaller than headline Sharpe ratios, it must be measured against
   the cash rate, and it carries venue and liquidation risk that a daily backtest does not price.
5. **Microstructure, options and ML** are out of reach of a free, daily, retail research setup,
   or not justified by the evidence.
6. **Alternative data** should be treated as "prove it out of sample with point-in-time data",
   with a strong prior of no edge over price and volume.

The catalog of seven strategies follows these conclusions; its results are in
[STRATEGY_CATALOG.md](STRATEGY_CATALOG.md#4-results).
