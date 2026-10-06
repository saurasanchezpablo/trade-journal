"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ChartOverlayData, OverlayOptions } from "@/lib/chart-overlays";
import {
  IMPACTS,
  type CalendarState,
  type EconomicEvent,
  type EventImpact,
} from "@/lib/economic-calendar";
import type { Vars } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Section } from "./section-card";
import { useI18n } from "./i18n";
import { Button } from "./ui/button";

const FAILURES = {
  enable: "Could not enable the economic calendar: {reason}",
  disable: "Could not disable the economic calendar: {reason}",
  refresh: "Could not refresh the economic calendar: {reason}",
} as const;

/** An event in one line, in the journal's language (the event title stays as published). */
function eventSummary(
  e: EconomicEvent,
  t: (text: string, vars?: Vars) => string,
  tx: (context: string, text: string, vars?: Vars) => string,
) {
  return [
    `${e.currency} · ${e.title}`,
    e.impact === "Holiday"
      ? t("Bank holiday")
      : t("{impact} impact", { impact: tx("impact", e.impact) }),
    e.forecast ? t("Forecast {value}", { value: e.forecast }) : "",
    e.previous ? t("Previous {value}", { value: e.previous }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"];

/**
 * What the chart draws from the journal and the calendar. Every switch hides without
 * deleting; the same groups also appear in the chart's own settings (Events tab).
 */
export function OverlaysPanel({
  options,
  onChange,
  data,
  extraSymbols,
  onExtraSymbols,
  calendar,
  onCalendar,
}: {
  options: OverlayOptions;
  onChange: (options: OverlayOptions) => void;
  data: ChartOverlayData | null;
  extraSymbols: string;
  onExtraSymbols: (value: string) => void;
  calendar: CalendarState | null;
  onCalendar: (action: "enable" | "disable" | "refresh") => Promise<void>;
}) {
  const { t, tx, intl } = useI18n();
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<OverlayOptions>) => onChange({ ...options, ...patch });
  const open = data?.trades.filter((t) => t.status === "open").length ?? 0;
  const closed = (data?.trades.length ?? 0) - open;
  const now = Date.now();
  const upcoming = (calendar?.events ?? [])
    .filter(
      (e) =>
        e.time >= now - 30 * 60_000 &&
        e.time <= now + 3 * 86_400_000 &&
        options.economicImpact.includes(e.impact) &&
        (!options.economicCurrencies.length || options.economicCurrencies.includes(e.currency)),
    )
    .slice(0, 8);
  const [failure, setFailure] = useState("");
  const act = async (action: "enable" | "disable" | "refresh") => {
    setBusy(true);
    setFailure("");
    try {
      await onCalendar(action);
    } catch (cause) {
      setFailure(
        t(FAILURES[action], {
          reason: cause instanceof Error ? cause.message : t("the request failed."),
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <Section id="chart-overlays-journal" title={t("Journal records")}>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">{t("Journal records")}</legend>
          <Toggle
            label={t("My trades ({open} open, {closed} closed)", { open, closed })}
            checked={options.trades}
            onChange={(trades) => set({ trades })}
          />
          <Toggle
            label={t("Closed trades")}
            hint={t("Off: only open positions")}
            checked={options.closedTrades}
            disabled={!options.trades}
            indent
            onChange={(closedTrades) => set({ closedTrades })}
          />
          <Toggle
            label={t("Missed trades ({count})", { count: data?.missed.length ?? 0 })}
            hint={t("Violet diamonds")}
            checked={options.missed}
            onChange={(missed) => set({ missed })}
          />
          <Toggle
            label={t("Support/resistance zones")}
            checked={options.zones}
            onChange={(zones) => set({ zones })}
          />
          <Toggle
            label={t("Market sessions")}
            hint={t("Opens and closes, up to 1h candles")}
            checked={options.sessions}
            onChange={(sessions) => set({ sessions })}
          />
        </fieldset>

        <div className="space-y-1">
          <label htmlFor="overlay-symbols" className="text-xs text-muted-foreground">
            {t("Also show journal symbols")}
          </label>
          <input
            id="overlay-symbols"
            value={extraSymbols}
            placeholder={t("e.g. MES, ES")}
            onChange={(e) => onExtraSymbols(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            {data?.symbols.length
              ? t("Matching {symbols}.", { symbols: data.symbols.join(", ") })
              : t("No journal trades match this symbol yet.")}{" "}
            {t("Click a marker to open its trade.")}
          </p>
        </div>
      </Section>

      <Section
        id="chart-overlays-calendar"
        className="border-t pt-3"
        title={t("Economic calendar")}
        actions={
          <div className="flex shrink-0 items-center gap-1">
            <Toggle
              label={t("Show")}
              checked={options.economic}
              disabled={!calendar?.enabled}
              onChange={(economic) => set({ economic })}
            />
            {calendar?.enabled && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t("Refresh the calendar")}
                disabled={busy}
                onClick={() => void act("refresh")}
              >
                <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
              </Button>
            )}
          </div>
        }
      >
        {failure && (
          <p role="alert" className="mb-1.5 text-xs text-destructive">
            {failure}
          </p>
        )}
        {!calendar?.enabled ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t(
                "Show high-impact releases and bank holidays from the public ForexFactory weekly feed. Enabling it lets this server fetch the feed at most once an hour while a chart is open.",
              )}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void act("enable")}
            >
              {t("Enable economic calendar")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1" aria-label={t("Impact")}>
              {IMPACTS.map((impact) => (
                <Chip
                  key={impact}
                  on={options.economicImpact.includes(impact)}
                  onClick={() =>
                    set({
                      economicImpact: options.economicImpact.includes(impact)
                        ? options.economicImpact.filter((i) => i !== impact)
                        : ([...options.economicImpact, impact] as EventImpact[]),
                    })
                  }
                >
                  {tx("impact", impact)}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" aria-label={t("Currencies")}>
              <Chip
                on={!options.economicCurrencies.length}
                onClick={() => set({ economicCurrencies: [] })}
              >
                {t("All")}
              </Chip>
              {CURRENCIES.map((c) => (
                <Chip
                  key={c}
                  on={options.economicCurrencies.includes(c)}
                  onClick={() =>
                    set({
                      economicCurrencies: options.economicCurrencies.includes(c)
                        ? options.economicCurrencies.filter((x) => x !== c)
                        : [...options.economicCurrencies, c],
                    })
                  }
                >
                  {c}
                </Chip>
              ))}
            </div>
            {calendar.error && (
              <p role="alert" className="text-xs text-destructive">
                {calendar.error}
              </p>
            )}
            <div>
              <p className="text-xs font-medium">{t("Next 3 days")}</p>
              {upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("No matching events.")}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {upcoming.map((e) => (
                    <li key={e.id} className="text-xs">
                      <span className="tnum text-muted-foreground">
                        {new Date(e.time).toLocaleString(intl, {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                        })}
                      </span>{" "}
                      {eventSummary(e, t, tx)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {calendar.fetchedAt
                  ? t("Updated {time}", { time: new Date(calendar.fetchedAt).toLocaleString() })
                  : t("Not fetched yet")}
                {` · ${t("ForexFactory feed")}`}
              </span>
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void act("disable")}
              >
                {t("Disable")}
              </button>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  indent,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  indent?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2",
        indent && "pl-5",
        disabled && "opacity-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px]",
        on
          ? "border-primary bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
