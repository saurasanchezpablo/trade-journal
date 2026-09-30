"use client";

import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionList } from "@/components/backtest/session-list";
import { StrategyTester } from "@/components/backtest/strategy-tester";

export default function BacktestPage() {
  return (
    <Suspense>
      <FilterBar title="Backtesting" />
      <div className="space-y-3 p-4">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Test a setup on past candles before risking money. <strong>Replay</strong> hides the
          future and reveals candles one at a time while you place orders with a stop loss and a
          target, sized from your risk; every trade is logged with its R, and the report sums it up.{" "}
          <strong>Strategy tester</strong> runs a Pine Script strategy over a date range.
        </p>
        <Tabs defaultValue="replay">
          <TabsList>
            <TabsTrigger value="replay">Replay</TabsTrigger>
            <TabsTrigger value="strategy">Strategy tester</TabsTrigger>
          </TabsList>
          <TabsContent value="replay">
            <SessionList />
          </TabsContent>
          <TabsContent value="strategy">
            <StrategyTester />
          </TabsContent>
        </Tabs>
      </div>
    </Suspense>
  );
}
