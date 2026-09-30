# Historical market data

Market data is an optional, user-configured input. Vela remains the chart renderer;
broker sync remains responsible for executions. No provider is enabled or selected
by default. No API key or provider history is shipped with the project.

## Connect and use

1. Open **Settings → Market data** and choose a supported connection or upload a
   candle CSV. Configure or enable a connection only if you want to use it, then
   select **Test connection**. Environment credentials, when deliberately configured,
   take precedence over saved credentials.
2. Open a trade (closed or still open). When a source is known for it, its candles load on
   their own (see below); otherwise select a provider, its exact symbol, and candle
   resolution, and a feed where required. An optional dataset can disambiguate instruments.
3. Select **Load candles & replay**. This makes provider requests and uses your plan's
   allowance. Candles start well before the entry and run past the exit (at least 30
   candles, or a quarter of the trade's length, either side); an open trade's run up to
   now. Replay supports restart, play/pause, step, speed and scrubbing.
4. MAE and MFE are worked out whenever candles load: in money when the candles' quote
   currency is the account's (for a USD account, USDT, USDC and other dollar stablecoins
   count as dollars, with a note), and always as the price move against and in favour of the
   average entry, as a distance and a share of the entry. A coin on Binance, Bybit or
   Coinbase counts one unit as one coin, so a manual trade without an asset class gets money
   amounts too; derivatives still need a contract multiplier in Settings. To save the
   estimate for Reports, confirm that the instrument, price adjustment basis and quote
   currency match the executions and account, and load again; without the confirmation it
   is shown, not saved. Fills more than 20% away from the candles withhold both.

Before candles load, Vela displays a price path from recorded fills for every asset class.
Once candles are loaded, **Show fills only** switches to that path and **Show candles** back,
without loading again. An open trade with a single fill draws a line to now.

### Candles chosen for a trade

Opening a trade loads its candles by itself only from a source you enabled, in this order:
the market replay you loaded for that trade before; a chart you saved on its symbol; or,
for a coin (asset class crypto, or unset, CFD, forex or other, as brokers book BTCUSD), the
first enabled public exchange that lists it: Binance, then Bybit's perpetuals and spot, then
Coinbase. The journal symbol is matched however it was written (BTC, BTCUSD, BTC/USDT,
XBTUSD, BTCUSDT.P), taking the exchange's most traded dollar pair unless you wrote a
particular stablecoin. The page says which instrument and source it used, and you can change
them. With no source enabled, nothing is requested and the page says what to enable.
Automatic loads never save estimates; that still needs the confirmation checkbox. A coin
booked as a CFD or forex shows the exchange's candles with a warning that its prices can
differ from your broker's.

Other instruments come from the keyless sources you enabled, each symbol checked in the
source's own search first:

- A **currency pair** (asset class forex, CFD or unset; EURUSD, EUR/USD, EUR_USD, EURUSD.x,
  EURUSDm): Yahoo Finance (`EURUSD=X`), then Kraken (`EURUSD`). A pair is never sent to a
  crypto exchange's coin of the same name (Binance's EURUSDT).
- A **stock or ETF** (asset class equity): Yahoo Finance as written (`BRK.B` is `BRK-B`
  there), then, when the trade needs daily candles anyway, Nasdaq as a stock or an ETF. A
  trade booked without an asset class is looked up this way too when no exchange lists it
  as a coin, and only if the source lists that exact ticker.
- A **future** (asset class futures; ESZ5, ESZ25, `ES 12-25`, /ES): Yahoo's continuous front
  month (`ES=F`), which can differ from your contract near a roll.

Yahoo and Kraken keep short intraday histories, so an older trade gets the finest candles
the source still has (a two-month-old trade 1h from Yahoo, not 5m). Options get no
automatic candles.

## What MAE and MFE mean here

These are **estimated gross position-equity excursions** over a closed position
cycle, relative to zero at entry. At each observation, equity equals cumulative
signed execution cash flows plus the marked value of remaining exposure, multiplied
by the configured contract multiplier. This includes realized partial exits and
handles scaling without applying the eventual position size to earlier candles.
MAE is the magnitude of the most negative equity; MFE is the largest positive equity.
Fees and currency conversion are excluded. These estimates are calculated on demand
and do not change recorded executions, realized P&L or aggregate dashboard metrics.

