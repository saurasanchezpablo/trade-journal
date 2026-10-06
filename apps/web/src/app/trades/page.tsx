"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  tableFeatures,
  useTable,
  sortFns,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowUpDown, Check, Columns3, Download, Tag, Trash2 } from "lucide-react";
import { dayKeyOf, returnOnNotional, type TradeMetrics } from "@luxalgo/journal-core";
import { FilterBar, useFilters } from "@/components/filter-bar";
import { useI18n } from "@/components/i18n";
import { Pnl } from "@/components/pnl";
import { MonetaryValue } from "@/components/privacy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkLabelSuggestions } from "@/components/label-suggestions";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Loading from "@/app/loading";
import { postJson, useApi } from "@/lib/use-api";
import { cn, fmtDuration, fmtMoney, fmtNumber, fmtPercent } from "@/lib/utils";

interface TradeRow {
  key: string;
  accountId: string;
  symbol: string;
  direction: "long" | "short";
  status: string;
  openedAt: string;
  closedAt: string | null;
  quantity: number;
  avgEntry: number;
  avgExit: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  executionCount: number;
  durationMs: number | null;
  rating: number | null;
  tags: string[];
  mistakes: string[];
  reviewed: boolean;
  contractMultiplier: number | null;
}

const features = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  columnVisibilityFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

const EMPTY_TRADES: TradeRow[] = [];

/** The displayed word for a trade status (the API value stays as it is). */
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  win: "Win",
  loss: "Loss",
  breakeven: "Breakeven",
};

export default function TradesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Trades />
    </Suspense>
  );
}

