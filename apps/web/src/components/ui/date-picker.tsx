"use client";

import { useEffect, useId, useState } from "react";
import dynamic from "next/dynamic";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { formatDateInput, parseDateInput } from "@/lib/date-input";
import { useI18n, useT } from "@/components/i18n";

// The calendar is loaded on demand, not in every page's initial filter-bar bundle.
const Calendar = dynamic(() => import("./calendar").then((module) => module.Calendar), {
  loading: () => <CalendarLoading />,
});

function CalendarLoading() {
  const t = useT();
  return <div role="status" aria-label={t("Loading calendar")} className="h-[300px]" />;
}

export function DatePicker({
  value,
  onValueChange,
  label,
  min,
  max,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);
  const allowed = (date: string) => (!min || date >= min) && (!max || date <= max);
  const select = (date: string) => {
    setDraft(date);
    setInvalid(false);
    onValueChange(date);
    setOpen(false);
  };
  const today = formatDateInput(new Date());
  const selected = parseDateInput(value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span className="relative block min-w-0">
          <Input
            value={draft}
            aria-label={label}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            placeholder="YYYY-MM-DD"
            disabled={disabled}
            className="journal-date-input pr-10 tabular-nums"
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              setInvalid(false);
              if (!next || (parseDateInput(next) && allowed(next))) onValueChange(next);
            }}
            onBlur={() => setInvalid(Boolean(draft && (!parseDateInput(draft) || !allowed(draft))))}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
              }
              if (event.key === "Escape") {
                setDraft(value);
                setInvalid(false);
              }
            }}
          />
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t("Choose {label} date", {
                label: locale === "en" ? label.toLowerCase() : label,
              })}
              className="absolute top-0 right-0 flex size-9 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <CalendarDays aria-hidden="true" className="size-4" />
            </button>
          </Popover.Trigger>
          {invalid && (
            <span id={errorId} role="alert" className="mt-1 block text-xs text-destructive">
              {max && min
                ? t("Enter a valid date (YYYY-MM-DD) on or before {max} on or after {min}.", {
                    max,
                    min,
                  })
                : max
                  ? t("Enter a valid date (YYYY-MM-DD) on or before {max}.", { max })
                  : min
                    ? t("Enter a valid date (YYYY-MM-DD) on or after {min}.", { min })
                    : t("Enter a valid date (YYYY-MM-DD).")}
            </span>
          )}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          aria-label={t("{label} calendar", { label })}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="journal-popup journal-menu-surface z-50 w-[296px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground outline-none"
        >
          <Calendar
            mode="single"
            autoFocus
            selected={selected}
            defaultMonth={selected ?? parseDateInput(max ?? "") ?? new Date()}
            onSelect={(date) => select(date ? formatDateInput(date) : "")}
            disabled={(date) => !allowed(formatDateInput(date))}
          />
          <div className="mt-3 flex items-center justify-between border-t pt-2">
            <Button variant="ghost" size="sm" disabled={!draft} onClick={() => select("")}>
              {t("Clear")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!allowed(today)}
              onClick={() => select(today)}
            >
              {t("Today")}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
