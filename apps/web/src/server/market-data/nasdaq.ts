import { RESOLUTIONS } from "@/lib/market-data";
import { MarketDataError, type MarketDataProvider, type SymbolMatch } from "./provider";
import { readJson, record, result, validateBars } from "./http";

/**
 * Daily candles for US stocks and ETFs from the JSON behind nasdaq.com's historical quotes
 * (no key, not a documented API: it can change). It serves daily candles only, for the last
 * ten years, split adjusted. A range shorter than a week answers nothing, so every request
 * reaches a week further back and the extra days are dropped. Indices are left out: their
 * opens there are often outside the day's range (the prior close), which no candle can be.
 */
const NASDAQ = "https://api.nasdaq.com/api";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; TradeJournal/1.0)",
  Accept: "application/json",
};
const DAY = RESOLUTIONS["1d"];
const YEARS = 10;

export const NASDAQ_CLASSES = ["stocks", "etf"] as const;
export type NasdaqClass = (typeof NASDAQ_CLASSES)[number];
const isNasdaqClass = (value: unknown): value is NasdaqClass =>
  (NASDAQ_CLASSES as readonly unknown[]).includes(value);
/** How the lookup names each class. */
const LOOKUP_ASSET: Record<NasdaqClass, string> = { stocks: "STOCKS", etf: "ETF" };

const NASDAQ_SYMBOL = /^[A-Z0-9.^-]{1,12}$/;

const classOf = (dataset: string | null | undefined): NasdaqClass => {
  if (!isNasdaqClass(dataset))
    throw new MarketDataError("Choose what the Nasdaq symbol is: a stock or an ETF.");
  return dataset;
};

/** "$1,234.50" or "26,584.06" → a number; "--" and "N/A" (an index's volume) → NaN. */
export const nasdaqNumber = (text: unknown) =>
  typeof text === "string" ? Number(text.replace(/[$,\s]/g, "")) : NaN;

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** The reply's data, or the reason Nasdaq gave (an unknown symbol, a wrong class). */
function dataOf(body: unknown): Record<string, unknown> | null {
  const reply = record(body);
  if (reply.data && typeof reply.data === "object") return record(reply.data);
  const status = reply.status && typeof reply.status === "object" ? record(reply.status) : {};
  const messages = Array.isArray(status.bCodeMessage) ? status.bCodeMessage : [];
  const message = messages
    .map((item) =>
      item && typeof item === "object" ? String(record(item).errorMessage ?? "") : "",
    )
    .find(Boolean);
  if (message) throw new MarketDataError(`Nasdaq: ${message.slice(0, 160).replace(/\.$/, "")}.`);
  return null;
}

export const nasdaq: MarketDataProvider = {
  id: "nasdaq",
  name: "Nasdaq",
  environmentKey: "",
  async test() {
    const to = Date.now();
    dataOf(
      await readJson(
        `${NASDAQ}/quote/AAPL/historical?assetclass=stocks&fromdate=${isoDay(to - 14 * DAY)}&todate=${isoDay(to)}&limit=20`,
        HEADERS,
        undefined,
        { cache: false },
      ),
    );
  },
  async history(request) {
    const assetClass = classOf(request.dataset);
    if (!NASDAQ_SYMBOL.test(request.symbol))
      throw new MarketDataError("Use a US symbol such as AAPL or SPY.");
    if (request.resolution !== "1d")
      throw new MarketDataError(
        "Nasdaq serves daily candles only. Choose 1d or 1w, or another source for intraday candles.",
      );
    const earliest = Date.now() - YEARS * 365 * DAY;
    if (request.to <= earliest)
      throw new MarketDataError(`Nasdaq keeps the last ${YEARS} years of daily candles only.`);
    const from = Math.max(request.from, earliest);
    const query = new URLSearchParams({
      assetclass: assetClass,
      fromdate: isoDay(from - 7 * DAY),
      todate: isoDay(request.to + DAY),
      limit: "9999",
    });
    const data = dataOf(
      await readJson(
        `${NASDAQ}/quote/${encodeURIComponent(request.symbol)}/historical?${query}`,
        HEADERS,
        request.signal,
      ),
    );
    const table = data?.tradesTable ? record(data.tradesTable) : null;
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const bars = validateBars(
      rows.flatMap((item) => {
        const row = record(item);
        const [month, day, year] = String(row.date ?? "")
          .split("/")
          .map(Number);
        const time = Date.UTC(year!, month! - 1, day!);
        const volume = nasdaqNumber(row.volume);
        return Number.isFinite(time)
          ? [
              {
                time,
                open: nasdaqNumber(row.open),
                high: nasdaqNumber(row.high),
                low: nasdaqNumber(row.low),
                close: nasdaqNumber(row.close),
                volume: Number.isFinite(volume) ? volume : 0,
              },
            ]
          : [];
      }),
    );
    if (!bars.length && !data)
      throw new MarketDataError(
        `Nasdaq returned no ${assetClass === "etf" ? "ETF" : "stock"} ${request.symbol}. Check the symbol and what it is.`,
      );
    return result(
      this.name,
      request,
      bars,
      request.from < earliest,
      [
        "Nasdaq daily prices for the regular session, split adjusted and in US dollars. Unadjusted historical fills from before a split will not match.",
      ],
      "USD",
    );
  },
  async symbols(query, dataset, _key, signal) {
    const assetClass = classOf(dataset);
    const q = query.trim();
    if (!q) return [];
    const reply = record(
      await readJson(
        `${NASDAQ}/autocomplete/slookup/10?search=${encodeURIComponent(q)}`,
        HEADERS,
        signal,
        { ttlMs: 3_600_000 },
      ),
    );
    const rows = Array.isArray(reply.data) ? reply.data.map(record) : [];
    return rows
      .filter(
        (row) => typeof row.symbol === "string" && String(row.asset) === LOOKUP_ASSET[assetClass],
      )
      .map((row): SymbolMatch => ({
        symbol: String(row.symbol),
        description: [row.name, row.exchange].filter((part) => part).join(" · "),
      }));
  },
};
