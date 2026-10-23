# Strategy catalog

Which strategy ideas were considered, which seven were implemented in the research module
(`packages/core/src/research/catalog.ts`, version `catalog-1`), why, and what they did on Binance
daily data after costs. Source ids (T1, C2, ...) resolve in [SOURCES.md](SOURCES.md); the evidence
behind each family is in [RESEARCH_REVIEW.md](RESEARCH_REVIEW.md).

This is research, not advice. No result below says that any strategy will be profitable in the
future, and none of the six candidates met the platform's evidence standard.

---

## 1. Candidate ideas, ranked

Every idea the four evidence reviews specified (R1 S1 to S7, R2 candidates A to E and the
alternative-data tests, R3 MR1 to MR6 and the ML gate, R4's feasibility table), scored on four
axes. The scores are our judgement from the reviews, not a computed number.

- **Evidence**: A several independent sources with out-of-sample support; B supported but
  contested or mainly working papers; C one study, abstracts only, or in-sample; D no credible
  support, or evidence against.
- **Data (free)**: Yes with the free daily data the platform downloads (Binance spot and USD-M
  daily klines and funding); Partial (free but short, non-point-in-time, licence-restricted, or
  needing a universe); No.
- **Cost sensitivity**: how much the edge depends on trading costs at retail (VIP 0) rates.
- **Impl. risk**: how easy it is to get the backtest wrong (look-ahead, fills, estimation,
  margin).

| Rank | Idea (review spec)                                                              | Evidence                     | Data (free)                                                 | Cost sens.                      | Impl. risk            | Status                                        | Reason                                                                                                      |
| ---- | ------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- | ------------------------------- | --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | Long/flat moving-average filter on BTC (R1 S2)                                  | B                            | Yes                                                         | Medium                          | Low                   | Implemented: `btc-sma-trend`                  | T8, T10, T11 support lower drawdowns; T9 finds no OOS BTC predictability; contested by T3                   |
| 2    | Long/flat time-series momentum on BTC (R1 S1)                                   | B                            | Yes                                                         | Medium                          | Low                   | Implemented: `btc-tsmom`                      | T1, T4 cross-asset; T7 weekly continuation; T11 long-only timing; T2, T3 contest it                         |
| 3    | Trend filter with volatility targeting (R1 S4 and S7)                           | B (tails), C (Sharpe)        | Yes                                                         | Medium                          | Low                   | Implemented: `btc-trend-vol`                  | V5 tail thinning across assets; V2, V3 contest real-time value; V13 leverage effect unclear in crypto       |
| 4    | Donchian-breakout ensemble with volatility sizing (R1 S3)                       | C                            | Yes                                                         | Medium                          | Low                   | Not implemented                               | T12 is an abstract-level working paper; would be a clean post-publication test (R1); next candidate         |
| 5    | Gated delta-neutral funding carry, BTC (R2 candidate A)                         | B                            | Yes                                                         | High                            | High                  | Implemented: `btc-funding-carry`              | C1, C2, C3 document gross carry; compression in C11; margin, liquidation and venue risk (C3, C10)           |
| 6    | Volatility-targeted buy-and-hold alone (R1 S4)                                  | C (crypto)                   | Yes                                                         | Medium                          | Low                   | Folded into rank 3                            | No verified peer-reviewed study on BTC alone (R1)                                                           |
| 7    | BTC/ETH relative strength, long-only (R1 S6 reduced to two assets)              | C                            | Yes                                                         | High                            | Low                   | Implemented: `btc-eth-rotation`               | Cross-sectional momentum contested (T14, M1, T11, T16); long-only avoids the short-leg crash in T16         |
| 8    | Volatility-percentile regime filter (R1 S5a)                                    | C                            | Yes                                                         | Medium                          | Low                   | Not implemented                               | Overlaps rank 3; no trading evidence beyond V5                                                              |
| 9    | Funding/basis as a directional risk filter (R2 candidate D)                     | C                            | Partial                                                     | Low                             | Medium                | Not implemented                               | C3 abstract and C9 one-year practitioner study only; H1 says most predictors fail OOS                       |
| 10   | Volatility-conditioned reversal (R3 MR2)                                        | C                            | Yes                                                         | High                            | Medium                | Not implemented                               | Transfer hypothesis from M4 (equities) and M3 (cross-section)                                               |
| 11   | Time-series short-term reversal / overreaction (R3 MR1, MR6)                    | D                            | Yes                                                         | High                            | Medium                | One variant implemented: `btc-mean-reversion` | Prior is null (M5, T7, M1); implemented because the selection framework requires a mean-reversion candidate |
| 12   | Perpetual versus quarterly calendar spread (R2 candidate C)                     | C                            | Partial (quarterly from 2021-02-03; basis endpoint 30 days) | High (four fee legs)            | High                  | Not implemented                               | C4 and C9 only; CME leg not free                                                                            |
| 13   | HMM regime filter (R1 S5b)                                                      | D (trading), B (descriptive) | Yes                                                         | Medium                          | High                  | Not implemented                               | No verified OOS after-cost evidence (R1, R3); estimation and label switching                                |
| 14   | HAR volatility forecast as a risk input (R3 section 4)                          | B (intraday RV)              | Partial (range proxies untested)                            | n/a                             | Medium                | Not implemented                               | V6, V7, V8 use intraday data; 30-day realised volatility used instead                                       |
| 15   | DVOL versus realised volatility regime filter (R4)                              | C                            | Partial (DVOL from 2021-03-24)                              | Low                             | Medium                | Not implemented                               | Feasible (O1) but no trading evidence in the reviews                                                        |
| 16   | BTC-ETH OU spread and distance pairs (R3 MR3, MR4)                              | D                            | Yes (needs a short leg)                                     | High                            | High                  | Not implemented                               | M9 daily pairs negative; no stable BTC-ETH cointegration found (M12 cautionary)                             |
| 17   | Funding-dispersion cross-section (R2 candidate B)                               | C                            | Partial (survivorship)                                      | High                            | High                  | Not implemented                               | Alt carry dominated by costs; BNB carry lost money in C1                                                    |
| 18   | Long-only cross-sectional momentum in top coins (R1 S6, R3 MR5)                 | C                            | No (point-in-time universe needed)                          | High                            | Medium                | Not implemented                               | Needs survivorship-free membership (T12, T14 used it)                                                       |
| 19   | Regularised logistic / linear direction model (R3 ML baseline)                  | D                            | Yes                                                         | Medium                          | High (leakage)        | Not implemented                               | L3, L4, L5: little beyond simple features; about 3,500 daily observations                                   |
| 20   | Gradient boosting, LSTM, transformer models (R3)                                | D                            | Yes                                                         | High                            | High                  | Not implemented                               | R3: not justified for daily BTC/ETH (L3 to L7)                                                              |
| 21   | Day-of-week effects (R2)                                                        | D                            | Yes                                                         | Medium                          | Low                   | Not implemented                               | I1 mixed, search-extract level only                                                                         |
| 22   | Alternative data: stablecoin supply, MVRV, exchange flows, Fear and Greed (R2)  | D                            | Partial (non-point-in-time, non-commercial licences)        | Low to Medium                   | High (look-ahead, E7) | Not implemented                               | H1; no peer-reviewed OOS test with point-in-time data                                                       |
| 23   | ETF flows, macro releases (R2)                                                  | D                            | No / Partial                                                | Medium                          | High                  | Not implemented                               | H3 spurious-regression risk; H6 orthogonal to macro; Farside not accessible                                 |
| 24   | Cross-exchange funding differential (R2 candidate E)                            | D                            | Partial                                                     | High                            | High                  | Not implemented                               | C1 correlation 0.74; divergences mainly in stress                                                           |
| 25   | Taker-flow imbalance and VPIN as signals (R4)                                   | C (explains, not predicts)   | Partial (one-minute Binance klines; engine is daily)        | High                            | Medium                | Not implemented                               | D1, D7 contemporaneous; D3, D8 volatility diagnostics only                                                  |
| 26   | Short volatility / VRP harvest with options (R4)                                | C                            | No (no free quote history)                                  | High (spreads 3.4% to 8.6%, O4) | High                  | Not implemented                               | V10 VRP exists but no strategy backtest; mark-to-model only                                                 |
| 27   | Tail hedging with puts, skew and term-structure signals (R4)                    | D                            | No / forward only                                           | High                            | High                  | Not implemented                               | No rigorous cost study found; VRP implies negative carry                                                    |
| 28   | Order-book imbalance, market making, latency and cross-venue arbitrage (R4, R3) | D for retail                 | No                                                          | High                            | High                  | Not implemented                               | D4, D9, D10, M13: infeasible without co-location and intraday multi-venue data                              |

---

## 2. Selection framework

The catalog had to cover, at minimum: a passive benchmark, a trend or momentum baseline, a
mean-reversion candidate, a regime-aware approach, and a crypto-specific candidate. Within that,
the highest-ranked idea in each slot that free daily Binance data can test honestly was chosen,
with small grids (3 to 9 configurations) so the selection statistics stay meaningful. All 37
candidate configurations plus the benchmark are fixed in `catalog-1`; every configuration in a
grid counts as a trial in that strategy's Deflated Sharpe ratio and PBO.

| Slot                    | Strategy                     | Why this one                                                                          |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Passive benchmark       | `btc-buy-hold`               | What every candidate must beat after the same costs (R1 benchmark 1, R3 benchmark a)  |
| Trend/momentum baseline | `btc-tsmom`, `btc-sma-trend` | Ranks 1 and 2: the best-supported daily ideas for BTC                                 |
| Regime-aware            | `btc-trend-vol`              | Rank 3: a trend regime plus volatility sizing; the simplest regime model with support |
| Mean reversion          | `btc-mean-reversion`         | The required slot; the literature's prior is null, so it doubles as a control         |
| Crypto-specific         | `btc-funding-carry`          | Rank 5: the only crypto-native idea with strong documentary support (R2)              |
| Extra (cross-asset)     | `btc-eth-rotation`           | Rank 7: the only cross-sectional idea testable with two assets                        |

Common settings (from `backtest.ts` and `evaluate.ts`): decisions on day t's close, execution at
day t+1's open; costs of 10 bp fee on spot and 5 bp on the perpetual, plus 5 bp slippage per side
on both; uninvested cash earns 3% a year, which is also the hurdle of every Sharpe ratio (an
assumption, not a measured series); 365 days a year.

### 2.1 The seven strategies

**`btc-buy-hold`: BTC buy and hold (benchmark).**
Always 100% BTC spot. Not judged; it starts on the same day as the spot candidates (366-day
warm-up) so the comparison is over the same period.

**`btc-tsmom`: BTC time-series momentum.**
Hypothesis (catalog): bitcoin's past return over weeks to months predicts the sign of its next
returns, so being out after negative periods avoids part of the large drawdowns. Rule: long 100%
while the past L-day return is positive, else cash. Grid: L in {20, 60, 120, 180, 365} (5).
Sources: T1, T4 (method and cross-asset evidence), T7 (BTC continuation), T11 (long-only timing),
T2 and T3 (the counter-evidence). It differs from R1's S1 grid ({7, 14, 28, 56, 112, 224, 365} with
1- or 5-day holds, and a pre-registered ensemble across lookbacks); the ensemble was not
implemented.

