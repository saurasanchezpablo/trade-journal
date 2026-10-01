/**
 * Which alerts reach you, and where: one switch per kind of alert and per destination
 * (the browsers you turned on, the webhook), quiet hours, a pause, and sources you muted
 * (a YouTube channel). The server applies them to every notification it sends; a test
 * always goes out. Alerts muted here are still logged, with the reason.
 */
export const ALERT_KINDS = ["lines", "zones", "external", "digest"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_KIND_LABELS: Record<AlertKind, { title: string; detail: string }> = {
  lines: {
    title: "Chart levels",
    detail:
      "Price crosses a horizontal line, ray or trend line of a chart watched in the background.",
  },
  zones: {
    title: "Chart zones",
    detail:
      "Price enters or breaks a support or resistance zone of a chart watched in the background.",
  },
  external: {
    title: "YouTube analyses",
    detail: "A followed channel's new video is summarised.",
  },
  digest: {
    title: "AI digests",
    detail: "The scheduled session recap and weekly review are written.",
  },
};

export interface AlertRoute {
  push: boolean;
  webhook: boolean;
}

export interface AlertPreferences {
  kinds: Record<AlertKind, AlertRoute>;
  /** Nothing is sent between these times (the journal's timezone); `from` after `to` spans midnight. */
  quiet: { enabled: boolean; from: string; to: string };
  /** Nothing is sent until then (ISO time), or null. */
  pausedUntil: string | null;
  /** Sources that send nothing, as `external:<channel id>`. */
  muted: string[];
}

const ON: AlertRoute = { push: true, webhook: true };
const OFF: AlertRoute = { push: false, webhook: false };

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  kinds: { lines: ON, zones: ON, external: OFF, digest: ON },
  quiet: { enabled: false, from: "22:00", to: "07:00" },
  pausedUntil: null,
  muted: [],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const SOURCE = /^[a-z]+:[A-Za-z0-9_-]{1,64}$/;
export const MAX_MUTED = 200;

/**
 * Stored preferences, anything unknown replaced by its default. `legacy` fills kinds saved
 * before this existed (YouTube notifications had their own switch on the External analysis
 * page).
 */
export function readAlertPreferences(
  value: unknown,
  legacy: Partial<Record<AlertKind, boolean>> = {},
): AlertPreferences {
  const v = (value && typeof value === "object" ? value : {}) as Partial<
    Record<keyof AlertPreferences, unknown>
  >;
  const kinds = (v.kinds && typeof v.kinds === "object" ? v.kinds : {}) as Record<string, unknown>;
  const route = (kind: AlertKind): AlertRoute => {
    const r = kinds[kind] as Partial<AlertRoute> | undefined;
    const fallback =
      legacy[kind] === undefined ? DEFAULT_ALERT_PREFERENCES.kinds[kind] : legacy[kind] ? ON : OFF;
    if (!r || typeof r !== "object") return fallback;
    return {
      push: typeof r.push === "boolean" ? r.push : fallback.push,
      webhook: typeof r.webhook === "boolean" ? r.webhook : fallback.webhook,
    };
  };
  const quiet = (v.quiet && typeof v.quiet === "object" ? v.quiet : {}) as Record<string, unknown>;
  const paused = typeof v.pausedUntil === "string" ? Date.parse(v.pausedUntil) : NaN;
  return {
    kinds: Object.fromEntries(
      ALERT_KINDS.map((kind) => [kind, route(kind)]),
    ) as AlertPreferences["kinds"],
    quiet: {
      enabled: quiet.enabled === true,
      from:
        typeof quiet.from === "string" && TIME.test(quiet.from)
          ? quiet.from
          : DEFAULT_ALERT_PREFERENCES.quiet.from,
      to:
        typeof quiet.to === "string" && TIME.test(quiet.to)
          ? quiet.to
          : DEFAULT_ALERT_PREFERENCES.quiet.to,
    },
    pausedUntil: Number.isFinite(paused) ? new Date(paused).toISOString() : null,
    muted: Array.isArray(v.muted)
      ? [
          ...new Set(v.muted.filter((s): s is string => typeof s === "string" && SOURCE.test(s))),
        ].slice(0, MAX_MUTED)
      : [],
  };
}

/** Why a preferences update can't be saved, or null when it can. */
export function alertPreferencesProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Invalid alert settings.";
  const v = value as Record<string, unknown>;
  if (v.kinds !== undefined) {
    if (!v.kinds || typeof v.kinds !== "object") return "Invalid alert kinds.";
    for (const [kind, route] of Object.entries(v.kinds)) {
      if (!ALERT_KINDS.includes(kind as AlertKind)) return `Unknown alert kind: ${kind}.`;
      const r = route as Record<string, unknown> | null;
      if (!r || typeof r.push !== "boolean" || typeof r.webhook !== "boolean")
        return "Each alert kind needs push and webhook set to true or false.";
    }
  }
  if (v.quiet !== undefined) {
    const q = v.quiet as Record<string, unknown> | null;
    if (!q || typeof q.enabled !== "boolean") return "Quiet hours need enabled true or false.";
    if (
      typeof q.from !== "string" ||
      !TIME.test(q.from) ||
      typeof q.to !== "string" ||
      !TIME.test(q.to)
    )
      return "Quiet hours take times such as 22:00 and 07:00.";
    if (q.from === q.to) return "Quiet hours need a start and an end that differ.";
  }
  if (v.pausedUntil !== undefined && v.pausedUntil !== null) {
    if (typeof v.pausedUntil !== "string" || !Number.isFinite(Date.parse(v.pausedUntil)))
      return "Pause until a valid time.";
  }
  if (v.muted !== undefined) {
    if (!Array.isArray(v.muted) || v.muted.length > MAX_MUTED) return "Invalid muted sources.";
    if (v.muted.some((s) => typeof s !== "string" || !SOURCE.test(s)))
      return "Invalid muted source.";
  }
  return null;
}

