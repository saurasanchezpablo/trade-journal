import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_ALERT_PREFERENCES,
  alertPreferencesProblem,
  inQuietHours,
  readAlertPreferences,
  readOpenChartAlerts,
  routeAlert,
  type AlertPreferences,
} from "../src/lib/alert-preferences";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-alert-prefs-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { db } = await import("../src/db");
const { setSetting } = await import("../src/server/settings");
const delivery = await import("../src/server/background-alerts/delivery");
const external = await import("../src/server/external-analysis/store");
const preferencesRoute = await import("../src/app/api/alerts/preferences/route");
const logRoute = await import("../src/app/api/alerts/log/route");
const watchRoute = await import("../src/app/api/alerts/watch/route");

afterAll(() => {
  db.$client.close();
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const prefs = (patch: Partial<AlertPreferences> = {}): AlertPreferences => ({
  ...DEFAULT_ALERT_PREFERENCES,
  ...patch,
});
const at = (iso: string) => Date.parse(iso);

describe("which alerts reach you", () => {
  it("sends chart alerts and digests everywhere by default, and YouTube only if you asked before", () => {
    expect(readAlertPreferences(null)).toEqual(DEFAULT_ALERT_PREFERENCES);
    expect(readAlertPreferences(null, { external: true }).kinds.external).toEqual({
      push: true,
      webhook: true,
    });
    // Once saved, the saved choice wins over the old switch.
    expect(
      readAlertPreferences(
        { kinds: { external: { push: false, webhook: true } } },
        { external: true },
      ).kinds.external,
    ).toEqual({ push: false, webhook: true });
  });

  it("refuses settings it cannot apply", () => {
    expect(
      alertPreferencesProblem({ kinds: { lines: { push: true, webhook: false } } }),
    ).toBeNull();
    expect(alertPreferencesProblem({ kinds: { trades: { push: true, webhook: true } } })).toMatch(
      /Unknown/,
    );
    expect(alertPreferencesProblem({ kinds: { lines: { push: "yes" } } })).toMatch(/push/);
    expect(
      alertPreferencesProblem({ quiet: { enabled: true, from: "25:00", to: "07:00" } }),
    ).toMatch(/times/);
    expect(
      alertPreferencesProblem({ quiet: { enabled: true, from: "07:00", to: "07:00" } }),
    ).toMatch(/differ/);
    expect(alertPreferencesProblem({ pausedUntil: "soon" })).toMatch(/valid time/);
    expect(alertPreferencesProblem({ muted: ["external:<script>"] })).toMatch(/muted/);
    expect(alertPreferencesProblem([])).toMatch(/Invalid/);
  });

  it("holds alerts in quiet hours that span midnight, in the journal's timezone", () => {
    const quiet = { enabled: true, from: "22:00", to: "07:00" };
    // Madrid is UTC+2 in summer.
    expect(inQuietHours(quiet, at("2026-07-01T20:30:00Z"), "Europe/Madrid")).toBe(true);
    expect(inQuietHours(quiet, at("2026-07-01T04:59:00Z"), "Europe/Madrid")).toBe(true);
    expect(inQuietHours(quiet, at("2026-07-01T05:00:00Z"), "Europe/Madrid")).toBe(false);
    expect(inQuietHours(quiet, at("2026-07-01T12:00:00Z"), "Europe/Madrid")).toBe(false);
    const lunch = { enabled: true, from: "12:00", to: "13:30" };
    expect(inQuietHours(lunch, at("2026-07-01T13:00:00Z"), "UTC")).toBe(true);
    expect(inQuietHours(lunch, at("2026-07-01T13:30:00Z"), "UTC")).toBe(false);
    expect(inQuietHours({ ...quiet, enabled: false }, at("2026-07-01T23:00:00Z"), "UTC")).toBe(
      false,
    );
  });

  it("routes each alert by its kind, unless paused, quiet or its source is muted", () => {
    const noon = at("2026-07-01T12:00:00Z");
    const choices = prefs({
      kinds: { ...DEFAULT_ALERT_PREFERENCES.kinds, digest: { push: false, webhook: true } },
      muted: ["external:UCmuted"],
    });
    expect(routeAlert(choices, { kind: "digest" }, noon, "UTC")).toEqual({
      push: false,
      webhook: true,
      muted: null,
    });
    expect(routeAlert(choices, { kind: "external" }, noon, "UTC").muted).toBe("kind");
    expect(
      routeAlert(
        { ...choices, kinds: { ...choices.kinds, external: { push: true, webhook: true } } },
        { kind: "external", source: "external:UCmuted" },
        noon,
        "UTC",
      ).muted,
    ).toBe("source");
    const paused = { ...choices, pausedUntil: "2026-07-01T13:00:00.000Z" };
    expect(routeAlert(paused, { kind: "lines" }, noon, "UTC").muted).toBe("paused");
    expect(
      routeAlert(paused, { kind: "lines" }, at("2026-07-01T13:00:01Z"), "UTC").muted,
    ).toBeNull();
    const quiet = { ...choices, quiet: { enabled: true, from: "11:00", to: "14:00" } };
    expect(routeAlert(quiet, { kind: "zones" }, noon, "UTC").muted).toBe("quiet");
    // A test always goes out, so you can check your setup at any hour.
    expect(routeAlert(quiet, { kind: "test" }, noon, "UTC")).toEqual({
      push: true,
      webhook: true,
      muted: null,
    });
  });

  it("an open chart alerts on the kinds chosen in this browser", () => {
    expect(readOpenChartAlerts("on", JSON.stringify({ indicators: false }))).toEqual({
      on: true,
      lines: true,
      zones: true,
      indicators: false,
    });
    expect(readOpenChartAlerts(null, "not json")).toEqual({
      on: false,
      lines: true,
      zones: true,
      indicators: true,
    });
  });
});

describe("the server applies them to every notification", () => {
  beforeEach(() => vi.stubEnv("JOURNAL_PASSWORD", ""));
  const put = (body: unknown) =>
    preferencesRoute.PUT(
      new Request("http://journal.test/api/alerts/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  it("sends a digest only to the webhook when you chose that, and logs what it did", async () => {
    delivery.setWebhookUrl("https://ntfy.example/alerts");
    delivery.vapidKeys();
    delivery.saveSubscription(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/abcdefghijklmnop",
        keys: {
          p256dh:
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
          auth: "BTBZMqHH6r4Tts7J_aSIgg",
        },
      },
      "Phone",
    );
    const urls: string[] = [];
    const fetcher = vi
      .spyOn(delivery.transport, "fetch")
      .mockImplementation(async (url) => (urls.push(url), new Response(null, { status: 201 })));
    expect((await put({ kinds: { digest: { push: false, webhook: true } } })).status).toBe(200);
    const notification = { title: "Session recap", body: "3 trades.", tag: "d", url: "/journal" };
    expect(await delivery.deliver(notification, { kind: "digest" })).toBe(1);
    expect(urls).toEqual(["https://ntfy.example/alerts"]);
    // Both destinations for chart levels, as by default.
    urls.length = 0;
    expect(await delivery.deliver({ ...notification, title: "BTC" }, { kind: "lines" })).toBe(2);
    expect(urls).toHaveLength(2);
    fetcher.mockRestore();
    const log = (
      await (await logRoute.GET(new Request("http://journal.test/api/alerts/log"))).json()
    ).notifications;
    expect(
      log.slice(0, 2).map((e: { title: string; delivered: number }) => [e.title, e.delivered]),
    ).toEqual([
      ["BTC", 2],
      ["Session recap", 1],
    ]);
  });

  it("holds everything while paused, logged with the reason, and a test still goes out", async () => {
    const fetcher = vi
      .spyOn(delivery.transport, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));
    const until = new Date(Date.now() + 3_600_000).toISOString();
    await put({ pausedUntil: until });
    const notification = { title: "Zone", body: "x", tag: "z", url: "/charts" };
    expect(await delivery.deliver(notification, { kind: "zones" })).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await delivery.deliver({ ...notification, title: "Test" }, { kind: "test" })).toBe(2);
    fetcher.mockRestore();
    await put({ pausedUntil: null });
    const zones = (
      await (
        await logRoute.GET(new Request("http://journal.test/api/alerts/log?kind=zones"))
      ).json()
    ).notifications;
    expect(zones[0]).toMatchObject({ title: "Zone", delivered: 0, muted: "paused" });
    await logRoute.DELETE();
    expect(
      (await (await logRoute.GET(new Request("http://journal.test/api/alerts/log"))).json())
        .notifications,
    ).toEqual([]);
  });

  it("keeps a YouTube channel quiet once muted, and reads the old YouTube switch until saved", async () => {
    setSetting("alerts:preferences", "");
    external.saveExternalSettings({ ...external.getExternalSettings(), notify: true });
    const read = async () => (await (await preferencesRoute.GET()).json()).preferences;
    expect((await read()).kinds.external).toEqual({ push: true, webhook: true });
    await put({ muted: ["external:UCquiet"] });
    const fetcher = vi
      .spyOn(delivery.transport, "fetch")
      .mockResolvedValue(new Response(null, { status: 201 }));
    const video = { title: "New analysis", body: "x", tag: "e", url: "/external" };
    expect(await delivery.deliver(video, { kind: "external", source: "external:UCquiet" })).toBe(0);
    expect(await delivery.deliver(video, { kind: "external", source: "external:UCother" })).toBe(2);
    fetcher.mockRestore();
    expect((await put({ kinds: { nope: true } })).status).toBe(400);
  });

  it("lists every chart watched in the background", async () => {
    const body = await (
      await watchRoute.GET(new Request("http://journal.test/api/alerts/watch"))
    ).json();
    expect(body).toMatchObject({ running: false, max: 25, watched: [] });
  });
});
