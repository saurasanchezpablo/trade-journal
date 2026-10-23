# Alerts

**Alerts** (sidebar) is where every notification the journal sends is set up and seen: chart
levels and zones watched in the background, indicator (RSI) alerts, YouTube analyses (see
[external-analysis.md](external-analysis.md)) and AI digests (see
[ai-chat.md](ai-chat.md#scheduled-digests)).

## The Alerts page

- **What you receive**: each kind of alert (**Chart levels**, **Chart zones**, **Indicator
  alerts**, **YouTube analyses**, **AI digests**, and **Strategy signals** while Strategy research
  is on) on or off for **Browsers** and for the **Webhook** apart, and **Urgent** or not, so
  digests can go to ntfy only while levels reach your phone's browser, for example. YouTube
  channels can be muted one by one. Chart levels, zones and digests start on everywhere;
  YouTube analyses start as the External analysis page's old **Notify me** switch was.
- **Urgent alerts**: how often an urgent alert is sent again until acknowledged (1, 2, 5, 10
  or 15 minutes; 2 by default) and at most how many times (0 to 30; 10 by default), and **Send an
  urgent test**. See [Urgent alerts](#urgent-alerts).
- **Indicator alerts**: RSI rules the server watches with no page open; see
  [Indicator alerts](#indicator-alerts-rsi).
- **Quiet hours**: nothing is sent between two times of day in the journal's timezone (spans
  over midnight work, such as 22:00 to 07:00). **Pause everything** for 1, 4 or 24 hours, or
  until **Resume**. Alerts held back are not sent later.
- **Charts watched in the background**: every analysis the server watches, with what it
  watches and how (live, checked periodically, the last price or why it is not watching),
  **Stop watching**, and a list to **Watch** another analysis (at most 25).
- **While a chart is open** (this browser): the open Charts page's own alerts, on or off (the
  same switch as the chart's Alerts card), and which of lines, zones and indicator `alert()`
  calls it raises; **Allow notifications** lets the page show them as browser notifications.
- **Where alerts go**: **Notify this browser**, the browsers that receive alerts (remove one
  with its bin), the webhook, and **Send a test**, which reaches every destination even in
  quiet hours or a pause.
- **Recent alerts**: the last 300 notifications of every kind, newest first, filterable by
  kind, each with where it went or why it was not sent (paused, quiet hours, turned off,
  source muted, or no destination took it), linked to what it is about. **Clear** empties it.

## Indicator alerts (RSI)

A rule names a source (any market data source enabled in Settings), its market where it has
several, a symbol, a timeframe (1m to 1W), the RSI length (2 to 200, 14 by default), a
condition (**crosses above**, **crosses below** or **crosses** a level between 0 and 100;
presets for overbought 70 and oversold 30), when to check, whether it is **urgent**, and an
optional note added to the notification. At most 50 rules; each can be switched off or deleted.

- **On candle close** (default): each finished candle's RSI against the one before, as
  TradingView's "once per bar close": it never fires on a cross that undoes itself before the
  close. Checked at the timeframe's chart pace (15 seconds for 1m up to 5 minutes for 1D, 10
  for 1W), so the alert comes within that time of the close.
- **As it happens**: the forming candle's RSI against the last close, at most once per candle,
  as "once per bar": sooner, but the cross may undo itself by the close.
- RSI is computed as TradingView's `ta.rsi` (Wilder's smoothing, seeded with a simple average;
  `rsi` in `packages/core/src/indicators.ts`, checked to 1e-9 against an independent
  computation on real BTC candles), on 300 candles or 12 times the length, whichever is more, so
  it agrees with the chart to a few hundredths.
- Rules on the same symbol and timeframe share one read of the candles. Switching a rule on
  (or creating it) only records where the RSI is: it never alerts on a cross that happened
  before. What was evaluated is stored, so a restart neither repeats an alert nor reads a candle
  twice; crosses on candles that closed while the server was off are not alerted afterwards.
- The rule list shows the RSI's last value, when it was checked, when it last fired, and why it
  could not be checked (a source switched off, an unknown symbol).
- Notifications read, for example, "BTCUSDT 1h: RSI(14) crossed above 70 / RSI 71.3 (was 68.9)
  at the candle's close. Price 84210.5." and open the Alerts page.

## Urgent alerts

For alerts you must not miss. A kind of alert set **Urgent** on the Alerts page (or an
indicator rule marked urgent) is sent:

- to the **webhook at the highest priority**: ntfy's priority 5 ("max/urgent": a long
  vibration burst and a pop-over notification on Android), with a siren tag and, with
  `JOURNAL_PUBLIC_URL` set, an **Acknowledge** button. Android's notification settings for the
  ntfy app can also let its highest-priority notifications through Do Not Disturb;