**`btc-sma-trend`: BTC moving-average trend.**
Hypothesis: holding bitcoin only while it closes above a moving average keeps most of its uptrends
and avoids part of its bear markets. Rule: long while the close is above its N-day simple average.
Grid: N in {20, 50, 100, 150, 200} (5). Sources: T8 (price-to-SMA on BTC), T10, T11. R1's S2 also
proposed a 2% hysteresis band; not implemented.

**`btc-trend-vol`: BTC trend with volatility targeting (regime-aware).**
Hypothesis: combining a trend filter (the regime) with sizing by realised volatility lowers
drawdowns and improves risk-adjusted returns, since volatility clusters and is partly predictable.
Rule: when above the N-day average, hold min(1, target / 30-day realised volatility), else cash.
Grid: N in {50, 100, 200}, target in {30%, 50%} (6). Sources: V5 (tail thinning, mechanism), V1,
with V2 and V3 as the real-time critique and V13 on the crypto leverage effect. R1 recommended an
EWMA volatility with a 20-day half-life and judging the overlay on drawdown and tail metrics; this
version uses a 30-day simple realised volatility and a leverage cap of 1.

**`btc-mean-reversion`: BTC short-term mean reversion.**
Hypothesis: sharp short-term sell-offs in bitcoin partly reverse within days (overreaction and
liquidity provision), at least while the long-term trend is up. Rule: buy when the close is more
than k standard deviations below its W-day mean, only while above the 200-day average; sell once
back at the mean. Long-only. Grid: W in {5, 10, 20}, k in {1, 1.5, 2} (9). Sources: M5
(overreaction), M4 and M3 (liquidity provision), with M1, T7 and M5 setting a null prior. The rule
is a z-score band, not R3's return-based MR1 or MR6 specifications.

