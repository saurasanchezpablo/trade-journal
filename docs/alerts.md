# Background alerts

Chart alerts normally run in the open Charts page. **Keep watching when this page is closed**
(Charts → Alerts) hands an analysis's alerts to the journal server, which keeps checking them
with no page open and notifies you.

## What is watched

- Visible horizontal lines, horizontal rays, rays, extended lines and trend lines, and
  support/resistance zones (entering and breaking), with the same rules as the open chart, each
  at most once a minute. Hidden drawings and hidden layers are skipped.
- Indicator `alert()` calls run in the browser, so they only alert while the chart is open.
- Prices: Binance and Coinbase through the same shared real-time feed as the chart (one
  connection per symbol, whether charts are open or not); other sources are polled at the
  chart's pace, at least every 20 seconds.
- The watcher reads analyses as the journal saves them and checks every 5 seconds for new saves,
  so editing lines or zones updates the watch without any change to how the journal saves.
  Deleting an analysis stops its watch. At most 25 analyses are watched.

## What an alert says

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

- **Notify this browser** turns on Web Push for the browser or installed app you are using
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
- **Send a test** checks every browser and the webhook. The card lists the browsers, what is
  being watched and the alerts the server sent.
- When the chart is open and in front, the page shows the alert itself and the service worker
  skips the push for that chart, so nothing arrives twice.

The server has to be running. `JOURNAL_BACKGROUND_ALERTS=off` stops the watcher from starting.

## Storage and code

The add-on keeps its own tables, created on first use by `server/background-alerts/store.ts`
(not part of `db/schema.ts`): `background_alert_watches` (analyses switched on),
`push_subscriptions`, `alert_events` (the last 200 per analysis). The VAPID keys and webhook live
in settings.

- `server/background-alerts/engine.ts`: the watcher, started by `instrumentation.ts` through
  `instrumentation-node.ts`.
- `server/background-alerts/delivery.ts`: keys, subscriptions, push and webhook delivery;
  `web-push.ts`: encryption and VAPID.
- `lib/alert-messages.ts`: alert wording; `lib/alert-explain.ts`: the plan note.
- `app/api/alerts/{watch,push,test,webhook,events}`.
- `components/background-alerts.tsx`: the controls in the Alerts card (self-contained).
- `public/sw.js`: shows notifications (also the installable app's service worker, see
  [web-app.md](web-app.md)).