- to **browsers** as a notification that stays on screen until dismissed
  (`requireInteraction`), with a long vibration and an **Acknowledge** button (where the
  browser shows buttons; iOS ignores both);
- to **every open journal page** as a banner over the page with a repeating alarm sound, a
  vibration on phones and a flashing tab title. Browsers only let a page play sound after it
  was clicked or typed in once; until then the banner says so. The sound can be silenced on
  that page;
- **again** every few minutes (the Alerts page's setting) until acknowledged, at most the set
  number of times. Reminders read "Reminder 1: ...".

Opening the notification (its link carries `?ack=<id>`), its **Acknowledge** button, or
**Acknowledge** in a journal page's banner stops it everywhere. Quiet hours and a pause still
hold urgent alerts and their reminders back: they are your choice. Urgent alerts not
acknowledged within a day are no longer shown.

## Background chart alerts

Chart alerts normally run in the open Charts page. **Keep watching when this page is closed**
(the chart's Alerts card, or **Watch** on the Alerts page) hands an analysis's alerts to the
journal server, which keeps checking them with no page open and notifies you.

### What is watched

- Visible horizontal lines, horizontal rays, rays, extended lines and trend lines, and
  support/resistance zones (entering and breaking), with the same rules as the open chart, each
  at most once a minute. Hidden drawings and hidden layers are skipped.
- Indicator `alert()` calls run in the browser, so they only alert while the chart is open.
  For RSI, use an [indicator alert](#indicator-alerts-rsi), which the server watches.
- Prices: Binance and Coinbase through the same shared real-time feed as the chart (one
  connection per symbol, whether charts are open or not); other sources are polled at the
  chart's pace, at least every 20 seconds.
- The watcher reads analyses as the journal saves them and checks every 5 seconds for new saves,
  so editing lines or zones updates the watch without any change to how the journal saves.
  Deleting an analysis stops its watch. At most 25 analyses are watched: switching on another
  is refused with a message until one is switched off.

### What an alert says

Each alert, in the open chart and in background notifications, adds a short note from the
analysis's own plan (no AI call, so it is instant and exact):

- A line or zone at a scenario's trigger (within 0.3% of its price) says the scenario is set
  off, with its target and where it is wrong, when price crosses in the scenario's direction,
  or that the trigger was crossed the other way.
- At a target: the target is reached, or price went back through it.
- At an invalidation: the scenario is invalidated here, or price went back past it.
- Elsewhere, a zone reads as support or resistance (entered from above or below; a break flips
  its role), and the bias, when set, says whether the move is with it or against it.

For example: "BTCUSDT crossed above Horizontal line at 100 / Plan: sets off "Reclaim" (long),
target 108, wrong below 97." The note follows the plan as last saved.

Scheduled AI digests use the same delivery; see [ai-chat.md](ai-chat.md#scheduled-digests).

## How you are notified

- **Notify this browser** (Alerts page) turns on Web Push for the browser or installed app you are using
  (Chrome, Edge, Firefox, Safari; phones too). It needs the journal on https or localhost.
  Notifications open the chart when tapped. Browsers that unsubscribe or stop answering are
  removed.
- Push is implemented with Node's own crypto (RFC 8291 encryption, RFC 8292 VAPID), tested
  against the RFC's example; the server's VAPID key pair is created once and its private key is
  stored encrypted. Messages go through the browser's own push service (Google's for Chrome).
- **Webhook**: optionally one URL that receives a text POST for every alert, for example an
  [ntfy](https://ntfy.sh) topic; ntfy reads the title and, with `JOURNAL_PUBLIC_URL` set, a link
  to the chart. A title with anything beyond plain ASCII (an emoji, accents, a channel name in
  Japanese) is sent as an RFC 2047 encoded word (`=?UTF-8?B?...?=`), which ntfy decodes.
- **Send a test** checks every browser and the webhook. The chart's Alerts card shows its own
  watch and the alerts the server sent for it; the Alerts page shows them all.
- Every notification goes through `deliver(notification, { kind, source? })`, which applies
  the Alerts page's choices (`lib/alert-preferences.ts`: `routeAlert`) and records it in the
  notification log.
- When the chart is open and in front, the page shows the alert itself and the service worker
  skips the push for that chart, so nothing arrives twice.

The server has to be running. `JOURNAL_BACKGROUND_ALERTS=off` stops the watcher from starting.

## Storage and code

The add-on keeps its own tables, created on first use by `server/background-alerts/store.ts`
(not part of `db/schema.ts`): `background_alert_watches` (analyses switched on),
`push_subscriptions`, `alert_events` (the last 200 per analysis), `notification_log` (the last
300 notifications of every kind, with what became of them), `indicator_alert_rules` (the RSI
rules and what each last evaluated) and `urgent_alerts` (urgent alerts, their sends and when
they were acknowledged). The VAPID keys, the webhook and the
alert preferences (`alerts:preferences`, JSON) live in settings.

- `server/background-alerts/engine.ts`: the watcher, started by `instrumentation.ts` through
  `instrumentation-node.ts`.
- `server/background-alerts/indicator-alerts.ts`: the indicator rule watcher (started with the
  chart watcher); `lib/indicator-alerts.ts`: rules, validation and evaluation;
  `app/api/alerts/indicators` (`GET`, `POST` a rule, `PATCH { id, enabled?, rule? }`,
  `DELETE ?id=`); `components/alerts/indicator-alerts.tsx`.
- `server/background-alerts/urgent.ts`: urgent records, reminders (every 30 seconds, started
  from `instrumentation-node.ts` even with `JOURNAL_BACKGROUND_ALERTS=off`) and
  acknowledgement; `app/api/alerts/urgent` (`GET` pending, `POST { action: "ack", id }` or
  `{ action: "ack-all" }`); `components/alerts/urgent-alarm.tsx`, mounted by the shell on every
  page; `POST /api/alerts/test` with `{ urgent: true }` sends an urgent test.
- `server/background-alerts/delivery.ts`: keys, subscriptions, push and webhook delivery;
  `web-push.ts`: encryption and VAPID.
- `lib/alert-messages.ts`: alert wording; `lib/alert-explain.ts`: the plan note.
- `server/background-alerts/preferences.ts`: the preferences and the notification log;
  `lib/alert-preferences.ts`: kinds, validation, quiet hours, routing, and the open chart's
  per-browser choices.
- `app/api/alerts/{watch,push,test,webhook,events,preferences,log}`: `GET /api/alerts/watch`
  without `analysisId` lists every watch; `GET/PUT /api/alerts/preferences` (`PUT` takes any
  of `{ kinds, quiet, pausedUntil, muted }`, `kinds` merged by kind); `GET /api/alerts/log`
  (`?kind=`), `DELETE` clears it.
- `app/alerts/page.tsx` and `components/alerts/*`: the Alerts page;
  `components/background-alerts.tsx`: the chart card's watch switch and its events.
- `public/sw.js`: shows notifications (also the installable app's service worker, see
  [web-app.md](web-app.md)).