**`btc-eth-rotation`: BTC/ETH relative strength.**
Hypothesis: between bitcoin and ether, the one with the stronger recent return keeps outperforming
for a while, and cash when both fall. Rule: hold whichever had the higher L-day return, if
positive; otherwise cash. Grid: L in {30, 60, 90} (3). Sources: T14 (large-coin cross-sectional
momentum), T11, and T16 (why there is no short leg).

**`btc-funding-carry`: BTC funding carry (cash and carry).**
Hypothesis: perpetual funding is positive most of the time because leveraged demand is mostly
long, so a delta-neutral long spot, short perpetual book collects it. Rule: when the mean of the
last P funding rates, annualised, is above E, hold spot and short the perpetual at equal notional
(2x leverage on the short, so each leg is two thirds of capital); leave when it falls below E/2.
Grid: P in {9, 21, 42} funding periods, E in {5%, 10%, 15%} a year (9). Benchmark: cash, since the
book is market-neutral. Sources: C1, C2, C3 (carry), E1 (mechanics), C7, C8 (negative funding),
C10 (venue risk), C11 (compression). R2's spec used k in {3, 9, 21} periods and an entry hurdle of
the cash rate plus amortised costs; this version uses absolute thresholds. Margin is assumed to be
topped up daily; a stress indicator reports the worst intraday move against the short.