/** Minutes after midnight of a moment in a timezone. */
function minutesIn(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Whether a moment falls in the quiet hours (start included, end excluded). */
export function inQuietHours(quiet: AlertPreferences["quiet"], at: number, timeZone: string) {
  if (!quiet.enabled) return false;
  const now = minutesIn(at, timeZone);
  const from = toMinutes(quiet.from);
  const to = toMinutes(quiet.to);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

export type MuteReason = "paused" | "quiet" | "kind" | "source";

export interface Routing {
  push: boolean;
  webhook: boolean;
  /** Why nothing (or only part) goes out; null when the kind's destinations all do. */
  muted: MuteReason | null;
}

/**
 * Where one notification goes. A test goes everywhere; otherwise a pause or the quiet hours
 * hold everything, a muted source sends nothing, and the kind's own switches choose the
 * destinations.
 */
export function routeAlert(
  prefs: AlertPreferences,
  meta: { kind: AlertKind | "test"; source?: string },
  at: number,
  timeZone: string,
): Routing {
  if (meta.kind === "test") return { push: true, webhook: true, muted: null };
  const none = (muted: MuteReason): Routing => ({ push: false, webhook: false, muted });
  if (prefs.pausedUntil && Date.parse(prefs.pausedUntil) > at) return none("paused");
  if (inQuietHours(prefs.quiet, at, timeZone)) return none("quiet");
  if (meta.source && prefs.muted.includes(meta.source)) return none("source");
  const route = prefs.kinds[meta.kind];
  if (!route.push && !route.webhook) return none("kind");
  return { push: route.push, webhook: route.webhook, muted: null };
}

export const MUTE_REASONS: Record<MuteReason, string> = {
  paused: "paused",
  quiet: "quiet hours",
  kind: "turned off",
  source: "source muted",
};

// ── Alerts while a chart is open (this browser only) ──

/** What an open Charts page alerts on, in this browser. */
export interface OpenChartAlerts {
  /** The page's alerts switch (also on the Charts page's Alerts card). */
  on: boolean;
  lines: boolean;
  zones: boolean;
  /** An indicator's `alert()` calls. */
  indicators: boolean;
}

export const OPEN_CHART_ALERTS_KEY = "journal-chart-alerts-v1";
const OPEN_CHART_KINDS_KEY = "journal-chart-alert-kinds-v1";

export function readOpenChartAlerts(on: string | null, kinds: string | null): OpenChartAlerts {
  let parsed: Partial<OpenChartAlerts> = {};
  try {
    parsed = kinds ? (JSON.parse(kinds) as Partial<OpenChartAlerts>) : {};
  } catch {
    // Every kind on.
  }
  return {
    on: on === "on",
    lines: parsed.lines !== false,
    zones: parsed.zones !== false,
    indicators: parsed.indicators !== false,
  };
}

/** Per-browser convenience; blocked storage keeps the defaults (off, every kind). */
export const openChartAlerts = {
  read(): OpenChartAlerts {
    try {
      return readOpenChartAlerts(
        localStorage.getItem(OPEN_CHART_ALERTS_KEY),
        localStorage.getItem(OPEN_CHART_KINDS_KEY),
      );
    } catch {
      return readOpenChartAlerts(null, null);
    }
  },
  write(value: OpenChartAlerts) {
    try {
      localStorage.setItem(OPEN_CHART_ALERTS_KEY, value.on ? "on" : "off");
      localStorage.setItem(
        OPEN_CHART_KINDS_KEY,
        JSON.stringify({ lines: value.lines, zones: value.zones, indicators: value.indicators }),
      );
    } catch {
      // This page only.
    }
  },
};
