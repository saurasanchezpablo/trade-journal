/**
 * Example Pine Script strategies for the strategy tester: ordinary scripts to run as they are
 * or to start your own from. Their capital, sizing and commission are in the `strategy()`
 * line, as in TradingView.
 */
export interface ExampleStrategy {
  key: string;
  name: string;
  source: string;
}

export const EXAMPLE_STRATEGIES: ExampleStrategy[] = [
  {
    key: "sma-cross",
    name: "Moving average crossover",
    source: `//@version=5
strategy("SMA crossover", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.05)
fastLength = input.int(20, "Fast length", minval=1)
slowLength = input.int(50, "Slow length", minval=2)
fast = ta.sma(close, fastLength)
slow = ta.sma(close, slowLength)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
plot(fast, "Fast", color=color.aqua)
plot(slow, "Slow", color=color.orange)`,
  },
  {
    key: "rsi-reversion",
    name: "RSI mean reversion with stop and target",
    source: `//@version=5
strategy("RSI reversion", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10)
rsiLength = input.int(14, "RSI length", minval=2)
oversold = input.int(30, "Oversold")
stopPct = input.float(2.0, "Stop loss %") / 100
targetPct = input.float(4.0, "Take profit %") / 100
rsi = ta.rsi(close, rsiLength)
if ta.crossover(rsi, oversold) and strategy.position_size == 0
    strategy.entry("Long", strategy.long)
if strategy.position_size > 0
    strategy.exit("Exit", "Long", stop=strategy.position_avg_price * (1 - stopPct), limit=strategy.position_avg_price * (1 + targetPct))`,
  },
];