---

## 3. Considered but not implemented

| Area                                                                          | Why not                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Options and volatility selling (ranks 26, 27)                                 | No free historical option quotes (E12 is paid); trade prints and DVOL allow mark-to-model only; spreads of several percent of premium (O4) would dominate; no rigorous evidence on tail-hedge cost                                                                          |
| Microstructure (ranks 25, 28)                                                 | Signals are contemporaneous or sub-second (D1, D7, D9); market making cannot be backtested on candles (D4); the engine is daily                                                                                                                                             |
| Machine learning (ranks 19, 20)                                               | About 3,500 daily observations; complex models barely beat logistic regression in the best crypto studies (L3, L4, L5); high leakage risk (L6). R3's gate (beat a linear baseline net of costs, DSR at least 0.95, PBO well below 0.5) would apply to any future challenger |
| On-chain and alternative data (ranks 22, 23)                                  | Out-of-sample failures (H1); free exchange-flow series are not point-in-time (E7); non-commercial licences (E7, E8)                                                                                                                                                         |
| HMM regimes (rank 13)                                                         | No verified profitable OOS evidence (R1, R3); kept as a possible descriptive label                                                                                                                                                                                          |
| Cross-sectional universes (ranks 17, 18)                                      | Need survivorship-free, point-in-time coin membership the platform does not have                                                                                                                                                                                            |
| Pairs and spreads (rank 16)                                                   | Daily evidence negative (M9); needs a short leg with funding                                                                                                                                                                                                                |
| Donchian ensemble, calendar spread, funding as a risk filter (ranks 4, 9, 12) | Reasonable next candidates; left out to keep the first catalog small and the trial count low                                                                                                                                                                                |

---

## 4. Results

Source: the latest research run (`apps/web/tests/strategy-research.live.test.ts`, output
recorded as O7), `catalog-1`, `research-engine-1`, `evaluation-1`. Data: Binance BTCUSDT and
ETHUSDT spot, 3,354 days each with no gaps (from 2017-08-17), and BTCUSDT USD-M perpetual, 2,602
days with 7,800 funding events, through 2026-10-21.

The three categories are different kinds of evidence and must not be mixed:

- **In-sample**: the best configuration of the grid, chosen and measured on the same days before
  the holdout (2018-08-19 to 2025-06-30; carry from 2019-09-24). Optimistic by construction.
- **Walk-forward**: each 90-day window traded by the configuration with the best Sharpe on the
  730 days before it, before the holdout only (19 windows, 2020-08-18 to 2025-04-23; carry 15
  windows, 2021-09-23 to 2025-06-03). The main out-of-sample evidence.
- **Holdout**: the in-sample choice, frozen, on 2025-07-01 to 2026-10-21 (478 days), which no
  choice saw.

