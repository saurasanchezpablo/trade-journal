import { research } from "@luxalgo/journal-core";
import { readJson } from "../market-data/http";
import { MarketDataError } from "../market-data/provider";
import { lastTime, loadBars, loadFunding, saveBars, saveFunding } from "./store";

/**
 * Market data for strategy research: Binance's public, keyless endpoints (no account, no
 * credentials), asked through the journal's shared transport, which spaces requests per host
 * well under the published limits. Only closed daily candles are stored; each refresh asks
 * only for what is newer than the last stored day (plus that day again, in case it was
 * stored before it closed, which `closedOnly` prevents anyway).
 */
const DAY = 86_400_000;
const SPOT = "https://data-api.binance.vision/api/v3/klines";
const PERP = "https://fapi.binance.com/fapi/v1/klines";
const FUNDING = "https://fapi.binance.com/fapi/v1/fundingRate";
/** Binance's first daily candles: spot August 2017, USD-M perpetuals September 2019. */
const EARLIEST = { spot: Date.UTC(2017, 7, 1), perp: Date.UTC(2019, 8, 1) };
const MAX_PAGES = 40;

export const seriesId = (id: research.ResearchInstrumentId) => {
  const { symbol, kind } = research.RESEARCH_INSTRUMENTS[id];
  return `binance:${kind}:${symbol}:1d`;
};
export const fundingSeriesId = (id: research.ResearchInstrumentId) =>
  `binance:perp:${research.RESEARCH_INSTRUMENTS[id].symbol}:funding`;

/** Network access, replaced in tests. */
export const fetcher = {
  json: (url: string, signal?: AbortSignal) => readJson(url, {}, signal, { cache: false }),
};

const finite = (v: unknown) =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;

/**
 * Parse Binance kline rows into closed daily bars. Rows that are not well-formed candles
 * (missing values, non-positive prices, high below low) are refused rather than repaired.
 */
export function parseKlines(rows: unknown, now: number): research.DailyBar[] {
  if (!Array.isArray(rows)) throw new MarketDataError("Unexpected candle list from Binance.");
  const bars: research.DailyBar[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7)
      throw new MarketDataError("Unexpected candle from Binance.");
    const [time, open, high, low, close, volume, closeTime] = row.map(finite);
    const bar = {
      time: time!,
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volume!,
    };
    if (
      !Object.values(bar).every(Number.isFinite) ||
      bar.time % DAY !== 0 ||
      Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 ||
      bar.volume < 0 ||
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close)
    )
      throw new MarketDataError("Invalid daily candle from Binance; nothing was stored.");
    // Closed candles only: the day still trading is never stored.
    if (!(closeTime! < now)) continue;
    bars.push(bar);
  }
  return bars;
}

export function parseFunding(rows: unknown): research.FundingEvent[] {
  if (!Array.isArray(rows)) throw new MarketDataError("Unexpected funding list from Binance.");
  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const time = finite(r.fundingTime);
    const rate = finite(r.fundingRate);
    if (!Number.isFinite(time) || !Number.isFinite(rate) || Math.abs(rate) > 0.05)
      throw new MarketDataError("Invalid funding rate from Binance; nothing was stored.");
    return { time, rate };
  });
}

/** Fetch and store the newer closed daily candles of an instrument; returns how many. */
export async function refreshBars(
  id: research.ResearchInstrumentId,
  now = Date.now(),
  signal?: AbortSignal,
) {
  const { symbol, kind } = research.RESEARCH_INSTRUMENTS[id];
  const series = seriesId(id);
  const endpoint = kind === "spot" ? SPOT : PERP;
  const limit = kind === "spot" ? 1000 : 1500;
  let from = lastTime(series) ?? EARLIEST[kind];
  let stored = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${endpoint}?symbol=${symbol}&interval=1d&startTime=${from}&limit=${limit}`;
    const bars = parseKlines(await fetcher.json(url, signal), now);
    if (!bars.length) break;
    saveBars({ series, provider: "binance", endpoint, symbol, kind }, bars);
    stored += bars.length;
    const last = bars[bars.length - 1]!.time;
    if (last + 2 * DAY > now || last < from) break;
    from = last + DAY;
  }
  return stored;
}

/** Fetch and store the newer funding events of a perpetual; returns how many. */
export async function refreshFunding(
  id: research.ResearchInstrumentId,
  now = Date.now(),
  signal?: AbortSignal,
) {
  const { symbol } = research.RESEARCH_INSTRUMENTS[id];
  const series = fundingSeriesId(id);
  let from = (lastTime(series) ?? EARLIEST.perp - 1) + 1;
  let stored = 0;
  for (let page = 0; page < MAX_PAGES * 4; page++) {
    const url = `${FUNDING}?symbol=${symbol}&startTime=${from}&limit=1000`;
    const events = parseFunding(await fetcher.json(url, signal)).filter(
      (e) => e.time >= from && e.time <= now,
    );
    if (!events.length) break;
    saveFunding(
      { series, provider: "binance", endpoint: FUNDING, symbol, kind: "funding" },
      events,
    );
    stored += events.length;
    from = events[events.length - 1]!.time + 1;
    if (events.length < 1000) break;
  }
  return stored;
}

/** Refresh every instrument the catalog trades. */
export async function refreshAll(now = Date.now(), signal?: AbortSignal) {
  const counts: Record<string, number> = {};
  for (const id of Object.keys(research.RESEARCH_INSTRUMENTS) as research.ResearchInstrumentId[]) {
    counts[seriesId(id)] = await refreshBars(id, now, signal);
    if (research.RESEARCH_INSTRUMENTS[id].kind === "perp")
      counts[fundingSeriesId(id)] = await refreshFunding(id, now, signal);
  }
  return counts;
}

/** The catalog's instruments from storage, ready for the engine. */
export function loadInstruments(): research.Instrument[] {
  return (Object.keys(research.RESEARCH_INSTRUMENTS) as research.ResearchInstrumentId[]).map(
    (id) => {
      const { kind } = research.RESEARCH_INSTRUMENTS[id];
      return {
        id,
        kind,
        bars: loadBars(seriesId(id)),
        ...(kind === "perp" ? { funding: loadFunding(fundingSeriesId(id)) } : {}),
      };
    },
  );
}

/**
 * Series that are behind: their last closed day is before yesterday (UTC). Signals from stale
 * data would be stale signals, so the monitor skips the strategies that use them.
 */
export function staleSeries(
  instruments: readonly research.Instrument[],
  now = Date.now(),
): string[] {
  const yesterday = Math.floor(now / DAY) * DAY - DAY;
  return instruments
    .filter((i) => {
      const last = i.bars[i.bars.length - 1]?.time ?? -Infinity;
      return last < yesterday;
    })
    .map((i) => i.id);
}
