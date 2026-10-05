"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MonetaryField } from "@/components/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fillRequest, newRow, rowOf, type FillRow, type StoredFill } from "@/lib/fill-editor";
import { postJson } from "@/lib/use-api";

/**
 * Correct a trade's fills in place: change a time, side, quantity, price or fee, the symbol,
 * remove a fill or add a missing one, then save them together. The trade is recalculated
 * from the corrected fills and keeps its notes, tags, rating and everything attached to it.
 */
export function TradeFillsEditor({
  tradeKey,
  symbol,
  fills,
  timeZone,
  imported,
  onSaved,
  onCancel,
}: {
  tradeKey: string;
  symbol: string;
  fills: StoredFill[];
  timeZone: string;
  /** Some fills came from an import or a broker sync. */
  imported: boolean;
  /** The trade's key after the correction (it changes with its first fill). */
  onSaved: (key: string | null) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<FillRow[]>(() =>
    [...fills]
      .sort((a, b) => a.executedAt.localeCompare(b.executedAt))
      .map((fill) => rowOf(fill, timeZone)),
  );
  const [name, setName] = useState(symbol);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (index: number, patch: Partial<FillRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    const request = fillRequest(rows, name, symbol, timeZone);
    if ("error" in request) {
      setError(request.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await postJson<{ key: string | null; changed: number }>(
        `/api/trades/${encodeURIComponent(tradeKey)}/fills`,
        request,
        "PUT",
      );
      onSaved(result.key);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The fills could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40 space-y-1">
          <Label htmlFor="fills-symbol">Symbol</Label>
          <Input
            id="fills-symbol"
            value={name}
            autoCapitalize="characters"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          The trade is recalculated from these fills; a fill can also start or end another trade (a
          new symbol or an earlier exit).
          {imported &&
            " Imported fills keep matching their statement: importing it again does not bring back the old values or a fill removed here."}
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Remove</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={row.id ?? `new-${i}`}>
                <TableCell className="min-w-52">
                  <Input
                    type="datetime-local"
                    step={1}
                    aria-label={`Fill ${i + 1} time`}
                    value={row.time}
                    onChange={(e) => set(i, { time: e.target.value })}
                  />
                </TableCell>
                <TableCell className="min-w-28">
                  <OptionSelect
                    aria-label={`Fill ${i + 1} side`}
                    value={row.side}
                    onValueChange={(side) => set(i, { side: side as FillRow["side"] })}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </OptionSelect>
                </TableCell>
                <TableCell className="min-w-24">
                  <Input
                    inputMode="decimal"
                    aria-label={`Fill ${i + 1} quantity`}
                    value={row.quantity}
                    onChange={(e) => set(i, { quantity: e.target.value })}
                  />
                </TableCell>
                <TableCell className="min-w-28">
                  <MonetaryField>
                    <Input
                      inputMode="decimal"
                      aria-label={`Fill ${i + 1} price`}
                      value={row.price}
                      onChange={(e) => set(i, { price: e.target.value })}
                    />
                  </MonetaryField>
                </TableCell>
                <TableCell className="min-w-24">
                  <MonetaryField>
                    <Input
                      inputMode="decimal"
                      aria-label={`Fill ${i + 1} fee`}
                      value={row.fee}
                      onChange={(e) => set(i, { fee: e.target.value })}
                    />
                  </MonetaryField>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Remove fill ${i + 1}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRows((current) => [...current, newRow(current)])}
        >
          <Plus /> Add a fill
        </Button>
        <span className="ml-auto" />
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save the fills"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
