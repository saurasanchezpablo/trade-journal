# Validation and the evidence standard

How a strategy's results are produced, kept apart and judged
(`packages/core/src/research/evaluate.ts` and `validation.ts`). Every statistic is computed on
daily returns **in excess of the cash rate**.

## Categories of results (never mixed)

| Category     | What it is                                                                                                                                    | Days                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| In-sample    | Every configuration of the strategy's grid is run; the best Sharpe ratio is chosen and reported on the same days. Optimistic by construction. | From the warm-up (366 days of history; 15 for the carry) to the day before the holdout |
| Walk-forward | Every 90 days, each configuration is run on the previous 730 days; the best trades the next 90. The out-of-sample windows are chained.        | Before the holdout only                                                                |
| Holdout      | The in-sample choice, frozen, from `HOLDOUT_FROM` (1 July 2025) on. No configuration was chosen with any of these days.                       | 1 July 2025 to the last closed day                                                     |
| Paper        | The live monitor's recorded signals of the frozen configuration, replayed at the next open with the same accounting (MONITORING.md).          | From the day monitoring started                                                        |

Each category is computed, stored and shown separately, with the BTC benchmark over exactly
the same days next to it. Nothing adds them together.

## Statistics

- **Probabilistic Sharpe ratio** (Bailey and López de Prado): the probability that the true
  Sharpe ratio exceeds `SR*`, given the sample:
  `PSR = Φ[(SR − SR*)·√(T − 1) / √(1 − γ₃·SR + (γ₄ − 1)/4·SR²)]`, with SR, γ₃ (skewness) and γ₄
  (kurtosis, not excess) per day.
- **Deflated Sharpe ratio**: the PSR against the Sharpe ratio the best of N configurations would
  reach by luck: `SR* = √V·((1 − γ)·Φ⁻¹[1 − 1/N] + γ·Φ⁻¹[1 − 1/(N·e)])`, V the variance of the
  N configurations' daily Sharpe ratios, γ Euler's constant. N is the grid size; every
  evaluation is also logged in `sr_trials`, so trials across catalog versions are never lost.
- **Probability of backtest overfitting** (Bailey, Borwein, López de Prado and Zhu, CSCV): the
  configurations' daily returns are cut into 10 blocks; for each of the 252 ways to pick 5 as
  in-sample, the in-sample winner's rank out of sample gives `ω = rank / (N + 1)` and the logit
  `log(ω / (1 − ω))`. PBO is the share of splits with a logit ≤ 0 (the winner ranks at or
  below the median out of sample). 0.5 is what luck gives.
- **Stationary bootstrap** (Politis and Romano): 2,000 resampled series built from blocks of
  geometric length (mean 10 days), wrapping around, with a fixed seed (mulberry32), giving a
  95% percentile interval for the annualized Sharpe ratio.
- **Regimes**: each day labelled from BTC's past only: the previous close against its 200-day
  average (up or down trend) and the previous 30 days' realized volatility against the median
  of that measure over all earlier days (calm or volatile).

The normal CDF (Abramowitz and Stegun) and quantile (Acklam) are checked against scipy to 1e-6;
PSR, DSR and PBO against the independent reference (`scripts/research/reference.py`).

## The evidence standard (declared before any result)

A candidate **meets the standard** only if every criterion passes:

1. At least 3 years before the holdout and 180 days of holdout.
2. Deflated Sharpe ratio ≥ 0.95.
3. PBO ≤ 0.25 (a single configuration passes: nothing was chosen).
4. Walk-forward Sharpe ratio > 0 with the bootstrap's 95% interval above 0.
5. Walk-forward Sharpe ratio above the benchmark's over the same days (BTC held). For the
   market-neutral carry, the benchmark is cash: its Sharpe ratio, already measured against the
   cash rate, must be above 0.
6. Holdout return after costs above what cash earned over the same days.

Otherwise it is **experimental** (positive out of sample but not established), or **rejected**
when its walk-forward Sharpe ratio is not above 0 (no better than cash after costs), or
**insufficient data**. The benchmark is not judged.

Two changes were made to this standard during development, both before the final results and
both stricter: the holdout criterion first compared the return with 0 (a strategy idle in cash
passed it), and "rejected" first meant a walk-forward loss rather than not beating cash.

## Known limits of these tests

See RESEARCH_LIMITATIONS.md. In short: one venue, two assets, daily bars, about 7 years of
history before the holdout (few independent bear markets), a holdout of 16 months chosen with
general knowledge of the period, and constant cost and cash-rate assumptions.