function Trades() {
  const { t, tn, tx } = useI18n();
  const { query } = useFilters();
  const { data, error, refresh } = useApi<{
    trades: TradeRow[];
    metrics: TradeMetrics;
    timeZone: string;
  }>(`/api/trades?view=list&${query}`);
  const router = useRouter();
  const timeZone = data?.timeZone ?? "UTC";
  const [tagInput, setTagInput] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [showColumns, setShowColumns] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  useEffect(() => setPage(0), [query]);

  const columns = useMemo<ColumnDef<typeof features, TradeRow>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
            aria-label={t("Select all matching trades")}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(value === true)}
            onClick={(event) => event.stopPropagation()}
            aria-label={t("Select trade")}
          />
        ),
      },
      {
        id: "closedAt",
        accessorKey: "closedAt",
        header: t("Close date"),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {getValue<string | null>()
              ? dayKeyOf(getValue<string>(), timeZone)
              : tx("status", "Open").toLowerCase()}
          </span>
        ),
      },
      {
        id: "symbol",
        accessorKey: "symbol",
        header: t("Symbol"),
        cell: ({ row, getValue }) => (
          <span className="flex items-center gap-2 font-medium">
            {/* A real link, so keyboard users and new tabs reach the trade too. */}
            <Link
              href={`/trades/${encodeURIComponent(row.original.key)}?${query}`}
              onClick={(event) => event.stopPropagation()}
              className="hover:underline focus-visible:underline"
            >
              {getValue<string>()}
            </Link>
            <span className="text-xs text-muted-foreground">
              {row.original.direction === "short" ? t("short") : t("long")}
            </span>
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: t("Status"),
        cell: ({ getValue }) => {
          const status = getValue<string>();
          return (
            <Badge variant={status === "win" ? "profit" : status === "loss" ? "loss" : "secondary"}>
              {tx("status", STATUS_LABEL[status] ?? status).toUpperCase()}
            </Badge>
          );
        },
      },
      {
        id: "quantity",
        accessorKey: "quantity",
        header: t("Volume"),
        cell: ({ getValue }) => <span className="tnum">{fmtNumber(getValue<number>(), 4)}</span>,
      },
      {
        id: "avgEntry",
        accessorKey: "avgEntry",
        header: t("Entry"),
        cell: ({ getValue }) => (
          <span className="tnum">
            <MonetaryValue>{fmtNumber(getValue<number>())}</MonetaryValue>
          </span>
        ),
      },
      {
        id: "avgExit",
        accessorKey: "avgExit",
        header: t("Exit"),
        cell: ({ getValue }) => (
          <span className="tnum">
            <MonetaryValue>
              {getValue<number | null>() === null ? "–" : fmtNumber(getValue<number>()!)}
            </MonetaryValue>
          </span>
        ),
      },
      {
        id: "netPnl",
        accessorKey: "netPnl",
        header: t("Net P&L"),
        cell: ({ getValue }) => <Pnl value={getValue<number>()} />,
      },
      {
        id: "roi",
        accessorFn: (row) =>
          returnOnNotional({
            ...row,
            contractMultiplier: row.contractMultiplier ?? undefined,
          }) ?? 0,
        header: t("Net ROI"),
        cell: ({ getValue }) => <span className="tnum">{fmtPercent(getValue<number>(), 2)}</span>,
      },
      {
        id: "fees",
        accessorKey: "fees",
        header: t("Fees"),
        cell: ({ getValue }) => (
          <span className="tnum text-muted-foreground">
            <MonetaryValue>{fmtMoney(getValue<number>())}</MonetaryValue>
          </span>
        ),
      },
      {
        id: "durationMs",
        accessorKey: "durationMs",
        header: t("Duration"),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{fmtDuration(getValue<number | null>())}</span>
        ),
      },
      {
        id: "executionCount",
        accessorKey: "executionCount",
        header: t("Execs"),
        cell: ({ getValue }) => (
          <span className="tnum text-muted-foreground">{getValue<number>()}</span>
        ),
      },
      {
        id: "tags",
        accessorKey: "tags",
        enableSorting: false,
        header: t("Tags"),
        cell: ({ getValue }) => (
          <span className="flex max-w-40 flex-wrap gap-1">
            {getValue<string[]>().map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </span>
        ),
      },
      {
        id: "rating",
        accessorKey: "rating",
        header: t("Rating"),
        cell: ({ getValue }) => {
          const rating = getValue<number | null>();
          return (
            <span className="text-muted-foreground">
              {rating === null ? "–" : "★".repeat(rating)}
            </span>
          );
        },
      },
      {
        id: "reviewed",
        accessorKey: "reviewed",
        header: t("Reviewed"),
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <Check className="h-4 w-4 text-profit" />
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
    ],
    [timeZone, query, t, tx],
  );

  const table = useTable({
    features,
    columns,
    data: data?.trades ?? EMPTY_TRADES,
    getRowId: (row) => row.key,
    initialState: {
      sorting: [{ id: "closedAt", desc: true }],
      columnVisibility: { fees: false, executionCount: false, rating: false },
    },
  });

  const selectedKeys = table.getSelectedRowModel().rows.map((row) => row.original.key);
  const sortedRows = table.getRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = sortedRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  /** Run a bulk action once at a time; true when it saved. */
  const bulk = async (action: string, extra?: Record<string, unknown>): Promise<boolean> => {
    if (bulkBusy) return false;
    setBulkBusy(true);
    setBulkError("");
    try {
      await postJson("/api/trades/bulk", { keys: selectedKeys, action, ...extra });
      table.resetRowSelection();
      refresh();
      return true;
    } catch (cause) {
      setBulkError(cause instanceof Error ? cause.message : t("The action failed."));
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  const m = data?.metrics;
  return (
    <div>
      <FilterBar
        title={t("Trades")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/export?format=csv&${query}`} download>
                <Download />
                CSV
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowColumns((value) => !value)}>
              <Columns3 />
              {t("Columns")}
            </Button>
          </div>
        }
      />
      <div className="space-y-3 p-4">
        {m && (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("Net cumulative P&L")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Pnl value={m.netPnl} className="text-xl font-semibold" />
                <span className="ml-2 text-xs text-muted-foreground">
                  {tn(m.closedTrades, "{count} trade", "{count} trades")}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Profit factor")}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-xl font-semibold tnum">
                  {m.profitFactorIsInfinite
                    ? "∞"
                    : m.profitFactor === null
                      ? "–"
                      : fmtNumber(m.profitFactor)}
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Trade win %")}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-xl font-semibold tnum">{fmtPercent(m.winRate)}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Avg win / loss")}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-xl font-semibold tnum">
                  {m.avgWinLossRatio === null ? "–" : fmtNumber(m.avgWinLossRatio)}
                </span>
              </CardContent>
            </Card>
          </div>
        )}

        {showColumns && (
          <Card>
            <CardContent className="flex flex-wrap gap-3 py-3">
              {table
                .getAllLeafColumns()
                .filter((column) => column.id !== "select")
                .map((column) => (
                  <label key={column.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(value === true)}
                    />
                    {typeof column.columnDef.header === "string"
                      ? column.columnDef.header
                      : column.id}
                  </label>
                ))}
            </CardContent>
          </Card>
        )}

        {selectedKeys.length > 0 && (
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-sm text-muted-foreground">
                {t("{count} selected", { count: selectedKeys.length })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkBusy}
                onClick={() => void bulk("review")}
              >
                <Check />
                {t("Mark reviewed")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={bulkBusy}
                onClick={() => void bulk("unreview")}
              >
                {t("Unreview")}
              </Button>
              <div className="flex max-w-full flex-wrap items-center gap-1">
                <Input
                  aria-label={t("Tag to add")}
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder={t("tag")}
                  className="h-8 w-28 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!tagInput.trim() || bulkBusy}
                  onClick={async () => {
                    if (await bulk("tag", { tag: tagInput.trim() })) setTagInput("");
                  }}
                >
                  <Tag />
                  {tx("action", "Tag")}
                </Button>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={bulkBusy}
                onClick={() => {
                  if (
                    confirm(
                      tn(
                        selectedKeys.length,
                        "Delete {count} trade and its executions? This cannot be undone.",
                        "Delete {count} trades and their executions? This cannot be undone.",
                      ),
                    )
                  )
                    void bulk("delete");
                }}
              >
                <Trash2 />
                {t("Delete")}
              </Button>
              {bulkError && (
                <p role="alert" className="basis-full text-sm text-destructive">
                  {bulkError}
                </p>
              )}
              <div className="basis-full">
                <BulkLabelSuggestions
                  key={selectedKeys.join("|")}
                  keys={selectedKeys}
                  timeZone={timeZone}
                  onChanged={refresh}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {error ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{error}</p>
            <Button variant="outline" onClick={refresh}>
              {t("Try again")}
            </Button>
          </div>
        ) : !data ? (
          <Skeleton className="h-96" />
        ) : (
          <Card>
            <div className="relative min-w-0 max-w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="h-9 whitespace-nowrap px-2 text-left text-xs font-medium text-muted-foreground"
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <button
                              className="inline-flex items-center gap-1 hover:text-foreground"
                              onClick={(event) => {
                                setPage(0);
                                header.column.getToggleSortingHandler()?.(event);
                              }}
                            >
                              <table.FlexRender header={header} />
                              <ArrowUpDown
                                className={cn(
                                  "h-3 w-3",
                                  header.column.getIsSorted() && "text-foreground",
                                )}
                              />
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/trades/${encodeURIComponent(row.original.key)}?${query}`)
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="whitespace-nowrap px-2 py-2 align-middle">
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="py-16 text-center text-muted-foreground"
                      >
                        {t("No trades match these filters.")}{" "}
                        <Link href="/import" className="underline">
                          {t("Import some")}
                        </Link>
                        .
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {sortedRows.length > pageSize && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
                <span>
                  {t("{from}–{to} of {total} trades", {
                    from: currentPage * pageSize + 1,
                    to: Math.min((currentPage + 1) * pageSize, sortedRows.length),
                    total: fmtNumber(sortedRows.length, 0),
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    {t("Previous")}
                  </Button>
                  <span>
                    {t("Page {page} of {pages}", { page: currentPage + 1, pages: pageCount })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage + 1 === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    {t("Next")}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
