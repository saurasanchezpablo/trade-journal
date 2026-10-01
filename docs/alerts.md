# Alerts

**Alerts** (sidebar) is where every notification the journal sends is set up and seen: chart
levels and zones watched in the background, YouTube analyses (see
[external-analysis.md](external-analysis.md)) and AI digests (see
[ai-chat.md](ai-chat.md#scheduled-digests)).

## The Alerts page

- **What you receive**: each kind of alert (**Chart levels**, **Chart zones**, **YouTube
  analyses**, **AI digests**) on or off for **Browsers** and for the **Webhook** apart, so
  digests can go to ntfy only while levels reach your phone's browser, for example. YouTube
  channels can be muted one by one. Chart levels, zones and digests start on everywhere;
  YouTube analyses start as the External analysis page's old **Notify me** switch was.
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

## Background chart alerts

Chart alerts normally run in the open Charts page. **Keep watching when this page is closed**
(the chart's Alerts card, or **Watch** on the Alerts page) hands an analysis's alerts to the
journal server, which keeps checking them with no page open and notifies you.

### What is watched

- Visible horizontal lines, horizontal rays, rays, extended lines and trend lines, and
  support/resistance zones (entering and breaking), with the same rules as the open chart, each
  at most once a minute. Hidden drawings and hidden layers are skipped.
- Indicator `alert()` calls run in the browser, so they only alert while the chart is open.
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
300 notifications of every kind, with what became of them). The VAPID keys, the webhook and the
alert preferences (`alerts:preferences`, JSON) live in settings.

- `server/background-alerts/engine.ts`: the watcher, started by `instrumentation.ts` through
  `instrumentation-node.ts`.
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