Sharpe ratios are annualised and in excess of the assumed 3% cash rate. "Bench" is BTC buy-and-hold
over the same days. "Boot 95%" is the stationary-bootstrap interval of the Sharpe ratio. Turnover
is per year, in multiples of equity.

### 4.1 In-sample

| Strategy           | Chosen configuration                 | CAGR  | Sharpe | Max DD | Vol   | Bench Sharpe | Bench Max DD | Boot 95%      | Turnover | Exposure |
| ------------------ | ------------------------------------ | ----- | ------ | ------ | ----- | ------------ | ------------ | ------------- | -------- | -------- |
| btc-buy-hold       | Always 100% BTC                      | 50.7% | 0.92   | 76.6%  | 64.5% | n/a          | n/a          | 0.14 to 1.68  | 0.1      | 1.00     |
| btc-tsmom          | 60-day return > 0                    | 62.9% | 1.22   | 59.7%  | 46.2% | 0.92         | 76.6%        | 0.47 to 1.99  | 18.8     | 0.56     |
| btc-sma-trend      | Close above 50-day average           | 66.7% | 1.29   | 57.4%  | 45.0% | 0.92         | 76.6%        | 0.49 to 2.05  | 19.7     | 0.54     |
| btc-trend-vol      | Above 50-day average, 30% target     | 43.7% | 1.44   | 37.2%  | 25.3% | 0.92         | 76.6%        | 0.62 to 2.25  | 14.6     | 0.32     |
| btc-mean-reversion | 1 sd below the 10-day mean           | 14.4% | 0.53   | 33.1%  | 26.1% | 0.92         | 76.6%        | -0.05 to 1.14 | 21.3     | 0.18     |
| btc-eth-rotation   | Stronger 60-day return               | 50.8% | 0.94   | 65.0%  | 61.6% | 0.92         | 76.6%        | 0.17 to 1.77  | 37.2     | 0.64     |
| btc-funding-carry  | Trailing 9 fundings above 15% a year | 7.8%  | 5.27   | 0.2%   | 0.9%  | 0.93         | 76.6%        | 3.84 to 6.57  | 10.0     | 0.45     |

### 4.2 Walk-forward

| Strategy           | CAGR  | Sharpe | Max DD | Vol   | Bench Sharpe | Bench Max DD | Boot 95%      | Turnover | Exposure |
| ------------------ | ----- | ------ | ------ | ----- | ------------ | ------------ | ------------- | -------- | -------- |
| btc-buy-hold       | 53.4% | 0.96   | 76.8%  | 61.3% | n/a          | n/a          | -0.01 to 1.90 | 4.1      | 1.00     |
| btc-tsmom          | 44.6% | 0.95   | 66.5%  | 47.0% | 0.97         | 76.6%        | -0.02 to 1.97 | 21.8     | 0.65     |
| btc-sma-trend      | 57.8% | 1.16   | 54.0%  | 45.4% | 0.97         | 76.6%        | 0.18 to 2.18  | 21.6     | 0.60     |
| btc-trend-vol      | 36.3% | 1.15   | 32.7%  | 27.5% | 0.97         | 76.6%        | 0.14 to 2.21  | 15.9     | 0.38     |
| btc-mean-reversion | 12.7% | 0.49   | 33.2%  | 24.2% | 0.97         | 76.6%        | -0.22 to 1.25 | 13.7     | 0.14     |
| btc-eth-rotation   | 42.5% | 0.85   | 66.2%  | 58.1% | 0.97         | 76.6%        | -0.04 to 1.78 | 52.1     | 0.66     |
| btc-funding-carry  | 4.5%  | 3.28   | 0.2%   | 0.4%  | 0.66         | 76.6%        | 1.42 to 5.26  | 7.0      | 0.39     |

(The buy-and-hold walk-forward row is its single configuration run window by window, so it re-enters
and pays costs at each of the 19 windows (turnover 4.1 a year); the candidates' "bench" column is
continuous buy-and-hold over the same days. Hence 0.96 against 0.97. The carry's bench 0.66 covers
its own, later walk-forward days.)

### 4.3 Holdout (2025-07-01 to 2026-10-21)

