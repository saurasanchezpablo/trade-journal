# Strategy research: implementation plan

The plan for adding quantitative strategy research, validation, monitoring and paper trading to
the journal, written from an audit of the repository. Kept as built: where the build departed
from the plan, the plan says so.

## 1. Audit: what the journal already had

| Need                                 | Existing piece                                                                                        | Reused?                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure, tested analytics               | `packages/core` (metrics, equity, claims, the replay backtester in `backtest.ts`)                     | The new engine lives beside it in `packages/core/src/research/`, exported as the `research` namespace so no name collides with the trade metrics |
| Keyless market data with rate limits | `server/market-data/transport.ts` (per-host concurrency and spacing, caching), `http.ts` (`readJson`) | Yes: every Binance request goes through it; a `fapi.binance.com` limit was added                                                                 |
| Background work                      | `instrumentation-node.ts` starts workers (alerts, digests, external analysis, video intelligence)     | Yes: a fourth worker, same pattern (idle until started, `JOURNAL_*=off`, busy guard, resumable)                                                  |
| Notifications                        | `background-alerts/delivery.ts` `deliver()` with per-kind routing and a log                           | Yes: a new alert kind `strategy`                                                                                                                 |
| Fork-owned storage                   | Add-ons create their own tables on first use (`server/video-intelligence/store.ts`)                   | Yes: `sr_*` tables in `server/strategy-research/store.ts`; `db/schema.ts` untouched                                                              |
| UI kit and charts                    | Radix + Tailwind primitives, ECharts wrapper and design tokens, i18n dictionaries                     | Yes                                                                                                                                              |
| Exchange credentials                 | `@luxalgo/broker-sdk` for broker sync                                                                 | Deliberately **not** used: research needs no account and places no order                                                                         |

Constraints taken from the repository: analytics in core, by hand request validation, no em
dashes, Spanish strings for every UI text, tests that never touch `apps/web/data/`, AGPL
dependencies kept out of the new code (none added).

## 2. Method

1. **Evidence first.** Four parallel literature reviews (trend and volatility; crypto-native
   carry and alternative data; mean reversion, ML and validation; microstructure, options and
   costs), each recording how every source was read. Synthesis in RESEARCH_REVIEW.md, the
   registry in SOURCES.md, limits in RESEARCH_LIMITATIONS.md.
2. **Select before testing.** A selection framework (a passive benchmark, a trend baseline, a
   mean-reversion candidate, a regime-aware approach, a crypto-specific candidate) and small
   pre-declared grids (STRATEGY_CATALOG.md, `catalog.ts`).
3. **Declare the standard before the results** (VALIDATION.md): sample length, Deflated
   Sharpe, PBO, walk-forward with a bootstrap interval, the benchmark, a holdout.
4. **An engine that cannot look ahead**, with costs, funding, drift and a cash hurdle
   (BACKTESTING.md), checked against an independent implementation
   (`scripts/research/reference.py`).
5. **Separate categories**: in-sample, walk-forward, holdout, paper, never added together.
6. **Monitor and paper trade** the frozen configurations, with no orders (MONITORING.md).
7. **If nothing meets the standard**, ship the infrastructure and label everything
   experimental. That is what happened.

## 3. Build order (as executed)

1. Core engine: `backtest.ts`, `metrics.ts`, `validation.ts`, `strategies.ts`; reference
   implementation and fixture; tests against it, plus look-ahead, cost, funding and determinism
   tests.
2. Catalog and evaluation: `catalog.ts`, `evaluate.ts` (categories, the standard, `judge`),
   `decisionsThrough` (live decisions), `replaySignals` (paper).
3. Server: data adapters (`data.ts`), storage (`store.ts`), runner and paper ledger
   (`research.ts`), monitor (`monitor.ts`), worker (`worker.ts`); API routes under
   `app/api/research/`.
4. First real run on Binance's history. The review findings then changed the engine (all
   before final results): costs on drifted weights, a cash rate as yield and Sharpe hurdle, a
   cash benchmark for the market-neutral carry, a margin stress indicator, a holdout criterion
   against cash rather than zero, and never-trading configurations counted as trials.
5. UI: `app/research` (strategies, paper trading, method, data) and `app/research/[id]`
   (results by category, selection bias, regimes, signals and paper), checked in a browser.
6. Docs, Spanish, changelog, CI gates.

## 4. Out of scope (on purpose)

- Real orders, exchange accounts, API keys: none. The spec forbids them in this phase.
- Intraday, order-book, options and on-chain strategies: the reviews found them either
  unsupported by free data or too costly to test honestly here (STRATEGY_CATALOG.md, section
  on ideas not implemented).
- Machine learning models: no candidate met the gate the review sets for an ML challenger.
