// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HistoricalReplay } from "../src/components/trade-market-data";
import { TooltipProvider } from "../src/components/ui/tooltip";
import type { TradeMarketResult } from "../src/lib/market-data";

const renderer = vi.hoisted(() => ({
  create: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock("@luxalgo/vela", () => ({
  Vela: class {
    constructor(...args: unknown[]) {
      return renderer.create(...args);
    }
  },
  registerNativeIndicator: renderer.register,
  unregisterNativeIndicator: renderer.unregister,
}));

const history: TradeMarketResult = {
  provider: "csv",
  symbol: "TEST",
  resolution: "1m",
  fetchedAt: "2026-10-06T12:00:00Z",
  truncated: false,
  warnings: [],
  bars: [0, 1, 2].map((minute) => ({
    time: Date.parse("2026-10-06T10:00:00Z") + minute * 60_000,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 10,
  })),
  estimate: { mae: -1, mfe: 2, sampledBars: 3, excludedBars: 0, warnings: [] },
};
const props = {
  history,
  trade: {
    key: "test",
    symbol: "TEST",
    direction: "long",
    openedAt: "2026-10-06T10:00:00Z",
    closedAt: "2026-10-06T10:03:00Z",
    netPnl: 1,
    avgEntry: 100,
    currency: "USD",
  },
  executions: [],
  privacy: false,
};
type Feed = {
  getBars(ticker: string, timeframe: string, range: object): Promise<unknown[]>;
  subscribe(ticker: string, timeframe: string, onBar: (bar: unknown) => void): () => void;
};
/** A chart that loads the replay's data source as Vela does: on creation and on each redraw. */
const chart = () => {
  const instance = {
    feed: null as Feed | null,
    pushed: [] as unknown[],
    data: { registerProvider: vi.fn((_name: string, feed: Feed) => (instance.feed = feed)) },
    renderer: {},
    addNativeIndicator: vi.fn(),
    ready: vi.fn().mockResolvedValue(undefined),
    setMarket: vi.fn(async () => {
      instance.feed?.subscribe("", "", (bar) => instance.pushed.push(bar));
    }),
    setTheme: vi.fn(),
    destroy: vi.fn(),
  };
  return instance;
};
/** The candles the chart can load from the replay source right now. */
const loaded = (instance: ReturnType<typeof chart>) => instance.feed!.getBars("", "", {});
let container: HTMLDivElement, root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  renderer.create.mockImplementation(chart);
  await import("@luxalgo/vela");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === label || item.textContent === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
};

it.each([false, true])(
  "loads candles and operates replay when randomUUID is available: %s",
  async (available) => {
    // HTTP LAN origins omit randomUUID; jsdom does not enforce secure contexts itself.
    vi.stubGlobal("crypto", available ? { randomUUID: () => "test-uuid" } : {});
    await act(async () =>
      root.render(createElement(TooltipProvider, null, createElement(HistoricalReplay, props))),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-busy="false"]')).not.toBeNull();
    expect(renderer.create).toHaveBeenCalledOnce();
    const instance = renderer.create.mock.results[0]!.value as ReturnType<typeof chart>;
    expect(await loaded(instance)).toEqual(history.bars);
    expect(instance.addNativeIndicator).toHaveBeenCalledWith(
      renderer.register.mock.calls[0]![0].type,
    );

    await click("Restart replay");
    expect(await loaded(instance)).toEqual(history.bars.slice(0, 1));
    await click("Next candle");
    expect(await loaded(instance)).toEqual(history.bars.slice(0, 2));
    await click("Previous candle");
    expect(await loaded(instance)).toEqual(history.bars.slice(0, 1));

    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "performance"],
    });
    await click("Play");
    // At 4 candles a second the second candle forms over 250 ms, then is complete.
    await act(async () => vi.advanceTimersByTime(300));
    expect(await loaded(instance)).toEqual(history.bars.slice(0, 2));
    expect(instance.pushed.at(-1)).toEqual(history.bars[1]);
    await click("Pause");
    const pushed = instance.pushed.length;
    await act(async () => vi.advanceTimersByTime(500));
    expect(instance.pushed).toHaveLength(pushed);
    expect(await loaded(instance)).toEqual(history.bars.slice(0, 2));
    await click("Show all candles");
    expect(await loaded(instance)).toEqual(history.bars);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  },
);

it("keeps concurrent charts distinct and cleans up their indicators on replacement and unmount", async () => {
  vi.stubGlobal("crypto", {});
  const render = (current: TradeMarketResult, second = true) =>
    createElement(
      TooltipProvider,
      null,
      createElement(HistoricalReplay, { ...props, history: current, key: "first" }),
      second && createElement(HistoricalReplay, { ...props, key: "second" }),
    );
  await act(async () => root.render(render(history, false)));
  await act(async () => vi.dynamicImportSettled());
  await act(async () => root.render(render(history)));
  await act(async () => vi.dynamicImportSettled());
  expect(renderer.register).toHaveBeenCalledTimes(2);
  const types = renderer.register.mock.calls.map(([descriptor]) => descriptor.type);
  expect(new Set(types).size).toBe(2);
  const initialInstances = renderer.create.mock.results.map((result) => result.value);

  await act(async () => root.render(render({ ...history, symbol: "OTHER" })));
  await act(async () => vi.dynamicImportSettled());
  expect(initialInstances[0].destroy).toHaveBeenCalledOnce();
  expect(initialInstances[1].destroy).not.toHaveBeenCalled();
  expect(renderer.unregister).toHaveBeenCalledExactlyOnceWith(types[0]);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelectorAll('[aria-busy="false"]')).toHaveLength(2);

  await act(async () => root.render(null));
  for (const { value } of renderer.create.mock.results) {
    expect(value.destroy).toHaveBeenCalledOnce();
  }
  expect(renderer.unregister.mock.calls.map(([type]) => type).sort()).toEqual(
    renderer.register.mock.calls.map(([descriptor]) => descriptor.type).sort(),
  );
});
