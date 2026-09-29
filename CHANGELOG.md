# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Habits on Reports: revenge trades, trading on after losses, sizing up after a loss, size creeping up and results fading later in the day, each against the rest of your trades with what it cost; the AI chat reads the same numbers (see [docs/ai-coaching.md](docs/ai-coaching.md))
- Lessons that keep coming back: Keep and Fix items from your day notes grouped when they say the same thing, with weeks in a row, on the Daily journal and in recaps, weekly reviews and the AI chat
- Trade critiques read the market around the trade (where the entry sat in the day's range and against VWAP, how far price went for and against it, how much the exit kept, what happened after) and the replay chart's picture
- Playbook check: the AI judges a trade against each written rule of its playbook, with evidence, and you apply the verdicts to the rule review
- Draft the day's plan: the AI proposes a bias and scenarios from the chart's levels and the previous session, and you add the ones you agree with
- Levels from a screenshot: the AI reads the horizontal levels and zones of a chart picture, and the ones you tick are drawn on the chart
- Monthly and quarterly reviews tied to goals: measurable or written goals per period, measured live, suggested goals for the next period, and a review written as a chat
- Search your notes by meaning (with OpenAI or Gemini embeddings; by words otherwise), and find similar past days and trades
- Suggested tags, mistakes and ratings for a trade or up to 20 selected trades, applied with a click
- Import: the AI suggests the column mapping for an unrecognised statement, which you check and preview as before
- Voice memo to note: dictate freely and the AI sorts it into a note with Keep and Fix lists, which you check before adding
- Scheduled AI digests: a session recap after the close and a weekly review, written by the AI chat on the days and times you choose and sent as push notifications or to your webhook (such as ntfy); tap one to open it as a chat and ask follow-ups. Off until switched on under **Daily journal → Scheduled digests**; amounts stay out of notifications unless you choose otherwise
- Chart alerts explain themselves: each notification says what the level is to the analysis's plan (it sets off a scenario, with its target and stop, reaches a target or invalidates a scenario), or whether the move is with or against your bias
- AI chat: **Ask your journal** (Reports), **Ask about this day** and a chat under each trade's AI review. The AI looks things up itself with read-only journal tools (totals, trade search, stats grouped by any Reports dimension, a trade's fills and notes, the candles around a trade, a day's note and plans, chart analyses), always within the conversation's accounts and filters. Follow-up questions continue the conversation, which is saved and can be reopened or deleted; a chat can start from a recap or critique. See [docs/ai-chat.md](docs/ai-chat.md)
- AI answers appear as they are written: chat answers (with each lookup shown as it runs, and **Stop**), trade critiques, recaps and the weekly review
- Google Gemini as an AI provider for recaps, trade critiques and "ask your journal": choose it in **Settings → AI** with a Gemini API key (or `GEMINI_API_KEY` on the server); default model `gemini-3.8-flash`, chart images included
- Bybit as a chart source: public candles and real-time prices for perpetuals and futures (USDT/USDC), spot and inverse contracts, no API key; enable it in Settings and choose the market next to the symbol
- Symbol search on Charts for Binance, Bybit and Coinbase: typing in the symbol field suggests the exchange's instruments, the most traded first
- Sign in with an OpenID Connect provider such as Authentik, Keycloak or Zitadel (`JOURNAL_OIDC_*` settings, see [docs/authentication.md](docs/authentication.md)): authorization code flow with PKCE, state and nonce, ID token signature and claim validation, an allow-list of groups, verified emails or subjects, server-side sessions, **Sign out** in the sidebar (optionally ending the provider session too) and back-channel logout. Password sign-in keeps working and can be used alongside it
- Chart analyses carry a trading plan: bias, playbook and scenarios with trigger, target and invalidation prices (a price can be taken from the selected line)
- Journal days review each analysis: what price did against its levels and zones, the day type (trend or range, quiet or volatile, news), each scenario's grade suggested from the day's candles and confirmed by you, the day's trades linked to the plan or a scenario with on-plan and off-plan totals, and what changed since the previous day's version
- Daily journal: a weekly AI review (trades, plan grades, trades from a plan, Keep and Fix lessons) and results by day type
- AI recaps and critiques read chart analyses as numbers: every drawing's prices, the plan and its grades, the day's price action, changes since the previous day and, for unfiltered recaps, the day's trades and earlier days of the same type
- Chart drawing toolbar can be hidden for more chart (remembered apart for full screen), with a small control on the chart to bring it back or leave full screen
- Drawing templates, as in TradingView: save a tool's look (colours, line styles, text, Fibonacci levels and ratios, Elliott wave degree) under a name, apply it to selected drawings, and star one as the default for new drawings; built-in Fibonacci and Elliott templates included
- Elliott wave degrees (Grand supercycle to Subminuette) that relabel a wave count in its notation, such as ①②③, (1)(2)(3) or (i)(ii)(iii)
- Chart layers: drawings can sit inside other drawings (an Elliott wave holds its sub-waves), numbered like an outline, with draw inside, focus on a wave, hide what is inside, go to a wave, and duplicate or delete a whole tree
- Chart sidebar cards (and the journal records and economic calendar blocks) fold to their title bar, with a short summary, remembered per browser
- 32 more built-in indicators: WMA, Hull, VWMA, ALMA, SMA 50/200, Parabolic SAR, Ichimoku, linear regression, Aroon, Keltner, Bollinger bandwidth, standard deviation, historical volatility, Chandelier exit, Stochastic RSI, CCI, Williams %R, momentum, ROC, TSI, CMO, Awesome oscillator, volume with average, MFI, Chaikin money flow, accumulation/distribution, PVT, and signal scripts for golden/death crosses, MACD crosses, Bollinger breakouts, Supertrend flips and swing points
- Chart multiview (optional): two to four full charts at once, each with its own symbol, candle size and analysis (drawings, layers, indicators, zones, alerts, autosave, day versions), with synced crosshair and time window. The page controls follow the chart you click.
- Installable web app: install the journal from the browser (desktop, Android, iPhone) with its own window and icon
- Background alerts: the server keeps watching an analysis's lines and zones with no page open and sends Web Push notifications to your browsers or installed app, or to a webhook such as ntfy
- Chart appearance: chart type, colours, grid, crosshair, text, price scale mode, decimals per symbol and time axis zone; ready-made and saved looks; a look per symbol; symbol display names, colour tags and a watchlist; starting styles per drawing tool (remembered from the last used), custom ink colours; defaults for candle size, live, volume, magnet and stay-in-drawing mode; all saved on the server
- Layers panel, docked beside the chart (also in full screen) with a toolbar toggle: drag and drop for layers, folders and drawings, find and filter drawings, check several for bulk show, hide, lock, move, restyle, reorder, duplicate or delete, drawing names, per-drawing visibility and lock, layer colours, show only one layer or folder, duplicate a layer with its drawings
- Day versions of chart analyses: the analysis stays one live board, and each journal day you edit it keeps a frozen copy (drawings, zones, indicators, notes and picture) shown on that day's journal page, openable read-only over current candles and restorable as the live version; day notes and AI reviews use that day's version
- Real-time charts for Binance and Coinbase: the server relays each exchange's public trade feed over Server-Sent Events, so the forming candle moves with every trade; other sources keep polling
- Charts show your journal trades (fills, entry to exit with WIN/LOSS and P&L, open positions with stop and target; click to open the trade), with switches to hide all trades or only closed ones, and missed trades as violet diamonds logged straight from the chart
- Support and resistance zones on Charts: price ranges with a role that follows price, counted touches and breaks, role flip on a break, zone alerts, saved with the analysis
- Market session opens and closes (Sydney, Tokyo, London, Frankfurt, New York) and an opt-in economic calendar (ForexFactory weekly feed, stored locally, filtered by impact and currency) on the chart time axis
- Configurable timeframe bar with 3m, 30m, 2h, 4h and 1w candles (4h shown by default); sizes a source lacks are built from finer candles
- AI recaps and trade critiques include linked chart analyses, with their notes, drawings and zones as text and the snapshot as an image
- Chart indicators in Pine Script, run by PineTS in a Web Worker: 15 built-ins (moving averages, VWAP, Bollinger, Donchian, Supertrend, ATR, RSI, MACD, Stochastic, ADX, OBV and signal scripts), a Pine editor with errors and line numbers, a "My indicators" library, settings and visibility saved with each analysis, and indicator `alert()` messages in chart alerts. Adds AGPL-3.0 dependencies (`pinets`, `@luxalgo/vela-pinets`) with reviewed license-gate exceptions
- Charts: a live Vela chart for any symbol from your market-data source (latest candles on open, automatic updates, older history on scroll back), stylus drawing (pen, highlighter, hardware eraser, palm rejection), automatic saving per symbol, drawing layers grouped in folders, line-crossing alerts, and journal embeds that reopen the chart
- Customizable dashboard: drag cards to rearrange, hide and restore them, save named layouts; responsive layout with a mobile navigation drawer
- Privacy mode that masks monetary values across the app while keeping counts, ratios and chart shapes
- Markdown notes with formatting toolbar, reusable templates, exact trade links, and image/PDF attachments on trades, days and notebook notes
- Advanced report filters, comparison groups, a two-way cross-analysis matrix, and additional breakdowns (asset class, month, entry/exit hour, position size, planned/realized R)
- Playbook rule checklists per trade with adherence rates and followed-vs-broken performance
- Routines with weekday schedules and completion history; a missed-opportunity log kept out of trading metrics
- PDF and PNG review exports; JSON export now includes folders, templates, rule assessments, routines and defaults
- Configurable breakeven tolerance, default fees, and default stop/target distances per account and symbol
- Importers: MetaTrader 5 deal reports and TradingView strategy exports
- Realized R accounts for contract multipliers and scaled entries
- Optional historical market data connections (London Strategic Edge, Alpaca, OANDA, Binance, Coinbase, or your own candle CSV) with estimated MAE/MFE and candle replay on closed trades
- Prop firm tracker: evaluation and reset costs, refunds, payout requests, receipts, cash ROI, renewals, attachments, CSV import and export
- Calendar insights, rolling performance trends, and a trade explorer scatter in Reports
- Light mode, a collapsible sidebar, and friendlier AI setup and error notices

### Changed

- Charts are faster with many drawings and live prices: the layers panel no longer slows down with deep wave counts, live ticks only redraw the price, bulk drawing edits refresh once, zone statistics and trade labels are not recomputed on every tick, and saved analyses, day versions and background alert checks read far less from the database
- Vela upgraded to 0.7.7 (required by its Pine add-on)
- Data loads render as React transitions, so a tab change paints progressively instead of freezing while every card and chart mounts at once
- The development server runs on Turbopack, roughly halving first-visit compile times when switching tabs in `pnpm dev`
- Removed the gradient accent bar and gradient Edge Score number; the active nav item and the score now use the solid brand blue
- Trade pages chart recorded fills only and never contact a data provider on open; market candles load only from a data source you choose
- Gross profit and gross loss now include every closed trade, so trades labeled breakeven by a tolerance still count; the Edge Score version is bumped to 2
- Reports and dashboard aggregation reuse daily totals and equity for large histories; charts load only the components they use
- Executions are validated and written together with their recomputed trades in one transaction
- Node 22 or newer is required (already required by the AI dependencies)

### Fixed

- A crypto trade's page shows its candles by itself when Binance, Bybit or Coinbase is enabled, however the symbol was written (BTC, BTCUSD, XBTUSD, BTC/USDT, BTCUSDT.P); candles now include the market before the entry and after the exit, open trades show candles up to now, and a coin booked as a CFD (a broker's BTCUSD) is no longer refused
- Charts load faster: candle pages are fetched several at a time on a fixed grid (so older pages come from the server's cache when a chart is reopened), public exchanges are no longer throttled like keyed brokers, Binance symbol details are cached, the chart engine downloads while the page loads, and the symbol search no longer downloads an exchange's whole listing before you use it
- Charts pan and zoom smoothly with drawings on them: drawings sit over the candles instead of being re-uploaded to the graphics card on every frame (a drawing sent to the back still goes under)
- Pages no longer prefetch every sidebar link on load, which slowed the page's own requests; a link is prefetched when you point at it
- An AI answer that came back empty showed "AI request failed" instead of saying it returned no text (or that the provider's safety filter blocked it)
- A chart opened on a long saved view loads all of its candles (up to 20,000): it stopped at the newest 5000, so on 1h and shorter charts the start of the view stayed empty and a volume profile over it counted only the recent part, which moved its POC and value area towards recent prices
- The volume profiles' value area holds at least its 70%: it stopped before the row that would take it past the share, so VAL to VAH could hold less (69.6% on a BTC test range, with a heavy row just above VAH left out)
- Built-in Historical volatility is TradingView's HV (length 10, annualised by weeks on weekly candles and above; it was 2.6 times too high on weekly charts), and new SMA, EMA, WMA, Hull and ALMA indicators start at TradingView's length of 9 and the Stochastic at its %K smoothing of 1. Indicators already on a chart keep their settings
- Fibonacci and position tool labels show prices with the instrument's decimals; they were rounded to 2, so every level of a EUR/USD retracement read "(1.08)"
- The date and price range shows the price change in the instrument's decimals, a negative bar count when measured back in time, and durations that never read "1d 24h" or "1h 60m"
- Fibonacci retracements put level 0 on the second point and 1 on the first, as TradingView does (Vela measured from the first point, so a retracement drawn low to high showed 0.618 where TradingView shows 0.382), with TradingView's **Reverse** setting. Retracements drawn before keep their levels (they open with Reverse on)
- The built-in VWAP indicator is now TradingView's VWAP: session, week, month, quarter or year anchors, deviation bands (band #1 shown), "hide on 1D or above", and a session time zone for stocks and forex (it reset at midnight UTC for every market)
- Volume profiles and their value area match TradingView: the fixed range volume profile counted a candle's whole volume in every row its open, high, low and close touched; both profiles now spread volume over each candle's range, are built from finer candles (1m, 5m, ... as TradingView picks them), and grow the value area row by row from the point of control. The anchored VWAP starts at the candle holding its anchor
- Charts load 2000 candles instead of 500, so indicators match TradingView: a session VWAP on 1m saw only the last 8 hours of the day (off by $80 on BTC in a test), and an EMA 200 had not settled
- Drawings that read finer candles (the volume profile, the magnifier) no longer fail with "Choose a start date before the end date"
- Duplicating or pasting a drawing keeps its source's look instead of restyling the copy with the tool's default template or ink
- Pine scripts with very long expressions or condition chains no longer fail with "Maximum call stack size exceeded": a script too deep for the indicator worker runs on the page instead, and one too deep for both explains how to split it
- Chart pattern tools: the Elliott impulse is placed on six points (0-1-2-3-4-5, five waves) and the correction on four (0-A-B-C, three waves), instead of Vela's five and three points; the Shark harmonic is labelled 0-X-A-B-C. Wave drawings made with the old point count keep their points and labels
- Password protection now verifies the session signature on every API route. Previously, when `JOURNAL_PASSWORD` was set, any request carrying a cookie of the right name was accepted, so a forged cookie could read the journal.
- Journal day reviews in time zones west of UTC: the "range against the average" no longer counts the day itself among the previous days, and a chart from a daily candle file describes the day by that day's candle instead of the next one
- A journal day in a time zone whose clocks spring forward at midnight (Chile, Cuba, Paraguay) starts at 01:00 that day instead of 23:00 the evening before
- AI "similar earlier days": each trade counts under the daily candle it closed in and the day being reviewed is typed from its own daily candle, so trades no longer land on the neighbouring day and days are compared like with like. "Results by day type" matches trades to candles the same way, which fixes sources whose daily candles open at the exchange's midnight
- Day review trade times are shown in the journal's time zone (they were in the browser's), and the section is named "Trades opened this day" to say which trades it lists. Economic event times on charts and in the calendar list name their time zone
- Plan grading: a scenario whose trigger candle also reached its target or invalidation is suggested as unclear. It was graded from the following candles only, so a stop hit in the trigger candle could read as played out, and a target reached there as still open
- Line alerts (on the page and in the background) no longer fire "crossed above" when price only touches a line, and no longer miss the real break that follows; a sloped line passing through a flat price now counts as a crossing
- Support/resistance zones and day review levels count a touch or break by the first candle they scan (judged from its open), so a level tested at the day's open no longer reads "held (0 rejections)"
- The built-in Linear regression channel draws its bands from the spread of the closes around the fitted line, as TradingView does; they used the spread around the mean, which on a trend made them many times too wide
- Built-in Williams %R, CCI and MFI show no reading on a flat market or without volume, instead of a fixed value that read as an extreme (%R 0, MFI 100)
- Live charts show the candle still forming, as documented: the server dropped it from chart history, so polled sources (Alpaca, OANDA) showed the last finished close (up to a whole candle old, a day on 1d) and a Coinbase chart started today's candle at the first streamed trade, with the wrong open, high, low and volume. Background alerts on polled sources also follow the forming candle now. Estimates still use finished candles only
- Coinbase live candles no longer count the last trade again on every reconnect (Coinbase re-sends it when subscribing)
- A slow history answer for a chart or timeframe you already left no longer sets the price header, and so can no longer fire line alerts for every line between two symbols' prices. A chart that fails to open shows why and releases its data feed and indicator worker
- Charts on built candle sizes (4h, 2h, 30m, 1w on most sources) no longer lose their newest candle, or on London Strategic Edge whole months, when scrolled to the deepest history: the finer candles asked for now always fit one request, and a capped answer keeps its newest candles
- Charts no longer lose unsaved edits when you open another symbol or analysis while saving fails: the chart stays open with **Save and open** and **Open anyway**. A save asked for while another runs (leaving the page, **Add to journal**) now waits for the save that includes its edits, and a newer open always wins over a slower earlier one
- If chart settings fail to load, changing a setting no longer overwrites your saved watchlist, symbol colours, looks and templates with the defaults; the page says the settings did not load
- An indicator whose code fails when a chart reopens stays on the analysis with its error instead of being dropped by the next autosave
- Smaller chart fixes: Title and Notes are read-only while viewing a day's version (typing there was discarded); an ink colour added from the colour picker is remembered after a reload; a script too deep for the indicator worker skips it on every chart, not only the one that found out; the day review shows when its plan or trades fail to load; a source that returns no candles says so instead of "Loading candles…"
- The Template menu works from the keyboard: **D** stars the focused template and **Delete** deletes one of yours, and saving a look opens a small dialog (the name field inside the menu could not be reached with Tab)

## [0.1.0] - 2026-09-03

Initial public release.

### Added

- Round-trip engine: flat-to-flat position cycles from raw fills, FIFO/LIFO/weighted-average matching, partial fills, position flips, futures multipliers, rebuild-stable annotation keys (`@luxalgo/journal-core`)
- Analytics: P&L, win and day-win rates, profit factor, expectancy, R multiples, streaks, drawdown and recovery, profit concentration, calendar and bucket aggregations, the open Edge Score
- Statement importers with auto-detection for 12 formats, one-click TradeZella/Tradervue migration with exact P&L reconciliation, and a column mapper for anything else (`@luxalgo/journal-importers`)
- Web app: dashboard, P&L calendar, daily journal with voice dictation, trades table, trade pages with charting, notebook, playbooks, reports
- Broker sync via `@luxalgo/broker-sdk` with credentials encrypted at rest
- Optional AI reflection (bring your own Anthropic API key): session recaps, trade critiques, ask-your-journal
- Docker deployment, optional password auth, full JSON/CSV export
