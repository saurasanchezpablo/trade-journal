"use client";

import { useId, useState } from "react";
import { MonetaryField } from "@/components/privacy";
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
import { postJson } from "@/lib/use-api";

import { AccountPicker } from "./account-picker";
import { fmtNumber } from "@/lib/utils";
import { useI18n } from "./i18n";

interface ManualLeg {
  datetime: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  fee: string;
}

export function ManualTradeEntry({ onSaved }: { onSaved: () => void }) {
  const { t, tn } = useI18n();
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [notes, setNotes] = useState("");
  const [legs, setLegs] = useState<ManualLeg[]>([
    { datetime: "", side: "buy", quantity: "", price: "", fee: "" },
    { datetime: "", side: "sell", quantity: "", price: "", fee: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();

  const setLeg = (index: number, patch: Partial<ManualLeg>) =>
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  // A leg left blank is ignored; one filled in part stops the save instead of being dropped
  // (an exit without its price would save the trade as still open).
  const complete = (leg: ManualLeg) => {
    const quantity = Number(leg.quantity);
    const fee = leg.fee === "" ? 0 : Number(leg.fee);
    return (
      Boolean(leg.datetime) &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      leg.price.trim() !== "" &&
      Number.isFinite(Number(leg.price)) &&
      Number.isFinite(fee)
    );
  };
  const blank = (leg: ManualLeg) => !leg.datetime && !leg.quantity && !leg.price && !leg.fee;
  const incomplete = legs.flatMap((leg, i) => (blank(leg) || complete(leg) ? [] : [i + 1]));
  const valid = accountId && symbol && legs.some(complete) && incomplete.length === 0;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/executions", {
        accountId,
        ...(notes.trim() ? { notes } : {}),
        executions: legs.filter(complete).map((leg) => ({
          symbol,
          side: leg.side,
          quantity: Number(leg.quantity),
          price: Number(leg.price),
          fee: leg.fee === "" ? 0 : Number(leg.fee),
          executedAt: new Date(leg.datetime).toISOString(),
        })),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Couldn’t save the trade. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <AccountPicker value={accountId} onChange={setAccountId} kind="manual" />
      <div>
        <Label htmlFor={`${fieldId}-symbol`} className="mb-1 block text-xs text-muted-foreground">
          {t("Symbol")}
        </Label>
        <Input
          id={`${fieldId}-symbol`}
          value={symbol}
          onChange={(event) => setSymbol(event.target.value.toUpperCase())}
          placeholder="AAPL, ESZ6, BTCUSDT…"
        />
      </div>
      <div className="manual-executions space-y-3">
        {legs.map((leg, index) => (
          <fieldset
            key={index}
            className="manual-execution-row grid min-w-0 gap-2 rounded-lg border p-3"
          >
            <legend className="px-1 text-xs text-muted-foreground">
              {t("Execution {number}", { number: index + 1 })}
            </legend>
            <label className="manual-execution-date grid min-w-0 gap-1 text-xs text-muted-foreground">
              {t("Date & time")}
              <Input
                type="datetime-local"
                value={leg.datetime}
                onChange={(event) => setLeg(index, { datetime: event.target.value })}
              />
            </label>
            <div className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              <span id={`${fieldId}-execution-side-${index}`}>{t("Side")}</span>
              <Select
                value={leg.side}
                onValueChange={(value) => setLeg(index, { side: value as "buy" | "sell" })}
              >
                <SelectTrigger aria-labelledby={`${fieldId}-execution-side-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">{t("Buy")}</SelectItem>
                  <SelectItem value="sell">{t("Sell")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              {t("Quantity")}
              <Input
                placeholder={t("qty")}
                inputMode="decimal"
                value={leg.quantity}
                onChange={(event) => setLeg(index, { quantity: event.target.value })}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              {t("Price")}
              <MonetaryField>
                <Input
                  placeholder={t("price")}
                  inputMode="decimal"
                  value={leg.price}
                  onChange={(event) => setLeg(index, { price: event.target.value })}
                />
              </MonetaryField>
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              {t("Fee")}
              <MonetaryField>
                <Input
                  placeholder={t("fee")}
                  inputMode="decimal"
                  value={leg.fee}
                  onChange={(event) => setLeg(index, { fee: event.target.value })}
                />
              </MonetaryField>
            </label>
          </fieldset>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-notes`}>{t("Notes (optional)")}</Label>
        <textarea
          id={`${fieldId}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={100000}
          rows={4}
          placeholder={t("Your setup, why you took the trade, or what you learned…")}
          className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Markdown supported. Notes are saved with the trade; existing notes are kept when adding to an open position.",
          )}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setLegs((current) => [
              ...current,
              { datetime: "", side: "sell", quantity: "", price: "", fee: "" },
            ])
          }
        >
          {t("Add execution")}
        </Button>
        <Button size="sm" onClick={save} disabled={!valid || busy}>
          {busy ? t("Saving…") : t("Save trade")}
        </Button>
      </div>
      {incomplete.length > 0 && (
        <p role="alert" className="text-xs text-destructive">
          {tn(
            incomplete.length,
            "Execution {list} is incomplete: fill in the time, quantity and price (numbers with a dot for decimals), or clear it.",
            "Executions {list} are incomplete: fill in the time, quantity and price (numbers with a dot for decimals), or clear them.",
            { list: incomplete.join(", ") },
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          "Dates and times use your device’s timezone. Executions matching an open position on {symbol} are stitched into round trips automatically ({count} legs so far).",
          {
            symbol: symbol || t("the symbol"),
            count: fmtNumber(legs.filter((leg) => leg.datetime).length, 0),
          },
        )}
      </p>
    </fieldset>
  );
}
