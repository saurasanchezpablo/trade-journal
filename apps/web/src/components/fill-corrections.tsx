"use client";

import { useEffect } from "react";
import { History } from "lucide-react";
import { MonetaryValue } from "@/components/privacy";
import { useApi } from "@/lib/use-api";
import { formatTimestamp } from "@/lib/timezone";
import { fmtNumber } from "@/lib/utils";
import type { Vars } from "@/lib/i18n";
import { useI18n } from "./i18n";

type Translate = (text: string, vars?: Vars) => string;

interface Fill {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
}

interface Correction {
  id: string;
  action: "edit" | "add" | "remove";
  before: Fill | null;
  after: Fill | null;
  at: string;
}

const describe = (fill: Fill, timeZone: string, t: Translate) =>
  t(
    fill.side === "buy"
      ? "Buy {quantity} {symbol} at {price}, {time}"
      : "Sell {quantity} {symbol} at {price}, {time}",
    {
      quantity: fmtNumber(fill.quantity, 4),
      symbol: fill.symbol,
      price: fmtNumber(fill.price),
      time: formatTimestamp(fill.executedAt, timeZone),
    },
  );

/** What changed in an edited fill, field by field. */
function changes(before: Fill, after: Fill, timeZone: string, t: Translate) {
  const side = (value: Fill["side"]) => (value === "buy" ? t("Buy") : t("Sell")).toLowerCase();
  const out: { label: string; from: string; to: string; money?: boolean }[] = [];
  if (before.symbol !== after.symbol)
    out.push({ label: "symbol", from: before.symbol, to: after.symbol });
  if (before.side !== after.side)
    out.push({ label: "side", from: side(before.side), to: side(after.side) });
  if (before.quantity !== after.quantity)
    out.push({
      label: "quantity",
      from: fmtNumber(before.quantity, 4),
      to: fmtNumber(after.quantity, 4),
    });
  if (before.price !== after.price)
    out.push({
      label: "price",
      from: fmtNumber(before.price),
      to: fmtNumber(after.price),
      money: true,
    });
  if (before.fee !== after.fee)
    out.push({ label: "fee", from: fmtNumber(before.fee), to: fmtNumber(after.fee), money: true });
  if (Date.parse(before.executedAt) !== Date.parse(after.executedAt))
    out.push({
      label: "time",
      from: formatTimestamp(before.executedAt, timeZone),
      to: formatTimestamp(after.executedAt, timeZone),
    });
  return out;
}

/** The corrections made to this trade's fills, newest first; nothing when there are none. */
export function FillCorrections({
  tradeKey,
  timeZone,
  version,
}: {
  tradeKey: string;
  timeZone: string;
  /** Bumped after a save, to read the list again. */
  version: number;
}) {
  const { t, tn, tx } = useI18n();
  const { data, refresh } = useApi<{ corrections: Correction[] }>(
    `/api/trades/${encodeURIComponent(tradeKey)}/fills`,
  );
  useEffect(() => {
    if (version) refresh();
  }, [version, refresh]);
  const list = data?.corrections ?? [];
  if (!list.length) return null;
  return (
    <details className="rounded-md border px-3 py-2 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
        <History className="size-3.5" aria-hidden="true" />
        {tn(list.length, "{count} correction to these fills", "{count} corrections to these fills")}
      </summary>
      <ul className="mt-2 space-y-1.5">
        {list.map((c) => (
          <li key={c.id}>
            <span className="text-muted-foreground">{formatTimestamp(c.at, timeZone)} · </span>
            {c.action === "add" && c.after && (
              <>{t("Added: {fill}", { fill: describe(c.after, timeZone, t) })}</>
            )}
            {c.action === "remove" && c.before && (
              <>{t("Removed: {fill}", { fill: describe(c.before, timeZone, t) })}</>
            )}
            {c.action === "edit" && c.before && c.after && (
              <>
                {t("Edited:")}{" "}
                {changes(c.before, c.after, timeZone, t).map((change, i) => (
                  <span key={change.label}>
                    {i > 0 && ", "}
                    {tx("fill", change.label)}{" "}
                    {change.money ? (
                      <>
                        <MonetaryValue>{change.from}</MonetaryValue> →{" "}
                        <MonetaryValue>{change.to}</MonetaryValue>
                      </>
                    ) : (
                      `${change.from} → ${change.to}`
                    )}
                  </span>
                ))}
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
