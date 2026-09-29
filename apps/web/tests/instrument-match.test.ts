import { describe, expect, it } from "vitest";
import { baseOf, instrumentMatches, journalKey, pickInstrument } from "../src/lib/instrument-match";

describe("a journal symbol matched to an exchange instrument", () => {
  it("reads the coin however the broker wrote it", () => {
    for (const s of [
      "BTC",
      "BTCUSD",
      "BTC/USDT",
      "XBTUSD",
      "BTCUSDT.P",
      "BINANCE:BTCUSDT",
      "BTC-PERP",
      "btcusdt",
    ])
      expect(baseOf(s), s).toBe("BTC");
    expect(journalKey("BTCUSDT.P")).toBe("BTCUSDT");
  });

  it("matches dollar pairs across stablecoins, and a bare coin to its dollar pair", () => {
    expect(instrumentMatches("BTCUSD", "BTCUSDT")).toBe(true);
    expect(instrumentMatches("BTC", "BTC-USD")).toBe(true);
    expect(instrumentMatches("XBTUSD", "BTCUSDT")).toBe(true);
    expect(instrumentMatches("BTC", "BTCEUR")).toBe(false);
    expect(instrumentMatches("ETHBTC", "BTCUSDT")).toBe(false);
    expect(instrumentMatches("BTCUSD", "WBTCUSDT")).toBe(false);
  });

  it("follows the exchange's ranking, unless a particular stablecoin is written", () => {
    // Ranked as Binance's listing is: USDT first, then USDC, then the thin USD pair.
    const binance = ["BTCUSDT", "BTCUSDC", "BTCUSD", "WBTCUSDT", "BTCEUR"];
    expect(pickInstrument("BTC", binance)).toBe("BTCUSDT");
    expect(pickInstrument("BTCUSD", binance)).toBe("BTCUSDT");
    expect(pickInstrument("BTC/USDC", binance)).toBe("BTCUSDC");
    expect(pickInstrument("BTCUSD", ["BTC-USD", "BTC-USDT"])).toBe("BTC-USD");
    expect(pickInstrument("DOGE", binance)).toBeNull();
  });
});
