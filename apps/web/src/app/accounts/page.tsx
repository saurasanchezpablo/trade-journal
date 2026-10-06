"use client";

import { Suspense, useState } from "react";
import { Archive, ArchiveRestore, RefreshCw, Trash2 } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson, useApi } from "@/lib/use-api";
import { NOT_A_NUMBER, parseDecimalInput } from "@/lib/number-input";
import { fmtMoney } from "@/lib/utils";
import { formatTimestamp } from "@/lib/timezone";
import { MonetaryValue, MonetaryField } from "@/components/privacy";
import { useI18n } from "@/components/i18n";

interface AccountRow {
  id: string;
  name: string;
  broker: string;
  kind: "sync" | "import" | "manual";
  currency: string;
  initialBalance: number;
  profitCalcMethod: "fifo" | "lifo" | "wavg";
  autoSync: boolean;
  lastSyncAt: string | null;
  archivedAt: string | null;
  connected: boolean;
  snapshot: { equity: number; positions: unknown[] } | null;
}

export default function AccountsPage() {
  return (
    <Suspense>
      <Accounts />
    </Suspense>
  );
}

/** Money in the account's currency (USD when an old record holds an unknown code). */
const accountMoney = (value: number, currency: string) => {
  try {
    return fmtMoney(value, currency);
  } catch {
    return fmtMoney(value);
  }
};

const failureMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function Accounts() {
  const { t, tx } = useI18n();
  const { data, error, refresh } = useApi<{ accounts: AccountRow[]; timeZone?: string }>(
    "/api/accounts",
  );
  const [syncing, setSyncing] = useState<string | null>(null);
  const timeZone = data?.timeZone ?? "UTC";

  const action = async <T = unknown,>(id: string, body: Record<string, unknown>) => {
    const result = await postJson<T>(`/api/accounts/${id}/actions`, body);
    refresh();
    return result;
  };

  /** Run a change and say so when it fails (the list reloads either way). */
  const attempt = async (fallback: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (cause) {
      alert(failureMessage(cause, t(fallback)));
      refresh();
    }
  };

  const sync = async (id: string) => {
    setSyncing(id);
    try {
      const { sync: outcome } = await action<{
        sync: { inserted: number; skipped: number; skippedReasons: string[] };
      }>(id, { action: "sync" });
      if (outcome.skipped > 0)
        alert(
          t(
            "Sync finished with {inserted} new fills. {skipped} broker record(s) were skipped: {reasons}",
            {
              inserted: outcome.inserted,
              skipped: outcome.skipped,
              reasons: outcome.skippedReasons.join(" "),
            },
          ),
        );
    } catch (error) {
      alert(error instanceof Error ? error.message : t("Sync failed"));
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div>
      <FilterBar title="Accounts" />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        {error && (
          <div role="alert" className="col-span-full space-y-2 text-sm text-destructive">
            <p>{t("Could not load your accounts: {error}", { error })}</p>
            <Button variant="outline" onClick={refresh}>
              {t("Try again")}
            </Button>
          </div>
        )}
        {!data && !error && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            {t("Loading accounts…")}
          </p>
        )}
        {data?.accounts.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            {t("No accounts yet. Create one on the Import page.")}
          </p>
        )}
        {data?.accounts.map((account) => (
          <Card key={account.id} className={account.archivedAt ? "opacity-60" : undefined}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="min-w-0 flex-1 text-base font-semibold normal-case tracking-normal text-foreground">
                <span className="block break-words">{account.name}</span>
                <Badge variant="secondary" className="mt-1.5 mr-2">
                  {tx("account kind", account.kind)}
                </Badge>
                {account.broker && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {account.broker}
                  </span>
                )}
              </CardTitle>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {account.kind === "sync" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={syncing === account.id}
                    onClick={() => void sync(account.id)}
                    title={t("Sync now")}
                  >
                    <RefreshCw className={syncing === account.id ? "animate-spin" : undefined} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title={account.archivedAt ? t("Unarchive") : t("Archive")}
                  onClick={() =>
                    void attempt("Could not update the account.", () =>
                      action(account.id, {
                        action: account.archivedAt ? "unarchive" : "archive",
                      }),
                    )
                  }
                >
                  {account.archivedAt ? <ArchiveRestore /> : <Archive />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title={t("Delete account")}
                  onClick={async () => {
                    if (
                      confirm(
                        t('Delete "{name}" and ALL its trades? This cannot be undone.', {
                          name: account.name,
                        }),
                      )
                    ) {
                      await attempt("Could not delete the account.", async () => {
                        await postJson(`/api/accounts/${account.id}`, undefined, "DELETE");
                        refresh();
                      });
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {account.snapshot && (
                <div className="text-sm">
                  {t("Broker equity:")}{" "}
                  <span className="tnum font-medium">
                    <MonetaryValue>
                      {accountMoney(account.snapshot.equity, account.currency)}
                    </MonetaryValue>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("{count} open positions · synced {when}", {
                      count: account.snapshot.positions.length,
                      when: account.lastSyncAt
                        ? formatTimestamp(account.lastSyncAt, timeZone)
                        : t("never"),
                    })}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`initial-balance-${account.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("Initial balance (anchors drawdown %)")}
                  </label>
                  <MonetaryField>
                    <Input
                      id={`initial-balance-${account.id}`}
                      defaultValue={account.initialBalance || ""}
                      placeholder="0"
                      inputMode="decimal"
                      onBlur={async (event) => {
                        const input = event.currentTarget;
                        const value = parseDecimalInput(input.value);
                        if (value === undefined) {
                          input.value = account.initialBalance
                            ? String(account.initialBalance)
                            : "";
                          alert(t(NOT_A_NUMBER));
                          return;
                        }
                        if ((value ?? 0) === account.initialBalance) return;
                        try {
                          await postJson(
                            `/api/accounts/${account.id}`,
                            { initialBalance: value ?? 0 },
                            "PATCH",
                          );
                        } catch (error) {
                          alert(
                            error instanceof Error
                              ? error.message
                              : t("Could not save the balance."),
                          );
                        }
                        refresh();
                      }}
                    />
                  </MonetaryField>
                </div>
                <div>
                  <label
                    htmlFor={`profit-calc-${account.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    {t("Profit calculation")}
                  </label>
                  <Select
                    value={account.profitCalcMethod}
                    onValueChange={(value) =>
                      void attempt("Could not change the profit calculation.", async () => {
                        await postJson(
                          `/api/accounts/${account.id}`,
                          { profitCalcMethod: value },
                          "PATCH",
                        );
                        refresh();
                      })
                    }
                  >
                    <SelectTrigger id={`profit-calc-${account.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fifo">FIFO</SelectItem>
                      <SelectItem value="lifo">LIFO</SelectItem>
                      <SelectItem value="wavg">{t("Weighted average")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (
                      confirm(
                        t('Clear ALL trades from "{name}"? The account stays.', {
                          name: account.name,
                        }),
                      )
                    ) {
                      await attempt("Could not clear the account.", () =>
                        action(account.id, { action: "clear" }),
                      );
                    }
                  }}
                >
                  {t("Clear trades")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const others = data.accounts.filter((candidate) => candidate.id !== account.id);
                    if (others.length === 0) return alert(t("No other account to transfer into."));
                    const target = prompt(
                      t("Transfer all data into which account?\n{list}\n\nEnter a number:", {
                        list: others
                          .map((candidate, index) => `${index + 1}. ${candidate.name}`)
                          .join("\n"),
                      }),
                    );
                    const chosen = others[Number(target) - 1];
                    if (target !== null && !chosen)
                      return alert(t("Enter one of the listed numbers."));
                    if (chosen)
                      await attempt("Could not transfer the data.", () =>
                        action(account.id, { action: "transfer", toAccountId: chosen.id }),
                      );
                  }}
                >
                  {t("Transfer data")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
