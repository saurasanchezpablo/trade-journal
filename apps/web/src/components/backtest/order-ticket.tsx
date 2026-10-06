"use client";

import { useId, useState } from "react";
import type { BacktestOrderType, BacktestSide } from "@luxalgo/journal-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { useI18n } from "@/components/i18n";
import { MonetaryValue } from "@/components/privacy";
import { fmtAmount, orderSize } from "@/lib/backtest-replay";
import type { SessionSettings } from "@/lib/backtest-session";
import { NOT_A_NUMBER, parseDecimalInput } from "@/lib/number-input";
import { cn, fmtNumber } from "@/lib/utils";

export interface TicketOrder {
  side: BacktestSide;
  type: BacktestOrderType;
  qty: number;
  price?: number;
  stop: number | null;
  target: number | null;
}

const trimmed = (value: number) => String(Number(value.toPrecision(10)));

/** The place button's wording: side and order type in one sentence each. */
const PLACE_LABELS: Record<BacktestSide, Record<BacktestOrderType, string>> = {
  long: {
    market: "Buy {qty} at market",
    limit: "Buy {qty} limit at {price}",
    stop: "Buy {qty} stop at {price}",
  },
  short: {
    market: "Sell {qty} at market",
    limit: "Sell {qty} limit at {price}",
    stop: "Sell {qty} stop at {price}",
  },
};

/**
 * The order ticket: side, market, limit or stop, the stop loss and take profit (or a target
 * in R), and a size worked out from the session's risk unless you type one.
 */
export function OrderTicket({
  price,
  settings,
  balance,
  disabled,
  onPlace,
}: {
  /** The current price: the last revealed close. */
  price: number | null;
  settings: SessionSettings;
  balance: number;
  /** Why an order cannot be placed now (a position is open), or null. */
  disabled: string | null;
  onPlace: (order: TicketOrder) => string | null;
}) {
  const { t, tx } = useI18n();
  const id = useId();
  const [side, setSide] = useState<BacktestSide>("long");
  const [type, setType] = useState<BacktestOrderType>("market");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState("");

  const entryPrice = type === "market" ? price : (parseDecimalInput(entry) ?? null);
  const stopPrice = parseDecimalInput(stop);
  const targetPrice = parseDecimalInput(target);
  const typedQty = parseDecimalInput(qty);
  const sized =
    entryPrice !== null && entryPrice !== undefined
      ? orderSize(settings, balance, entryPrice, stopPrice ?? null)
      : null;
  // What a trade risks comes from the balance, whatever the order price.
  const riskBudget = orderSize(settings, balance, 0, null).risk;
  const finalQty = typedQty ?? sized?.qty ?? 0;
  const invalid = [entryPrice, stopPrice, targetPrice, typedQty].some((v) => v === undefined);
  const riskAtStop =
    entryPrice && stopPrice
      ? Math.abs(entryPrice - stopPrice) * finalQty * settings.multiplier
      : null;

  const inR = (multiple: number) => {
    if (!entryPrice || !stopPrice) return;
    const distance = entryPrice - stopPrice;
    setTarget(trimmed(entryPrice + distance * multiple));
  };

  const place = () => {
    setError("");
    if (invalid) return setError(NOT_A_NUMBER);
    if (!(finalQty > 0))
      return setError("Set a stop loss so the size comes from your risk, or type a quantity.");
    const problem = onPlace({
      side,
      type,
      qty: finalQty,
      ...(type === "market" ? {} : { price: entryPrice ?? undefined }),
      stop: stopPrice ?? null,
      target: targetPrice ?? null,
    });
    if (problem) setError(problem);
    else {
      setStop("");
      setTarget("");
      setQty("");
      setEntry("");
    }
  };

  const field = (name: string) => `${id}-${name}`;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Side")}>
        {(["long", "short"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            aria-pressed={side === value}
            className={cn(
              side === value &&
                (value === "long"
                  ? "border-profit bg-profit/10 text-profit"
                  : "border-loss bg-loss/10 text-loss"),
            )}
            onClick={() => setSide(value)}
          >
            {tx("order side", value === "long" ? "Buy" : "Sell")}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={field("type")} className="text-xs text-muted-foreground">
            {t("Order type")}
          </label>
          <OptionSelect
            id={field("type")}
            aria-label={t("Order type")}
            value={type}
            onValueChange={(value) => setType(value as BacktestOrderType)}
          >
            <option value="market">{tx("order type", "Market")}</option>
            <option value="limit">{tx("order type", "Limit")}</option>
            <option value="stop">{tx("order type", "Stop")}</option>
          </OptionSelect>
        </div>
        <div>
          <label htmlFor={field("entry")} className="text-xs text-muted-foreground">
            {t(type === "market" ? "Price now" : "Order price")}
          </label>
          <Input
            id={field("entry")}
            inputMode="decimal"
            disabled={type === "market"}
            value={type === "market" ? (price === null ? "" : trimmed(price)) : entry}
            placeholder={price === null ? "" : trimmed(price)}
            onChange={(event) => setEntry(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={field("stop")} className="text-xs text-muted-foreground">
            {t("Stop loss")}
          </label>
          <Input
            id={field("stop")}
            inputMode="decimal"
            value={stop}
            aria-invalid={stopPrice === undefined}
            onChange={(event) => setStop(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor={field("target")} className="text-xs text-muted-foreground">
            {t("Take profit")}
          </label>
          <Input
            id={field("target")}
            inputMode="decimal"
            value={target}
            aria-invalid={targetPrice === undefined}
            onChange={(event) => setTarget(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{t("Target at")}</span>
        {[1, 2, 3].map((multiple) => (
          <Button
            key={multiple}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2"
            disabled={!entryPrice || !stopPrice}
            onClick={() => inR(multiple)}
          >
            {multiple}R
          </Button>
        ))}
      </div>
      <div>
        <label htmlFor={field("qty")} className="text-xs text-muted-foreground">
          {t("Quantity (empty: from your risk)")}
        </label>
        <Input
          id={field("qty")}
          inputMode="decimal"
          value={qty}
          placeholder={sized?.qty ? trimmed(sized.qty) : t("set a stop loss")}
          aria-invalid={typedQty === undefined}
          onChange={(event) => setQty(event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Risk per trade:")}{" "}
          <MonetaryValue>{fmtAmount(riskBudget, settings.currency)}</MonetaryValue>
          {settings.riskMode === "percent"
            ? ` ${t("({percent}% of the balance)", { percent: fmtNumber(settings.riskValue) })}`
            : ""}
          {riskAtStop !== null && (
            <>
              {" "}
              · {t("at the stop:")}{" "}
              <MonetaryValue>{fmtAmount(riskAtStop, settings.currency)}</MonetaryValue>
            </>
          )}
        </p>
      </div>
      {(error || disabled) && (
        <p role="alert" className="text-xs text-destructive">
          {error ? t(error) : disabled}
        </p>
      )}
      <Button
        type="button"
        className="w-full"
        disabled={Boolean(disabled) || price === null}
        onClick={place}
      >
        {t(PLACE_LABELS[side][type], {
          qty: finalQty > 0 ? trimmed(finalQty) : "",
          price: entryPrice ?? "…",
        }).replace(/\s+/g, " ")}
      </Button>
    </div>
  );
}
