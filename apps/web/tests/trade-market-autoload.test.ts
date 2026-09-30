// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/use-api", () => ({
  useApi: (url: string | null) => ({
    data: url === "/api/market-data/connections" ? { connections: [] } : null,
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/components/trade-chart", () => ({ TradeChart: () => null }));
const { TradeMarketData } = await import("../src/components/trade-market-data");

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/market-source"))
      return {
        ok: true,
        json: async () => ({
          source: {
            provider: "binance",
            providerName: "Binance",
            symbol: "BTCUSDT",
            dataset: null,
            resolution: "1m",
            via: "exchange",
          },
        }),
      };
    if (init?.method === "POST") return new Promise(() => {});
    throw new Error(`unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const trade = {
  key: "t1",
  symbol: "BTCUSD",
  direction: "long",
  openedAt: "2026-09-15T13:30:00.000Z",
  closedAt: "2026-09-15T14:00:00.000Z",
  netPnl: 10,
  avgEntry: 60000,
  avgExit: 60100,
  currency: "USD",
};

describe("a trade page's candles", () => {
  it("load by themselves, once, also under React Strict Mode", async () => {
    await act(async () =>
      root.render(
        createElement(StrictMode, null, createElement(TradeMarketData, { trade, executions: [] })),
      ),
    );
    await act(async () => {});
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]![1].body)).toMatchObject({ provider: "binance", symbol: "BTCUSDT" });
    expect(container.textContent).toContain("BTCUSDT 1m candles from Binance");
  });
});