| Strategy           | Frozen configuration                 | CAGR   | Total return | Sharpe | Max DD | Vol   | Bench Sharpe | Bench Max DD | Boot 95%      | Exposure |
| ------------------ | ------------------------------------ | ------ | ------------ | ------ | ------ | ----- | ------------ | ------------ | ------------- | -------- |
| btc-buy-hold       | Always 100% BTC                      | -17.0% | -21.6%       | -0.31  | 53.0%  | 41.6% | n/a          | n/a          | -2.09 to 1.55 | 1.00     |
| btc-tsmom          | 60-day return > 0                    | 6.9%   | 9.1%         | 0.27   | 27.0%  | 25.5% | -0.31        | 53.0%        | -1.79 to 2.14 | 0.47     |
| btc-sma-trend      | Close above 50-day average           | 8.7%   | 11.6%        | 0.34   | 25.1%  | 25.3% | -0.31        | 53.0%        | -1.50 to 2.05 | 0.51     |
| btc-trend-vol      | Above 50-day average, 30% target     | 7.4%   | 9.7%         | 0.30   | 21.8%  | 22.0% | -0.31        | 53.0%        | -1.56 to 2.09 | 0.44     |
| btc-mean-reversion | 1 sd below the 10-day mean           | 10.2%  | 13.6%        | 0.56   | 7.8%   | 13.7% | -0.31        | 53.0%        | -0.61 to 1.68 | 0.14     |
| btc-eth-rotation   | Stronger 60-day return               | 28.6%  | 39.0%        | 0.72   | 45.2%  | 44.3% | -0.31        | 53.0%        | -1.32 to 2.62 | 0.54     |
| btc-funding-carry  | Trailing 9 fundings above 15% a year | 3.0%   | 4.0%         | n/a    | 0.0%   | 0.0%  | -0.31        | 53.0%        | n/a           | 0.00     |

Cash at 3% a year earned 4.0% over the holdout's 478 days.

### 4.4 Verdicts and criteria

The evidence standard (`EVIDENCE_STANDARD` and `judge` in `evaluate.ts`): at least 3 years before
the holdout and 180 days of holdout; Deflated Sharpe ratio at least 0.95; PBO at most 0.25;
walk-forward Sharpe above 0 with the bootstrap's 95% interval above 0; walk-forward Sharpe above
the benchmark's (or, for the carry, above cash); holdout return after costs above cash. A strategy
meets the standard only if every criterion passes; it is rejected if its walk-forward Sharpe is not
above 0; otherwise it is experimental.

| Strategy           | Verdict      | DSR (trials) | PBO  | WF bootstrap > 0   | WF beats benchmark          | Holdout above cash  | Criteria failed                            |
| ------------------ | ------------ | ------------ | ---- | ------------------ | --------------------------- | ------------------- | ------------------------------------------ |
| btc-tsmom          | experimental | 0.998 (5)    | 0.74 | No (-0.02 to 1.97) | No (0.95 vs 0.97)           | Yes (9.1% vs 4.0%)  | PBO, walk-forward interval, benchmark      |
| btc-sma-trend      | experimental | 0.997 (5)    | 0.86 | Yes (0.18 to 2.18) | Yes (1.16 vs 0.97)          | Yes (11.6% vs 4.0%) | PBO                                        |
| btc-trend-vol      | experimental | 1.000 (6)    | 0.27 | Yes (0.14 to 2.21) | Yes (1.15 vs 0.97)          | Yes (9.7% vs 4.0%)  | PBO (0.27 against a 0.25 limit)            |
| btc-mean-reversion | experimental | 0.764 (9)    | 0.75 | No (-0.22 to 1.25) | No (0.49 vs 0.97)           | Yes (13.6% vs 4.0%) | DSR, PBO, walk-forward interval, benchmark |
| btc-eth-rotation   | experimental | 0.985 (3)    | 0.89 | No (-0.04 to 1.78) | No (0.85 vs 0.97)           | Yes (39.0% vs 4.0%) | PBO, walk-forward interval, benchmark      |
| btc-funding-carry  | experimental | 1.000 (9)    | 0.08 | Yes (1.42 to 5.26) | Yes (Sharpe 3.28 over cash) | No (4.0% vs 4.0%)   | Holdout                                    |

All six candidates passed the sample-length criterion (2,508 in-sample and 478 holdout days; the
carry 2,107 and 478). None was rejected and none met the standard. The mean-reversion grid's 2 sd, 5-day
configuration never traded (its in-sample CAGR equals the 3% cash rate); it still counts as one of
the 9 trials, with a Sharpe ratio of 0 over cash. (An earlier run left it out of the count,
giving a DSR of 0.816 over 8 trials; the engine was corrected.)

