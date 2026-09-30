import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Against the real keyless sources (network): run with LIVE_MARKET_DATA=1. Skipped otherwise,
 * so CI never depends on them. It checks that each still answers in the shape the adapters
 * read, since unofficial endpoints (Yahoo Finance, Nasdaq) change without notice. Yahoo refuses
 * some networks outright; its failure is reported, not hidden.
 */
const live = Boolean(process.env.LIVE_MARKET_DATA);
const originalDir = process.env.JOURNAL_DATA_DIR;
const scratch = mkdtempSync(join(tmpdir(), "journal-live-market-"));
process.env.JOURNAL_DATA_DIR = scratch;
const { providerFor } = await import("../src/server/market-data/connections");
afterAll(() => {
  if (originalDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDir;
  rmSync(scratch, { recursive: true, force: true });
});

const H = 3_600_000;
const D = 24 * H;
const now = Date.now();
const cases: {
  provider: string;
  symbol: string;
  dataset?: string;
  resolution: "1m" | "5m" | "1h" | "4h" | "1d" | "1w";
  from: number;
  search?: string;
}[] = [
  {
    provider: "okx",
    symbol: "BTC-USDT",
    dataset: "spot",
    resolution: "1h",
    from: now - 3 * D,
    search: "btc",
  },
  {
    provider: "okx",
    symbol: "ETH-USDT-SWAP",
    dataset: "swap",
    resolution: "1m",
    from: Date.UTC(2024, 0, 2),
    search: "eth",
  },
  { provider: "kraken", symbol: "EURUSD", resolution: "1h", from: now - 5 * D, search: "eur" },
  { provider: "kraken", symbol: "XBTUSD", resolution: "4h", from: now - 20 * D },
  {
    provider: "nasdaq",
    symbol: "AAPL",
    dataset: "stocks",
    resolution: "1d",
    from: now - 60 * D,
    search: "apple",
  },
  { provider: "nasdaq", symbol: "SPY", dataset: "etf", resolution: "1w", from: now - 200 * D },
  { provider: "yahoo", symbol: "^IXIC", resolution: "1h", from: now - 5 * D },
  { provider: "yahoo", symbol: "AAPL", resolution: "5m", from: now - 3 * D, search: "apple" },
  { provider: "yahoo", symbol: "EURUSD=X", resolution: "1d", from: now - 30 * D },
];

describe.skipIf(!live)("keyless market data, live", () => {
  for (const c of cases)
    it(`${c.provider} ${c.symbol} ${c.resolution}`, { timeout: 90_000 }, async () => {
      const provider = providerFor(c.provider);
      const to =
        c.resolution === "1d" || c.resolution === "1w" ? now : Math.min(now, c.from + 2 * D);
      const history = await provider.history(
        { symbol: c.symbol, dataset: c.dataset, resolution: c.resolution, from: c.from, to },
        "",
      );
      console.log(
        c.provider,
        c.symbol,
        c.resolution,
        history.bars.length,
        "bars",
        history.quoteCurrency,
        history.bars[0],
        history.warnings.join(" | ").slice(0, 160),
      );
      expect(history.bars.length).toBeGreaterThan(0);
      if (c.search) {
        const found = await provider.symbols!(c.search, c.dataset ?? null, "");
        console.log("  search", c.search, found.slice(0, 3));
        expect(found.length).toBeGreaterThan(0);
      }
    });
});
