"use client";

import { Suspense, use } from "react";
import { FilterBar } from "@/components/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionWorkspace } from "@/components/backtest/session-workspace";
import type { BacktestSession } from "@/lib/backtest-session";
import { useApi } from "@/lib/use-api";

export default function BacktestSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <FilterBar title="Backtesting" />
      <Session key={id} id={id} />
    </Suspense>
  );
}

function Session({ id }: { id: string }) {
  const { data, error } = useApi<{ session: BacktestSession }>(
    `/api/backtests/${encodeURIComponent(id)}`,
  );
  if (error)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {error}
      </p>
    );
  if (!data) return <Skeleton className="m-4 h-[600px]" />;
  return <SessionWorkspace initial={data.session} />;
}