### 4.5 Interpretation

**Trend filters reduced drawdowns; their configuration choice is not stable.** All three trend
strategies cut the walk-forward maximum drawdown well below buy-and-hold's 76.8% (tsmom 66.5%,
SMA 54.0%, trend-vol 32.7%), which is what R1 says the literature supports. Only the SMA and
trend-vol versions also beat buy-and-hold's walk-forward Sharpe (1.16 and 1.15 against 0.97), with
bootstrap intervals above zero but wide (0.18 to 2.18 and 0.14 to 2.21). The DSR passes easily
because the grids are small (5 or 6 trials), but PBO is high for the single-asset trend grids
(0.74 and 0.86): in most CSCV splits the in-sample winner ranked at or below the median out of
sample. Every TSMOM and SMA configuration trades the same asset with the same idea, so their
returns are highly correlated and small differences in sample decide the winner; the walk-forward
also switched configurations (for the SMA, the 50-day window in 10 of 19 windows, 100-day in 5,
200-day in 4). A high PBO here says the choice of window is not reliable, not by itself that the
trend effect is absent. Trend-vol came closest to the standard, failing only PBO (0.27 against
0.25), at the cost of a much lower CAGR (36.3% walk-forward against 53.4%); its higher Sharpe comes
from lower volatility, consistent with V5's tail-thinning rather than a return gain.

**Trend results depend on the regime.** In the walk-forward, the three trend strategies lost
money in the "downtrend-volatile" regime (BTC below its 200-day average with above-median
volatility: Sharpe -0.64, -0.92, -1.22) and earned most in "uptrend-volatile" (1.85, 2.64, 2.13).
This matches the failure mode in T1 and T5: losses around sharp reversals.

**Mean reversion behaved as the literature predicted.** Its walk-forward Sharpe of 0.49 is about
half of buy-and-hold's, the bootstrap interval includes zero, the DSR fails (0.764), and PBO is
0.75. Its good holdout (13.6% with a 7.8% drawdown) came from 9 trades at 14% exposure and should
not be read as evidence.

**The rotation's holdout is not evidence either.** Its 39.0% holdout return is the largest, but
its walk-forward Sharpe (0.85) is below buy-and-hold's, its PBO is the highest (0.89), it had 7
holdout trades, and it turns over 52 times equity a year in the walk-forward. One favourable ETH
move in a 478-day window can produce this.

**The carry trade passed everything before the holdout, by a small excess over cash.** Walk-forward
CAGR was 4.5% against the 3% cash assumption, so the excess is about 1.5 points a year (our
arithmetic). The Sharpe ratio of 3.28 reflects a very low volatility (0.4%), which daily
bookkeeping of a hedged book also understates: it does not see intraday basis moves, margin calls
or liquidations. The in-sample selection chose the highest entry threshold (15%), which trades
least. In the holdout, trailing funding never rose above 15% a year, so the book never traded and
earned exactly the cash rate (4.0% against 4.0%), failing the holdout criterion by construction.
This is consistent with the compression reported in C11, but our run cannot say why funding was
low. The stress indicator found a worst intraday rise against the short of 21.4% in-sample and
12.7% in the walk-forward, with no day using more than half of the 50% margin.

**The holdout flatters every timing strategy against buy-and-hold.** BTC buy-and-hold lost 21.6%
over the holdout, after costs, with a 53% drawdown, and the holdout contained no
"uptrend-volatile" days. Any strategy that spent time in cash beat buy-and-hold there, and five of
six beat cash. Every holdout bootstrap interval includes zero (for example -1.79 to 2.14 for TSMOM). The holdout is 478 days, about one
market phase: it can falsify, but it cannot confirm.

**Overall.** The results are consistent with the review's expectations: long/flat trend filters
reduced drawdowns with roughly buy-and-hold-like risk-adjusted returns; volatility targeting
reduced risk more than it raised return; daily mean reversion showed no robust edge; and the carry
earned a modest excess over cash before the holdout and nothing in it. None of this is a forecast.
The limits of these tests are listed in [RESEARCH_LIMITATIONS.md](RESEARCH_LIMITATIONS.md).