Highs and lows are sampled only from complete candles during an unchanged position.
Candles crossing an entry, exit or partial fill are excluded; execution prices are
also sampled. Consequently estimates can understate actual excursions. The sequence
of high and low within a bar cannot be inferred. The UI reports exclusions and gaps,
which may represent closed sessions or missing data. It does not claim full tick coverage.

No number is returned for missing entry/exit coverage, truncated history, no usable
complete candles, missing required multipliers, unmatched position cycles, or an
unconfirmed price basis. Reversing executions spanning multiple cycles are currently
unsupported. Option contract history needs a separate adapter capability and is
explicitly unavailable; underlying prices cannot substitute for option premiums.
LSE stock/ETF candles are split adjusted, so unadjusted historical fills cannot be
compared directly without reconciliation. Fills more than 20% outside the matching
candle price range trigger a mismatch warning, with estimates and fill overlays
withheld. This catches conspicuous demo-data or price-basis mismatches; it is not
a substitute for verifying the instrument and currency yourself.

Replay reveals a completed candle at each step, with fills through its close time.
Unrevealed candles and future fill labels are not passed to Vela, and final excursion
amounts are hidden while replaying. Boundary candles may include prices outside the
holding period. This is trade-review playback, not tick simulation or a blind backtest;
the rest of the trade detail page still contains the original trade's outcome.

## Architecture and credential handling

- `lib/market-data.ts`: normalized UTC candles, resolution and result contracts.
- `server/market-data/provider.ts`: provider interface for history and access checks.
- `server/market-data/connections.ts`: adapter registry and encrypted key storage.
- `server/market-data/london-strategic-edge.ts`: LSE REST transport and normalization.
- `lib/excursions.ts`: deterministic provider-independent calculation.
- `lib/trade-replay.ts`: chart input sliced at the replay cursor.
- `components/trade-market-data.tsx`: source controls and Vela rendering.

Add another adapter to the registry to expose it through the same connection and
trade controls. Provider-specific authentication and normalization stay in the adapter.
The current generic interface covers candles and connection tests; symbol discovery,
tick replay, option contracts, and exchange-calendar coverage are future capabilities.

Saved keys use the journal's AES-256-GCM credential storage. Browser status responses
contain only configuration state. Requests go from the server to fixed provider origins
using provider-specific authentication headers; redirects are rejected and provider error bodies are never relayed.
The application's existing optional password gate also protects these endpoints.
Set `JOURNAL_PASSWORD` when serving the journal beyond your trusted local environment.
Keys and candles are excluded from journal exports; candles are not persisted or shared
through a global cache. Use provider data within the permissions of your own account.

