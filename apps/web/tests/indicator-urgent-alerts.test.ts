import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rsi } from "@luxalgo/journal-core";
import {
  evaluateRule,
  readIndicatorRule,
  type IndicatorAlertRule,
} from "../src/lib/indicator-alerts";

const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-indicator-alerts-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { alertsDb, indicatorAlertRules, urgentAlerts, notificationLog } =
  await import("../src/server/background-alerts/store");
const indicators = await import("../src/server/background-alerts/indicator-alerts");
const delivery = await import("../src/server/background-alerts/delivery");
const urgent = await import("../src/server/background-alerts/urgent");
const preferences = await import("../src/server/background-alerts/preferences");
const indicatorsRoute = await import("../src/app/api/alerts/indicators/route");
const urgentRoute = await import("../src/app/api/alerts/urgent/route");
const webhookRoute = await import("../src/app/api/alerts/webhook/route");
afterAll(() => {
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1);
const json = (url: string, body: unknown, method = "POST") =>
  new Request(`http://journal.test${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const rule = (patch: Partial<IndicatorAlertRule> = {}): IndicatorAlertRule => ({
  provider: "binance",
  dataset: null,
  symbol: "BTCUSDT",
  resolution: "1h",
  indicator: "rsi",
  length: 14,
  condition: "crosses-above",
  level: 70,
  trigger: "close",
  urgent: false,
  note: "",
  ...patch,
});

/** Hourly candles: a slow decline (RSI low), then `rally` rising candles from `rallyFrom`. */
function candles(count: number, rallyFrom = Infinity) {
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    price += i >= rallyFrom ? 2 : i % 2 ? -0.3 : 0.2;
    return { time: T0 + i * H, close: price };
  });
}

describe("an RSI alert rule", () => {
  it("is checked by hand: source, symbol, timeframe, a length from 2 to 200 and a level inside 0 to 100", () => {
    expect("rule" in readIndicatorRule(rule())).toBe(true);
    expect(readIndicatorRule({ ...rule(), symbol: "btc usdt" })).toEqual({
      problem: "Enter a symbol.",
    });
    expect(readIndicatorRule({ ...rule(), resolution: "7m" })).toEqual({
      problem: "Choose a timeframe.",
    });
    expect("problem" in readIndicatorRule({ ...rule(), length: 1 })).toBe(true);
    expect("problem" in readIndicatorRule({ ...rule(), level: 100 })).toBe(true);
    expect("problem" in readIndicatorRule({ ...rule(), condition: "touches" })).toBe(true);
    expect(
      (readIndicatorRule({ ...rule(), symbol: " ethusdt " }) as { rule: IndicatorAlertRule }).rule
        .symbol,
    ).toBe("ETHUSDT");
  });

  it("on candle close: the first check only records, then fires once on the candle that closes across", () => {
    const bars = candles(80, 70);
    const values = rsi(
      bars.map((b) => b.close),
      14,
    );
    const crossAt = values.findIndex(
      (v, i) => i > 0 && (values[i - 1] ?? 100) <= 70 && (v ?? 0) > 70,
    );
    expect(crossAt).toBeGreaterThan(69);
    const at = (i: number) => T0 + (i + 1) * H + 1; // just after candle i closed
    // First check after the cross: records where it is, no alert for the past.
    const first = evaluateRule(
      rule(),
      bars.slice(0, crossAt + 1),
      { lastBarTime: null, firedBarTime: null },
      at(crossAt),
    );
    expect(first.fired).toBeNull();
    // Seen the candle before, then the crossing candle closes: fires.
    const state = { lastBarTime: bars[crossAt - 1]!.time, firedBarTime: null };
    const fired = evaluateRule(rule(), bars.slice(0, crossAt + 1), state, at(crossAt));
    expect(fired.fired).toBe("above");
    expect(fired.barTime).toBe(bars[crossAt]!.time);
    // The same candle again: once per candle.
    expect(
      evaluateRule(
        rule(),
        bars.slice(0, crossAt + 1),
        { lastBarTime: state.lastBarTime, firedBarTime: fired.barTime },
        at(crossAt),
      ).fired,
    ).toBeNull();
    // A forming candle is never used on close.
    const forming = evaluateRule(rule(), bars.slice(0, crossAt + 1), state, at(crossAt) - 2 * H);
    expect(forming.barTime).not.toBe(bars[crossAt]!.time);
    // Crosses below never fires a "crosses above" rule; "crosses" fires either way.
    expect(
      evaluateRule(
        rule({ condition: "crosses-below" }),
        bars.slice(0, crossAt + 1),
        state,
        at(crossAt),
      ).fired,
    ).toBeNull();
    expect(
      evaluateRule(rule({ condition: "crosses" }), bars.slice(0, crossAt + 1), state, at(crossAt))
        .fired,
    ).toBe("above");
  });

  it("as it happens: fires on the forming candle, once per candle", () => {
    const bars = candles(80, 70);
    const values = rsi(
      bars.map((b) => b.close),
      14,
    );
    const crossAt = values.findIndex(
      (v, i) => i > 0 && (values[i - 1] ?? 100) <= 70 && (v ?? 0) > 70,
    );
    const midCandle = bars[crossAt]!.time + H / 2;
    const live = rule({ trigger: "live" });
    const fired = evaluateRule(
      live,
      bars.slice(0, crossAt + 1),
      { lastBarTime: null, firedBarTime: null },
      midCandle,
    );
    expect(fired.fired).toBe("above");
    expect(
      evaluateRule(
        live,
        bars.slice(0, crossAt + 1),
        { lastBarTime: null, firedBarTime: bars[crossAt]!.time },
        midCandle,
      ).fired,
    ).toBeNull();
  });

  it("without enough candles for the RSI, nothing is evaluated", () => {
    expect(
      evaluateRule(rule(), candles(10), { lastBarTime: null, firedBarTime: null }, T0 + 20 * H)
        .barTime,
    ).toBeNull();
  });
});

describe("the background watcher", () => {
  beforeEach(() => {
    alertsDb().delete(indicatorAlertRules).run();
    alertsDb().delete(urgentAlerts).run();
  });

  it("reads each symbol once per pace, fires once, survives a restart without repeating, and records errors", async () => {
    const bars = candles(120, 100);
    const values = rsi(
      bars.map((b) => b.close),
      14,
    );
    const crossAt = values.findIndex(
      (v, i) => i > 0 && (values[i - 1] ?? 100) <= 70 && (v ?? 0) > 70,
    );
    let now = bars[crossAt - 1]!.time + H + 1;
    const history = vi.fn(async () => bars.filter((b) => b.time + H <= now));
    const deliver = vi.fn(async () => 1);
    const id = indicators.createIndicatorRule(rule({ urgent: true, note: "Take profits" }));
    indicators.createIndicatorRule(rule({ condition: "crosses-below", level: 30 }));
    const watcher = new indicators.IndicatorAlertWatcher({ history, deliver, now: () => now });
    await watcher.tick();
    expect(history).toHaveBeenCalledTimes(1); // two rules, one symbol and timeframe
    expect(deliver).not.toHaveBeenCalled();
    await watcher.tick(); // within the pace: not read again
    expect(history).toHaveBeenCalledTimes(1);
    now += H; // the crossing candle has closed
    watcher.wake();
    await watcher.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    const [notification, meta] = deliver.mock.calls[0]! as unknown as [
      { title: string; body: string },
      { kind: string; urgent: boolean; source: string },
    ];
    expect(notification.title).toBe("BTCUSDT 1h: RSI(14) crossed above 70");
    expect(notification.body).toMatch(/at the candle's close.*Take profits/);
    expect(meta).toEqual({ kind: "indicators", source: `indicator:${id}`, urgent: true });
    // A restart: a new watcher reads what was stored and does not fire again.
    const again = new indicators.IndicatorAlertWatcher({ history, deliver, now: () => now });
    await again.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    // A source failure is shown on the rule.
    const failing = new indicators.IndicatorAlertWatcher({
      history: async () => {
        throw new Error("Enable Binance under Settings → Market data.");
      },
      deliver,
      now: () => now,
    });
    await failing.tick();
    expect(indicators.listIndicatorRules()[0]!.error).toMatch(/Enable Binance/);
  });

  it("a rule switched off is not checked", async () => {
    const id = indicators.createIndicatorRule(rule());
    indicators.updateIndicatorRule(id, { enabled: false });
    const history = vi.fn(async () => candles(100));
    await new indicators.IndicatorAlertWatcher({ history, deliver: async () => 1 }).tick();
    expect(history).not.toHaveBeenCalled();
  });

  it("is managed through the API, with every field checked", async () => {
    const created = await indicatorsRoute.POST(json("/api/alerts/indicators", rule()));
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };
    expect(
      (await indicatorsRoute.POST(json("/api/alerts/indicators", { ...rule(), level: 0 }))).status,
    ).toBe(400);
    const off = await indicatorsRoute.PATCH(
      json("/api/alerts/indicators", { id, enabled: false }, "PATCH"),
    );
    expect(((await off.json()) as { rules: { enabled: boolean }[] }).rules[0]!.enabled).toBe(false);
    expect(
      (
        await indicatorsRoute.PATCH(
          json("/api/alerts/indicators", { id: "missing", enabled: true }, "PATCH"),
        )
      ).status,
    ).toBe(404);
    const deleted = await indicatorsRoute.DELETE(
      new Request(`http://journal.test/api/alerts/indicators?id=${id}`, { method: "DELETE" }),
    );
    expect(((await deleted.json()) as { rules: unknown[] }).rules).toEqual([]);
  });
});

