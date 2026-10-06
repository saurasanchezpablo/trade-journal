"use client";

import { useState } from "react";
import { Crosshair, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { SrZone, ZoneKind, ZoneStats } from "@/lib/sr-zones";
import { cn, fmtNumber } from "@/lib/utils";
import { useI18n } from "./i18n";
import { Button } from "./ui/button";

/**
 * Support/resistance zones on this chart. Role, touches and status come from the candles;
 * "Auto" follows price (above = support, below = resistance, flipping after a break).
 */
export function ZonesPanel({
  zones,
  stats,
  capturing,
  pending,
  disabled,
  onAdd,
  onCancel,
  onChange,
  onReveal,
}: {
  zones: SrZone[];
  stats: Record<string, ZoneStats>;
  capturing: boolean;
  pending: boolean;
  disabled: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onChange: (zones: SrZone[]) => void;
  onReveal: (zone: SrZone) => void;
}) {
  const { t, tn } = useI18n();
  const update = (id: string, patch: Partial<SrZone>) =>
    onChange(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  // A low or high that is not saved says why; the field goes back to the saved price.
  const [problem, setProblem] = useState<{ id: string; text: string } | null>(null);
  const refuse = (id: string, text: string) => {
    setProblem({ id, text });
    return false;
  };
  const save = (id: string, patch: Partial<SrZone>) => {
    setProblem((p) => (p?.id === id ? null : p));
    update(id, patch);
    return true;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {capturing ? (
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            {t("Cancel")}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onAdd}>
            <Plus /> {t("Add zone")}
          </Button>
        )}
        {capturing && (
          <span role="status" className="text-xs text-muted-foreground">
            {pending
              ? t("Click the zone's other edge.")
              : t("Click one edge of the zone on the chart.")}
          </span>
        )}
      </div>
      {zones.length === 0 && !capturing && (
        <p className="text-xs text-muted-foreground">
          {t(
            "Mark a price range where price reacts. It extends to the present and tracks touches and breaks.",
          )}
        </p>
      )}
      <ul className="space-y-2">
        {zones.map((zone) => {
          const s = stats[zone.id];
          return (
            <li
              key={zone.id}
              className={cn("space-y-1 rounded-md border p-2", !zone.visible && "opacity-60")}
            >
              <div className="flex items-center gap-1">
                <input
                  aria-label={t("Zone label")}
                  value={zone.label}
                  placeholder={t(s ? (s.role === "support" ? "Support" : "Resistance") : "Zone")}
                  maxLength={80}
                  onChange={(e) => update(zone.id, { label: e.target.value })}
                  className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t("Show the zone on the chart")}
                  onClick={() => onReveal(zone)}
                >
                  <Crosshair className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={zone.visible ? t("Hide zone") : t("Show zone")}
                  onClick={() => update(zone.id, { visible: !zone.visible })}
                >
                  {zone.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={t("Delete zone")}
                  onClick={() => onChange(zones.filter((z) => z.id !== zone.id))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <PriceField
                  label={t("Low")}
                  ariaLabel={t("Zone low")}
                  value={zone.low}
                  onCommit={(low) =>
                    low < zone.high
                      ? save(zone.id, { low })
                      : refuse(
                          zone.id,
                          t("The low must be under the high ({high}).", { high: price(zone.high) }),
                        )
                  }
                  onInvalid={() => refuse(zone.id, t("Enter a price, like 101.5."))}
                />
                <PriceField
                  label={t("High")}
                  ariaLabel={t("Zone high")}
                  value={zone.high}
                  onCommit={(high) =>
                    high > zone.low
                      ? save(zone.id, { high })
                      : refuse(
                          zone.id,
                          t("The high must be above the low ({low}).", { low: price(zone.low) }),
                        )
                  }
                  onInvalid={() => refuse(zone.id, t("Enter a price, like 101.5."))}
                />
                <select
                  aria-label={t("Zone kind")}
                  value={zone.kind}
                  onChange={(e) => update(zone.id, { kind: e.target.value as ZoneKind })}
                  className="h-7 rounded border bg-background px-1 text-xs"
                >
                  <option value="auto">{t("Auto")}</option>
                  <option value="support">{t("Support")}</option>
                  <option value="resistance">{t("Resistance")}</option>
                </select>
              </div>
              {problem?.id === zone.id && (
                <p role="alert" className="text-[11px] text-destructive">
                  {problem.text}
                </p>
              )}
              {s && (
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    `${s.role === "support" ? "Support" : "Resistance"} {low}–{high} · {touches} · ${s.status}`,
                    {
                      low: fmtNumber(zone.low),
                      high: fmtNumber(zone.high),
                      touches: tn(s.touches, "{count} touch", "{count} touches"),
                    },
                  )}
                  {s.breaks > 0 ? ` · ${tn(s.breaks, "{count} break", "{count} breaks")}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const price = (value: number) => String(Number(value.toPrecision(10)));

function PriceField({
  label,
  ariaLabel,
  value,
  onCommit,
  onInvalid,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  /** Save a changed price; false when refused, and the field shows the saved price again. */
  onCommit: (v: number) => boolean;
  onInvalid: () => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      title={label}
      defaultValue={price(value)}
      key={value}
      inputMode="decimal"
      onBlur={(e) => {
        const text = e.target.value.trim();
        const next = Number(text);
        const saved = () => (e.target.value = price(value));
        // An emptied field is not a price of 0.
        if (!text || !Number.isFinite(next)) {
          saved();
          onInvalid();
        } else if (next === value || !onCommit(next)) saved();
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className="h-7 min-w-0 rounded border bg-background px-1.5 text-xs tabular-nums"
    />
  );
}
