# Importers

Every importer produces normalized **executions** (fills). Trade-level exports are
reconstructed as one entry + one exit execution at the reported average prices. P&L is
preserved exactly; fill-level granularity is not (the warning says so on import).

Nothing is guessed silently: a file that doesn't match a known signature goes to the
column mapper, where the user maps their own headers.

## Formats and validation status

Parsers are **alias-driven**: every column is matched through a list of header aliases,
so fixing a drifted header is a one-line change.

Two validation tiers:

- **Cross-checked**: header set verified against _field sources_, meaning code that
  parses real user exports in the wild (TradeNote's community broker parsers¹, a
  real-user TradeZella converter², platform export docs), with fixtures in
  `packages/importers/tests` shaped from those sources.
- **Real file**: verified against an actual export file from a live account
  (the most valuable contribution this repo can receive).

| Format                             | Kind                         | Detection                             | Cross-checked | Real file |
| ---------------------------------- | ---------------------------- | ------------------------------------- | ------------- | --------- |
| TradeZella                         | trades → reconstructed fills | header signature + P&L reconciliation | ✅ (partial²) | ☐         |
| Tradervue                          | fills                        | header signature                      | ✅ (docs³)    | ☐         |
| TradingView (paper history)        | fills                        | `Fill Price` header                   | ✅ (docs)     | ☐         |
| MetaTrader 4 (HTML statement)      | trades → reconstructed fills | HTML + MetaTrader markers             | ☐             | ☐         |
| Interactive Brokers (activity CSV) | fills                        | `Trades,Header` section rows          | ☐             | ☐         |
| Interactive Brokers (Flex Query)   | fills                        | `ClientAccountID`/`Date/Time` headers | ✅¹           | ☐         |
| ThinkorSwim / Schwab (statement)   | fills                        | `Account Trade History` section       | ✅¹           | ☐         |
| NinjaTrader                        | fills                        | `Instrument`/`Action` headers         | ✅¹           | ✅ (#10)  |
| Tradovate                          | fills (Filled only)          | `Contract`/`B/S`/`Fill Time` headers  | ✅¹           | ☐         |
| TopstepX                           | fills (Filled only)          | `ContractName`/`ExecutePrice` headers | ✅¹           | ☐         |
| Webull (orders, both variants)     | fills (Filled only)          | `Status`/`Filled` headers             | ✅ (docs)     | ☐         |
| DAS Trader Pro                     | fills                        | `Symb`/`B/S` headers                  | ☐             | ☐         |
| MetaTrader 5 (deals report)        | fills                        | HTML/CSV deal table signature         | ☐ (fixtures)  | ☐         |
| TradingView (strategy list)        | trades → reconstructed fills | `List of trades` headers              | ☐ (fixtures)  | ☐         |
| Generic (column mapper)            | fills                        | user-mapped                           | n/a           | n/a       |

¹ [TradeNote community broker parsers](https://github.com/Eleven-Trading/TradeNote/blob/main/src/utils/brokers.js):
real-user headers for Tradovate (`Fill Time`, `B/S`, `Filled Qty`, `Avg Fill Price`,
`Status=Filled`), TopstepX (`FilledAt`, `Side=Bid/Ask`, `PositionDisposition`,
`ExecutePrice`, `Size`), NinjaTrader (`Instrument`, `Action`, `E/X`, `$`-prefixed
`Commission`), IBKR Flex (`Date/Time` as `YYYYMMDD;HHmmss`, `Buy/Sell`, negative
`Commission`), ThinkorSwim section boundaries.
² [TradeZella_STB converter](https://github.com/drasticstatic/TradeZella_STB):
confirms `Open Date`, `Status` (win/loss), `Net P&L`, `trades_*.csv` filename, and
custom journal columns; TradeZella's own docs confirm timezone abbreviations may ride
in time fields (stripped by our date parser).
³ Tradervue's published generic format: `Date, Time, Symbol, Quantity, Price, Side` +
`Commission`/`TransFee`/`ECNFee`; TradingView's export docs: `Symbol, Side, Qty,
Fill Price, Closing Time` (+ optional `Type`, `Status`, `Commission`).

Known variants NOT yet handled (send a sample!): MetaTrader 5 xlsx "Trade History
Report" (the MT4-style `.htm` statement works), TradeZella exports with custom column
selections beyond the defaults.

## Sharp edges the parsers handle

- Quoted fields, embedded commas/newlines, BOM, `;`/tab delimiters (RFC 4180 parser,
  zero dependencies)
- `$1,234.56`, `(45.20)` and `$-12.50` negatives, European `1.234,56` decimals. A comma
  that cannot be a thousands separator is a decimal comma (`0,005`, `42000,50`,
  `0,12345`). A value such as `1,500` reads either way: fill exports decide from their
  other values (`185,50` proves decimal commas, `185.50` a decimal point), and when nothing
  in the file decides, it is read as thousands and the preview warns
- Naive timestamps interpreted in the **statement's timezone** (DST-safe two-pass
  conversion), explicit offsets and a `UTC`/`GMT` suffix honored as-is. Other zone
  abbreviations (`EST`, `CDT`, ...) are ambiguous, so they are stripped and the statement's
  timezone applies. A date such as `01-05-2026` without a time is a date, never an offset
- ThinkorSwim option legs (Type `CALL`/`PUT`) are their own contract, named from Symbol,
  Exp, Strike and Type (`AAPL 17 JAN 26 190 CALL`), never netted with the stock; set the
  contract multiplier (usually 100) for that symbol in **Settings → Journal**. A leg without
  its expiry or strike is skipped with a warning
- Sides: `Buy`/`B`/`BOT`/`Bid`/`BC`/`Cover`/`Buy to cover` are buys, `Sell`/`S`/`SLD`/`Ask`/
  `SS`/`Short Sell`/`Sell short` are sells. A fill row with any other side is skipped and the
  preview names the values
- Fills that share a timestamp keep the file's row order when the file lists fills
  chronologically (oldest or newest first), so a buy and sell in the same second always
  make the same trade. A file whose rows are not in time order proves no order for them
- Slash dates (`04/03/2026`) follow the order the file proves (a first number above 12 means
  day-first); a file that settles nothing is read month-first with a warning
- TradeZella P&L: the row's stated net P&L is kept exactly (commissions are the fee and the
  rest is the reported gross), so imported history agrees with the trader's old numbers to
  the cent with or without a contract multiplier; fees are never negative. Separate date
  and time columns are combined. A row without a Long/Short side is skipped with a
  warning, never assumed to be long
- Trade-level rows (TradeZella, MetaTrader) each stay their own trade, even when two
  trades on one symbol overlap in time
- MetaTrader 4 HTML statements: each trade's gross P&L is the statement's own Profit (no
  contract size needed); Commission and Swap are signed, so a swap credit adds to the trade
  and a credit larger than the commission gives a zero fee, never a negative one. A
  statement whose header is not recognized falls back to the older positional reading, where
  P&L comes from prices and the contract multiplier
- Content-hash dedup on insert: re-importing the same file with the same timezone is a no-op

## NinjaTrader execution exports

Each source account gets a saved identity inside the selected journal account.
Copy-traded positions and full contracts stay separate, even when their fills are
identical or their displayed symbols share a root such as `ES`. Account/connection
labels become aliases for that identity. If a later export renames or omits them,
map it to its existing source in the preview; choose **Create a separate source
account** only for a different account. Saved aliases cannot be reassigned.

When available, include the **ID** column from NinjaTrader's
[Executions grid](https://ninjatrader.com/support/helpGuides/nt8/executions_tab.htm).
It identifies an execution; **Order ID** can be shared by several partial fills.
`Execution ID` is also recognized. Native IDs are scoped to the saved source.
Re-exporting an execution adds no fill. Changed commissions are shown as corrections
and require explicit approval. Changed price, quantity, direction, instrument,
timestamp, or ordering facts stop the import for separate reconciliation.

Without execution IDs, the importer preserves the count of identical fills.
Re-importing the same file, or changing its row order, adds no fills. A changed
overlapping export requires confirmation that it contains **all executions for
each source contract between its first and last timestamp**. It must retain every
previously imported fill in that interval; the importer never silently deletes
missing fills. Do not confirm completeness for a partial selection. An exact
repeated export and a new set of indistinguishable fills cannot be told apart
without more source information. Keep execution-ID columns consistent across
exports or recover the complete history in a new journal account.

CSV display order is not treated as execution chronology. Timestamp ties require
an unambiguous order from Entry/Exit facts or a reliable numeric `Sequence` /
`Execution Sequence` column. Execution IDs are not assumed to be sequential.
Ambiguous fills and exits with missing opening history stop the import. Invalid
rows and malformed commission values also stop it, rather than rebuilding
positions from an incomplete file. A blank commission uses configured default
fees (or zero); an explicit zero stays zero.

Configure a positive contract multiplier for each exact imported futures symbol
in **Settings → Journal**, then review again. For the anonymized
[issue #10](https://github.com/LuxAlgo/trade-journal/issues/10) fixture, `MNQZ6=2`
produces five closed trades, 26 executions, and $5,265 before fees. Setting only
`MNQ=2` does not apply to `MNQZ6`; the new import is blocked until its multiplier
is configured. The sample supplies no commissions, so default fees can change
net P&L. This fixture validates the full row counts and arithmetic; it does not
prove the completeness or execution sequence of every possible broker export.

The review shows new fills, duplicates, proposed fee corrections, source mappings,
contract multipliers, and the destination account's resulting closed-trade P&L
and open/closed trade counts. Saving recomputes this plan in one transaction. If
the file, review choices, account, journal, or relevant settings changed since
preview, review it again. A failure rolls back fills, corrections, mappings and
import history together. Source mappings and import history are included in the
full JSON data export. Keep the statement timezone consistent with prior imports;
a changed timezone requires recovery into a new journal account.

### Previously imported NinjaTrader files

The old importer could discard real executions and source-account identity.
Re-importing with new identities on top of those surviving fills would double-count
them. Matching legacy fills therefore block the new import before any writes.
Import the complete original export into a **new journal account**, compare totals,
and select that account when reviewing the recovered trades. The old account and
its annotations remain unchanged. Do not include both old and recovered accounts
in aggregate reports. There is no automatic transfer of annotations from an old
merged position to its separate source-account positions.

The regression fixture is the reporter's anonymized CSV in
`packages/importers/tests/fixtures/ninjatrader-copy-trades.csv`; the expected result
treats its identical rows as separate executions, as stated by the reporter.

## Timestamp parsing upgrades

IBKR activity timestamps such as `2026-01-05, 09:30:00` retain the time after the
comma. Offset-free ISO, US and named-month timestamps retain up to three fractional
second digits; unsupported precision, trailing garbage and invalid calendar/time
values are rejected instead of silently losing part of the value. Explicit UTC
offsets remain authoritative.

Earlier imports may have stored IBKR timestamps at local midnight or dropped
fractional seconds. Reimports that match those earlier representations are blocked
before any writes: recover the complete corrected history in a new account and
compare totals and reviews. The same guard conservatively stops indistinguishable
whole-second fills; it does not guess whether they are legacy rows or genuine new
executions. Manual entry and broker sync are not subject to this file-import guard.
Existing timestamps are not automatically rewritten.

## Statement and display timezones

In **Settings → Journal**, set **Display timezone** to the zone you want for trade
times, analytics, calendars and journal days. Set **Default import timezone** to
the zone used by your broker's statement. On **Import → File upload**, you can
override the **Statement timezone** for an individual file without changing either
saved setting. The preview shows the first five executions in your display zone;
check these before importing. Changing the statement timezone requires a new preview.

All three timezone fields use a searchable picker. Search by city or timezone,
then select a result. The list includes the runtime's primary timezone names and
UTC. Existing aliases remain available; if a valid full timezone name is absent
from the main list, searching its exact name offers it as a selectable result.
Search text is not saved until you select a valid option.

For example, use `Europe/Helsinki` for a Helsinki-based MT5 statement and
`America/Asuncion` for your journal. The synthetic
[`mt5-timezone.html`](samples/mt5-timezone.html) has an entry at July 5, 2026, 04:00
and an exit at 04:30 in Helsinki. These are stored as 01:00 and 01:30 UTC and appear
as **July 4, 22:00 and 22:30** in Asunción, including in the trade list and journal.
Timestamps with an explicit offset, `Z` or a `UTC`/`GMT` suffix retain that instant
regardless of the statement timezone. Manual entry continues to use the device timezone.

Existing installations initially use their previous timezone as the import
default. Saving a display-only timezone change preserves that previous import
default. Neither setting rewrites stored executions.

### Correcting an earlier import

Changing the import timezone does not repair existing timestamps. Re-importing
with a different timezone creates different execution hashes and can add duplicate
trades. Before correcting data:

1. Make a full copy of the data directory with the app stopped, as described in
   [Export and backup](../README.md#export-and-backup), and retain the original statement.
2. Import into a separate test account with the correct statement timezone first.
   Verify the preview, execution times and journal day against the original report.
3. In the affected account, select and delete only the trades from the incorrect
   import, then import the original statement with the verified timezone. Trade
   deletion removes its executions and annotations; preserve notes, tags and linked
   material separately before deleting. For mixed or overlapping imports, reconcile
   which executions belong to the affected trades before deleting them.

There is no automatic bulk time shift: files can use different zones, explicit
offsets, and daylight-saving rules. A fixed hour adjustment is not reliable.

A single wrong value (a price, a time, a missing or extra fill) can be corrected on the
trade itself with **Edit fills**; see [trade-corrections.md](trade-corrections.md).

## Parsing fixes and earlier imports

A fill's dedup identity is its symbol, side, quantity, price and timestamp (plus the source
id and group for history exports); fees and reported P&L are not part of it. Facts that only
shape how trades are rebuilt (the trade a reconstructed fill belongs to, the order of fills
at the same instant, the statement's P&L) are stored with legacy-format fills outside that
identity, so a file imported before a fix still matches the rows it saved and re-importing
it adds nothing. Those earlier rows keep the facts they were saved with: to rebuild them
with a fix, delete the affected trades (which removes their fills and annotations) and
import the file again.

Where a fix changes an identity field itself, the importer also reports what the earlier
parser read. A re-import that would place corrected fills next to rows the earlier parser
saved is refused before any writes, as for the timestamp upgrades above; recover the
corrected history in a new account, or delete the affected trades first.

- **MetaTrader 4 HTML statements** now read the statement's Profit, Commission and signed
  Swap. The fills keep the identity the earlier parser gave them, so earlier imports
  deduplicate; their trades keep the old price-based P&L and swap-as-fee until re-imported.

- **TradeZella exports** keep the stated net P&L as reported P&L instead of folding a
  difference into the fees (which could be negative), and overlapping trades on one symbol
  stay separate. The fills keep their identity, so earlier imports deduplicate and keep
  their earlier P&L and merged trades. Where the export has separate date and time
  columns, the earlier parser saved midnight: the corrected timestamps are a new identity,
  and a re-import over those midnight rows is refused.

- **Fills at the same second** in fill exports carry their file order as a reconstruction
  fact. Earlier imports deduplicate, and their tied fills keep the order they had.
- **ThinkorSwim option fills** were saved under the underlying's symbol, merged with its
  stock trades. They are a new identity now, and a re-import over those rows is refused;
  delete the merged trades (or recover into a new account) before importing again.
- **Decimal commas** such as `0,005` were read as thousands (`5`). Corrected quantities and
  prices are a new identity: re-importing a fill export over rows saved with the earlier
  reading is refused. History exports (TradingView strategy, MetaTrader, generic mapper)
  read `0,005` correctly too, but do not recognize rows saved with the earlier reading;
  delete those trades before importing the file again.

- **Timestamps**: a `UTC`/`GMT` suffix used to be read in the statement timezone, and a
  dash-separated date without a time (`01-05-2026`) in the server's own timezone. Both
  now give a different instant when the statement timezone is not UTC; fill exports and
  TradeZella refuse a re-import over rows saved with the earlier reading. TradingView
  strategy and MetaTrader history files whose slash dates prove day-first were read
  month-first (rows with a day above 12 were skipped); they now import correctly, but rows
  saved earlier are not recognized, so delete those trades before importing again.

## Sample file

[`docs/samples/demo-trades-tradingview.csv`](samples/demo-trades-tradingview.csv) is a
synthetic TradingView paper-trading export: 13 symbols, about 2,000 fills, March 2025
through September 2026. Drop it on **Import → File upload** to try the importer end to
end. It is generated data, not a real account.

## Adding a format

1. Add a spec to `packages/importers/src/formats/`; most CSVs are a declarative
   `makeFillsFormat({...})` with header aliases.
2. Register it in `src/detect.ts` (content-signature formats before header-signature
   ones).
3. Add a fixture test in `tests/importers.test.ts` with a real (anonymized) export.
