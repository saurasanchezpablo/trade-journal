/*
 * Service worker: makes the journal installable, shows a friendly page when the server
 * can't be reached, and displays background alert notifications. It caches no journal
 * data; every page and API call goes to your server.
 */
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080a;
color:#ececec;font:16px system-ui,sans-serif;text-align:center;padding:24px}
button{margin-top:16px;padding:10px 18px;border-radius:10px;border:1px solid #333;
background:#16161a;color:inherit;font:inherit}</style></head><body><div>
<h1 style="font-size:20px">Your journal server can't be reached</h1>
<p style="color:#9a9aa3">Check your connection or that the server is running.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

const analysisOf = (url) => {
  try {
    return new URL(url, self.location.origin).searchParams.get("id");
  } catch {
    return null;
  }
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/charts";
  event.waitUntil(
    (async () => {
      const urgent = data.urgent === true && typeof data.ackId === "string";
      // The chart itself is open and in front: it already showed this alert (an urgent one
      // is shown anyway, until acknowledged).
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const id = analysisOf(url);
      if (!urgent && id && windows.some((w) => w.focused && analysisOf(w.url) === id)) return;
      await self.registration.showNotification(
        typeof data.title === "string" ? data.title : "Journal alert",
        {
          body: typeof data.body === "string" ? data.body : "",
          tag: typeof data.tag === "string" ? data.tag : undefined,
          // A repeated alert for the same line still buzzes.
          renotify: typeof data.tag === "string",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          data: { url, ackId: urgent ? data.ackId : null },
          ...(urgent
            ? {
                // Urgent: stays until dismissed, vibrates long, and offers to acknowledge.
                requireInteraction: true,
                vibrate: [600, 200, 600, 200, 1200],
                actions: [
                  {
                    action: "ack",
                    title: typeof data.ackLabel === "string" ? data.ackLabel : "Acknowledge",
                  },
                ],
              }
            : {}),
        },
      );
    })(),
  );
});

/** Tell the journal an urgent alert was seen, which stops its reminders. */
const acknowledge = (id) =>
  fetch("/api/alerts/urgent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ack", id }),
  }).catch(() => {});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ackId = event.notification.data?.ackId;
  // The Acknowledge button: stop the reminders without opening anything.
  if (event.action === "ack" && ackId) {
    event.waitUntil(acknowledge(ackId));
    return;
  }
  const url = new URL(event.notification.data?.url ?? "/charts", self.location.origin).href;
  event.waitUntil(
    (async () => {
      if (ackId) await acknowledge(ackId);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The push service rotated the subscription: register the new one with the server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription?.options;
      if (!options) return;
      const subscription = await self.registration.pushManager.subscribe(options);
      await fetch("/api/alerts/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), label: "Renewed" }),
      });
    })(),
  );
});