The adapter reads `/vault/candles` and tests `/vault/usage`, following the official
[LSE SDK](https://github.com/londonstrategicedge/lse-data/blob/main/lse/client.py)
and [changelog](https://github.com/londonstrategicedge/lse-data/blob/main/CHANGELOG.md).
The live endpoint requires date-only `YYYY-MM-DD` ranges, despite the SDK examples
accepting ISO timestamps. The adapter requests whole UTC date windows, then filters
candles to the trade interval. Ascending and descending reads must overlap to establish
coverage when a plan caps rows below the requested 5,000. Requests are limited to
12 reads (six windows) / 20,000 retained bars and 90 seconds overall (60 seconds per
fetch). Non-overlapping pages or reaching these bounds produces a truncated result
with unavailable estimates; select a coarser resolution. No automatic retry spends
additional quota after a failure.

Adapter tests use synthetic fixtures. A live AAPL request was also verified with a
user-supplied key. Permissions and instrument coverage remain specific to each account.

## Reports and saved estimates

Confirmed, valid MAE/MFE estimates are saved locally when a trade's history loads.
Reports → Trade explorer offers MAE vs net P&L, MFE vs net P&L, and MAE vs MFE presets,
as well as excursion axis selectors. MAE is a positive adverse amount; dot colors
always describe final net P&L, not the sign of an excursion. Excursions are gross,
while net P&L includes fees. Different saved candle resolutions may be represented;
these remain observed-candle estimates with the trade page's coverage limits.

Calculate missing estimates uses the active account and report filters, recorded
symbols, and 1-minute candles. Confirm matching instruments, price basis and account
currency first. Requests run sequentially, can be stopped, and successful results
remain saved. No data is requested just by viewing Reports. A failed or unsupported
trade remains missing rather than becoming zero. Custom symbol mappings or datasets
can be loaded from the trade detail page. Monetary scatter axes require a single
account currency; no FX conversion is applied.

Saved results are excluded when the underlying executions, trade identity, account
currency or contract multiplier changes. Deleting a trade deletes its derived result.
Existing estimates calculated before persistence was added need to be loaded once
again. Unchecking the calculation box loads candles/replay only and does not erase
an earlier saved estimate. Replay starts at 4× speed.

## Supported sources

Configure these under **Settings → Market data**. Connections are used only for
market prices; they do not create broker-sync accounts, place orders, or change Vela.
Public sources require an explicit Enable source action. No source is contacted just
because Settings or Reports is opened. **Charts** is the exception by design: an open chart
requests its symbol's candles and polls for new ones while visible and not paused (see
[charts.md](charts.md#live-updates) for the pace). For Binance, Bybit and Coinbase, an open
chart also makes the server hold a WebSocket to the exchange's public market-data feed
(`data-stream.binance.vision`, `stream.bybit.com`, `ws-feed.exchange.coinbase.com`) for
real-time trades. For these three, typing in the chart's symbol field searches the
exchange's public instrument list (fetched at most once an hour). Candle sizes a source does not offer (3m,
30m, 2h, 4h, 1w) are built from finer candles it does, aligned to UTC. The optional economic
calendar on Charts is a separate public feed, off until enabled (see
[charts.md](charts.md#economic-calendar)).

| Source                | Setup                                                                                                   | Symbols and coverage                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpaca                | Key ID and secret, or `ALPACA_API_KEY` + `ALPACA_SECRET_KEY`                                            | US stocks such as `AAPL`; choose IEX or SIP. Prices are raw/unadjusted. Choose Crypto for `BTC/USD`.                                                                    |
| Binance               | Enable source; no key                                                                                   | Binance spot pairs such as `BTCUSDT`, through its public market-data host. No futures or automatic quote-currency conversion.                                           |
| Bybit                 | Enable source; no key. Choose the market: perpetuals and futures (USDT/USDC), spot, or inverse          | Bybit v5 symbols such as `BTCUSDT` (perpetual and spot) or `BTCUSDT-26DEC26` (futures). Every candle size comes from Bybit itself. Contract volume is in base units.    |
| Coinbase              | Enable source; no key                                                                                   | Coinbase Exchange spot products such as `BTC-USD`. Empty intervals may have no candles.                                                                                 |
| Kraken                | Enable source; no key                                                                                   | Crypto (`XBTUSD`, BTC works too) and a dozen currency pairs (`EURUSD`, `GBPUSD`, `USDJPY`...). Only the latest 720 candles of each size exist there.                    |
| London Strategic Edge | API key in Settings, or `LSE_API_KEY`                                                                   | Historical candles for supported instruments and datasets; coverage depends on provider access.                                                                         |
| Market data CSV       | Upload and preview local candle files                                                                   | Exact recorded symbol and resolution, with declared quote currency and price basis.                                                                                     |
| Nasdaq                | Enable source; no key. Choose stock or ETF                                                              | US stocks and ETFs (`AAPL`, `SPY`), daily candles for the last ten years, split adjusted. Not a documented API. Indices are left out: their opens there are unreliable. |
| OANDA                 | v20 token, account ID, and Practice/Live; or `OANDA_API_TOKEN`, `OANDA_ACCOUNT_ID`, `OANDA_ENVIRONMENT` | Instruments such as `EUR_USD`. Complete midpoint candles aligned to UTC; volume is price-update count. Multiplier must match the imported quantity units.               |
| OKX                   | Enable source; no key. Choose spot or perpetual swaps                                                   | `BTC-USDT` (spot), `BTC-USDT-SWAP` (perpetual), years of 1m history, 300 candles a page. A perpetual's contract size is stated; set the multiplier to match.            |
| Yahoo Finance         | Enable source; no key                                                                                   | Stocks and ETFs worldwide (`AAPL`, `VOD.L`, `SAP.DE`), indices (`^GSPC`, `^IXIC`), futures (`ES=F`), currency pairs (`EURUSD=X`), crypto (`BTC-USD`). See below.        |

### Keyless sources and their limits

Free forex and stock candles without any key are rare: the documented free APIs (Alpha
Vantage, Finnhub, Twelve Data, Tiingo and others) all need at least a free key. The keyless
sources here were checked in September 2026:

- **Yahoo Finance** has the widest coverage but is not an official API. Yahoo throttles it
  and refuses some networks outright for a while; the journal then says so and waits (a
  429 pauses requests to it for 30 seconds). Intraday history is short: 1m candles for 30
  days (asked a week at a time), 5m to 30m for 60 days, 1h for two years; daily candles for
  the whole history. Prices are split adjusted and cover the regular session only. Hourly
  candles of markets that open on the half hour (New York stocks) open on the half hour.
  London prices are in pence, so their estimates stay in the price move only.
- **Nasdaq** answers from the JSON behind nasdaq.com. It serves daily candles only and
  returns nothing for a range shorter than about a week, so the journal asks a week wider.
- **Kraken** is an exchange API, stable and documented, but it keeps only the latest 720
  candles of a size (about 12 hours of 1m, 15 days of 30m, 30 days of 1h, two years of 1d).
  Its weeks open on Thursday, so its 1w candles are built from days, from Monday.
- **OKX** is a documented exchange API with deep history.

Not used: Stooq (now behind a browser check), Dukascopy (its widget feed only answers its own
site, and its data export needs an AWS account), and ECB or Frankfurter rates (one fixing a
day, no candles). `LIVE_MARKET_DATA=1 pnpm exec vitest run apps/web/tests/market-data.live.test.ts`
checks the four live sources.

Credential sets are encrypted together. Environment credentials take precedence;
partial environment configuration is shown as unavailable rather than mixing values
from the environment and saved settings. No saved field values are returned to the
browser. Test connection is an explicit, read-only market-data request.

Remote history is normalized to ascending UTC millisecond OHLCV. New network adapters
have bounded pages, a 20,000-candle result limit, timeouts and abort support. Alpaca
follows `next_page_token`; Coinbase, Binance, Bybit and OANDA use windows below their candle
limits. Limits produce truncated history and unavailable estimates, not false zeroes.
Known quote-currency mismatches block monetary estimates even if the confirmation is
checked. In particular, USDT is not treated as USD. Candles can still be replayed.
API failures return sanitized errors rather than upstream bodies or credentials.

### Market-data CSV format

Download the generic header-only template from Settings. It contains no provider name,
instrument, credentials or sample data. Supply one instrument/resolution per file:

```csv
time,open,high,low,close,volume
```

`time` is the candle-open timestamp, either ISO-8601 with `Z` or a numeric offset,
10-digit Unix seconds, or 13-digit Unix milliseconds. Header aliases include
`timestamp`, `datetime`, `date`, and `o/h/l/c/v`. Comma, semicolon and tab delimiters
are supported. If a `symbol` or `ticker` column exists, every row must match the
instrument entered in Settings. Volume may be omitted and is then zero; prices are
never invented. A CSV without volume cannot support volume-based analytics.

Validation rejects malformed OHLC ranges, nonfinite values, negative volume,
unzoned/invalid times, duplicate timestamps, mixed symbols, incomplete/future bars,
and timestamps that do not align to the selected resolution. Intraday bars may use
a consistent offset; daily candles must open at 00:00 UTC. Gaps are preserved.
Limits are 5 MB, 50,000 rows/file, and 50 datasets. Validation/preview writes nothing;
Import market candles saves the immutable dataset locally. It is separate from trade
execution imports and excluded from full journal exports. Files must therefore be
retained separately for backup.

On a trade, select Market data CSV and the matching symbol/resolution. Automatic
selection chooses a unique file covering the trade, or the unique matching file if
coverage is partial. Ambiguous files require an explicit dataset selection. Reports
can use automatic file matching with the selected resolution. Removing a dataset
also removes its saved derived estimates, leaving all trade executions intact.

### API references checked for this implementation

- [Alpaca stock bars](https://docs.alpaca.markets/us/reference/stockbarsingle-1) and [crypto bars](https://docs.alpaca.markets/us/reference/cryptobars-1)
- [Binance market-data-only endpoints](https://developers.binance.com/en/docs/products/spot/faqs/market_data_only)
- [Bybit v5 kline](https://bybit-exchange.github.io/docs/v5/market/kline), [instruments](https://bybit-exchange.github.io/docs/v5/market/instrument), [tickers](https://bybit-exchange.github.io/docs/v5/market/tickers) and [public WebSocket](https://bybit-exchange.github.io/docs/v5/ws/connect)
- [Coinbase Exchange candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles)
- [OANDA candle endpoints](https://developer.oanda.com/rest-live-v20/pricing-ep/) and [environments](https://developer.oanda.com/rest-live-v20/development-guide/)
- [OKX v5 market data](https://www.okx.com/docs-v5/en/#public-data-rest-api-get-candlesticks-history) (history candles, instruments, tickers)
- [Kraken OHLC](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data) and [asset pairs](https://docs.kraken.com/api/docs/rest-api/get-tradable-asset-pairs)
- Yahoo Finance's chart (`/v8/finance/chart`) and search (`/v1/finance/search`) and Nasdaq's historical quotes (`/api/quote/{symbol}/historical`) are undocumented; their shape was checked live.

## Performance and request limits

All remote adapters use the same server-side transport: at most eight active GETs
per process and 64 queued requests. Hosts are paced one by one: public exchange APIs
(Binance, Bybit: four at a time, 60 ms apart; Coinbase: three, 150 ms apart; OKX: three,
120 ms apart; Kraken: one a second) stay well under their published limits, the unofficial
Yahoo Finance and Nasdaq are asked one request at a time (700 ms and 500 ms apart), and every other host (keyed brokers with small free tiers) keeps two
at a time, 350 ms apart. Cache hits skip the pacing. Identical concurrent requests share one
upstream call. Cancelling a view or report releases its share; the upstream request is
cancelled when no consumers remain. HTTP errors are not cached, and 429 responses apply a
credential-scoped cooldown using Retry-After (or 30 seconds when it is absent). These are
application limits, not a guarantee that every provider plan permits the same request rate.

A history request is cut into the source's pages (1000 candles on Binance, 299 on Coinbase)
on a fixed grid counted from the epoch, and up to four pages are fetched at once. Because a
page is the same URL from one request to the next, a chart reopened or a timeframe switched
back gets its older pages from the cache; only the newest page is fetched again. Past the
depth cap (20,000 candles) the oldest pages are the ones left out, and the result is marked
truncated. Binance's symbol details are fetched alongside the candles and kept for an hour.

Candles that ended more than five minutes ago never change, so their pages are cached in
memory for an hour; recent data and metadata expire after 15 seconds. Cache identity
includes the exact URL, feed and a hash of the credential headers. Connection tests bypass
the cache. The cache holds at most 512 responses and 64 MiB of serialized payloads (decoded
objects add overhead), and is lost on restart. LSE's ascending and descending coverage
checks run concurrently and both remain required; trades sharing a date window reuse those
pages. Provider outages, latency and plan quotas can still cause waits: a single Binance
page can take one to several seconds to arrive.

CSV imports validate once per import. Dataset bounds and counts are materialized
in SQLite, with an additive upgrade for existing files. History selects metadata
first, decodes only the chosen file, then uses binary search to slice the requested
range. At most 200,000 decoded candles are retained across immutable files. Removal
invalidates the local cached file and its saved estimates. Large first-time CSV
imports still perform bounded synchronous parsing (5 MB / 50,000 rows).

Report calculations request estimates and metadata without transferring candles,
and do not impose a one-second pause after every trade. They remain sequential
and cancellable, and stop after three consecutive unavailable results. Saved
estimate reads batch currencies and execution records while retaining fingerprint
invalidation. Replay reuses each computed frame, coalesces chart updates during
rapid scrubbing, and stops advancing while the page is hidden. Vela still renders
the charts, with 4× replay speed as the default.