describe("urgent alerts", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    alertsDb().delete(urgentAlerts).run();
    alertsDb().delete(notificationLog).run();
    preferences.updateAlertPreferences({
      kinds: { lines: { push: true, webhook: true, urgent: true } },
      urgent: { repeatMinutes: 2, maxRepeats: 2 },
      quiet: { enabled: false, from: "22:00", to: "07:00" },
      pausedUntil: null,
    });
    await webhookRoute.PUT(
      json("/api/alerts/webhook", { url: "https://ntfy.example/alerts" }, "PUT"),
    );
    vi.stubEnv("JOURNAL_PUBLIC_URL", "https://journal.example");
  });

  const send = (meta: { kind: "lines" | "zones"; urgent?: boolean }) =>
    delivery.deliver(
      { title: "BTC crossed 100", body: "Above the line.", tag: "line-1", url: "/charts?id=a1" },
      meta,
    );

  it("go to the phone at the highest priority, with a link and a button that acknowledge them", async () => {
    const fetcher = vi.spyOn(delivery.transport, "fetch").mockResolvedValue(new Response("ok"));
    await send({ kind: "lines" });
    const [id] = urgent.pendingUrgent().map((p) => p.id);
    expect(id).toBeTruthy();
    const headers = fetcher.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Priority).toBe("5");
    expect(headers.Tags).toBe("rotating_light");
    expect(headers.Click).toBe(`https://journal.example/charts?id=a1&ack=${id}`);
    expect(headers.Actions).toBe(
      `view, Acknowledge, https://journal.example/charts?id=a1&ack=${id}, clear=true`,
    );
  });

  it("an alert that is not urgent keeps the normal priority and is not repeated", async () => {
    const fetcher = vi.spyOn(delivery.transport, "fetch").mockResolvedValue(new Response("ok"));
    await send({ kind: "zones" });
    const headers = fetcher.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Priority).toBeUndefined();
    expect(urgent.pendingUrgent()).toEqual([]);
    // An urgent rule makes one alert urgent whatever its kind's setting.
    await send({ kind: "zones", urgent: true });
    expect(urgent.pendingUrgent()).toHaveLength(1);
  });

  it("are sent again every few minutes until acknowledged, at most the set number of times", async () => {
    vi.spyOn(delivery.transport, "fetch").mockResolvedValue(new Response("ok"));
    await send({ kind: "lines" });
    const start = Date.now();
    const deliver = vi.fn(delivery.deliver);
    expect(await urgent.remindUrgent(deliver, start + 60_000)).toBe(0); // not due yet
    expect(await urgent.remindUrgent(deliver, start + 2 * 60_000 + 1)).toBe(1);
    expect(deliver.mock.calls[0]![0].title).toBe("Reminder 1: BTC crossed 100");
    expect(await urgent.remindUrgent(deliver, start + 4 * 60_000 + 2)).toBe(1);
    expect(await urgent.remindUrgent(deliver, start + 6 * 60_000 + 3)).toBe(0); // 2 repeats done
    // Reminders are the same alert: one record, still pending.
    expect(urgent.pendingUrgent()).toHaveLength(1);
    expect(urgent.pendingUrgent()[0]!.sends).toBe(3);
  });

  it("stop once acknowledged, from an open page or the notification", async () => {
    vi.spyOn(delivery.transport, "fetch").mockResolvedValue(new Response("ok"));
    await send({ kind: "lines" });
    await send({ kind: "lines" });
    const pending = ((await (await urgentRoute.GET()).json()) as { pending: { id: string }[] })
      .pending;
    expect(pending).toHaveLength(2);
    const ack = await urgentRoute.POST(
      json("/api/alerts/urgent", { action: "ack", id: pending[0]!.id }),
    );
    expect(((await ack.json()) as { acknowledged: number }).acknowledged).toBe(1);
    const deliver = vi.fn(delivery.deliver);
    await urgent.remindUrgent(deliver, Date.now() + 10 * 60_000);
    expect(deliver).toHaveBeenCalledTimes(1); // only the one still pending
    await urgentRoute.POST(json("/api/alerts/urgent", { action: "ack-all" }));
    expect(urgent.pendingUrgent()).toEqual([]);
    expect((await urgentRoute.POST(json("/api/alerts/urgent", { action: "snooze" }))).status).toBe(
      400,
    );
  });

  it("quiet hours and a pause still hold them back (and their reminders), as you chose", async () => {
    const fetcher = vi.spyOn(delivery.transport, "fetch").mockResolvedValue(new Response("ok"));
    preferences.updateAlertPreferences({
      pausedUntil: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await send({ kind: "lines" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(urgent.pendingUrgent()).toEqual([]);
  });
});
