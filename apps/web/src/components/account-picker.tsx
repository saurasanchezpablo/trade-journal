"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { postJson, useApi } from "@/lib/use-api";
import { useT } from "./i18n";

interface AccountRow {
  id: string;
  name: string;
  kind: string;
  archivedAt: string | null;
}

/** Account picker used by every method; offers creating a new one inline. */
export function AccountPicker({
  value,
  onChange,
  kind,
}: {
  value: string;
  onChange: (id: string) => void;
  kind: "import" | "manual";
}) {
  const t = useT();
  const {
    data,
    refresh,
    error: accountError,
  } = useApi<{ accounts: AccountRow[] }>("/api/accounts");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<AccountRow[]>([]);
  const fieldId = useId();
  const accounts = [
    ...(data?.accounts ?? []),
    ...created.filter((item) => !data?.accounts.some((row) => row.id === item.id)),
  ].filter((account) => !account.archivedAt);
  const create = async () => {
    if (
      saving ||
      !name.trim() ||
      !/^[A-Z]{3}$/.test(currency) ||
      !balance.trim() ||
      !Number.isFinite(Number(balance)) ||
      Number(balance) < 0
    )
      return;
    setSaving(true);
    setError("");
    try {
      const result = await postJson<{ id: string }>("/api/accounts", {
        name: name.trim(),
        kind,
        currency,
        initialBalance: Number(balance),
      });
      setCreated((current) => [
        ...current,
        { id: result.id, name: name.trim(), kind, archivedAt: null },
      ]);
      onChange(result.id);
      refresh();
      setCreating(false);
      setName("");
      setBalance("0");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Account creation failed."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-2">
      <div className="min-w-0 flex-[1_1_180px]">
        <Label htmlFor={`${fieldId}-account`} className="mb-1 block text-xs text-muted-foreground">
          {t("Into account")}
        </Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={`${fieldId}-account`}>
            <SelectValue placeholder={t("Choose an account")} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="outline"
        aria-expanded={creating}
        onClick={() => {
          setCreating(!creating);
          setError("");
        }}
        disabled={saving}
      >
        {creating ? t("Cancel new account") : t("New account")}
      </Button>
      {accountError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {accountError}
        </p>
      )}
      {creating && (
        <form
          className="w-full space-y-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) void create();
          }}
        >
          <h3 className="text-sm font-medium">{t("Create account")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-name`}>{t("Account name")}</Label>
              <Input
                id={`${fieldId}-name`}
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={saving}
                placeholder={t("Trading test account")}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-currency`}>{t("Currency")}</Label>
              <Input
                id={`${fieldId}-currency`}
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${fieldId}-balance`}>{t("Starting balance")}</Label>
              <Input
                id={`${fieldId}-balance`}
                required
                type="number"
                min="0"
                step="0.01"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={
              saving ||
              !name.trim() ||
              !/^[A-Z]{3}$/.test(currency) ||
              !balance.trim() ||
              !Number.isFinite(Number(balance)) ||
              Number(balance) < 0
            }
          >
            {saving ? t("Creating…") : t("Create account")}
          </Button>
        </form>
      )}
    </div>
  );
}
