"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { SymbolSearchInput } from "@/components/symbol-search";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { useI18n } from "@/components/i18n";
import {
  CONDITION_LABELS,
  INDICATOR_CONDITIONS,
  type IndicatorAlertRule,
  type IndicatorCondition,
  type IndicatorTrigger,
} from "@/lib/indicator-alerts";
import { RESOLUTIONS, type MarketConnection, type Resolution } from "@/lib/market-data";
import { providerInfo } from "@/lib/market-providers";
import { postJson, useApi } from "@/lib/use-api";

interface StoredRule {
  id: string;
  rule: IndicatorAlertRule;
  enabled: boolean;
  lastValue: number | null;
  lastBarTime: number | null;
  firedAt: string | null;
  error: string | null;
  checkedAt: string | null;
}

const PRESETS: { label: string; condition: IndicatorCondition; level: number }[] = [
  { label: "Overbought: crosses above 70", condition: "crosses-above", level: 70 },
  { label: "Oversold: crosses below 30", condition: "crosses-below", level: 30 },
];

/**
 * RSI alerts the server watches with no page open: a source, symbol and timeframe, the RSI
 * length, a level and when to check it (each candle close, or as the candle forms).
 */
export function IndicatorAlerts() {
  const { t, intl } = useI18n();
  const {
    data,
    error: loadError,
    refresh,
  } = useApi<{ rules: StoredRule[] }>("/api/alerts/indicators");
  const { data: sources } = useApi<{ connections: MarketConnection[] }>(
    "/api/market-data/connections",
  );
  const [error, setError] = useState("");
  const rules = data?.rules ?? [];
  const available = (sources?.connections ?? []).filter((c) => c.configured);
  const act = async (call: () => Promise<unknown>) => {
    setError("");
    try {
      await call();
      refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <SectionCard
      id="indicator-alerts"
      title={t("Indicator alerts")}
      summary={t("{count} watched", { count: rules.filter((r) => r.enabled).length })}
      contentClassName="space-y-4"
    >
      <p className="text-sm text-muted-foreground">
        {t(
          "RSI alerts the server checks with no page open, computed as TradingView computes ta.rsi. On candle close checks each finished candle (no false alarms); as it happens checks the forming candle (sooner, but the cross can undo itself by the close). Each rule fires at most once per candle.",
        )}
      </p>
      <NewRule
        sources={available}
        onCreate={(rule) => act(() => postJson("/api/alerts/indicators", rule))}
      />
      {(loadError || error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || loadError}
        </p>
      )}
      {rules.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 p-3">
              <Checkbox
                aria-label={t("Watch this alert")}
                checked={r.enabled}
                onCheckedChange={(checked) =>
                  void act(() =>
                    postJson(
                      "/api/alerts/indicators",
                      { id: r.id, enabled: checked === true },
                      "PATCH",
                    ),
                  )
                }
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-sm font-medium">
                  {r.rule.symbol} · {r.rule.resolution} · RSI({r.rule.length}){" "}
                  {t(CONDITION_LABELS[r.rule.condition])} {r.rule.level}
                  {r.rule.urgent && (
                    <span className="ml-2 rounded border border-destructive px-1 text-[11px] text-destructive">
                      {t("urgent")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {providerInfo(r.rule.provider)?.name ?? r.rule.provider}
                  {r.rule.dataset ? ` (${r.rule.dataset})` : ""} ·{" "}
                  {r.rule.trigger === "close" ? t("on candle close") : t("as it happens")}
                  {r.rule.note && ` · ${r.rule.note}`}
                </div>
                <div className="text-xs">
                  {!r.enabled ? (
                    t("Off")
                  ) : r.error ? (
                    <span className="text-destructive">{r.error}</span>
                  ) : r.lastValue === null ? (
                    t("Waiting for the first check…")
                  ) : (
                    t("RSI now {value} (checked {time})", {
                      value: r.lastValue.toFixed(1),
                      time: r.checkedAt
                        ? new Date(r.checkedAt).toLocaleTimeString(intl, { timeStyle: "short" })
                        : "–",
                    })
                  )}
                  {r.firedAt && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {t("last fired {time}", {
                        time: new Date(r.firedAt).toLocaleString(intl, {
                          dateStyle: "short",
                          timeStyle: "short",
                        }),
                      })}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("Delete")}
                onClick={() =>
                  void act(() =>
                    fetch(`/api/alerts/indicators?id=${encodeURIComponent(r.id)}`, {
                      method: "DELETE",
                    }).then(async (response) => {
                      if (!response.ok)
                        throw new Error(((await response.json()) as { error?: string }).error);
                    }),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function NewRule({
  sources,
  onCreate,
}: {
  sources: MarketConnection[];
  onCreate: (rule: Omit<IndicatorAlertRule, "indicator">) => Promise<void>;
}) {
  const { t } = useI18n();
  const [provider, setProvider] = useState("");
  const [dataset, setDataset] = useState("");
  const [symbol, setSymbol] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1h");
  const [length, setLength] = useState("14");
  const [condition, setCondition] = useState<IndicatorCondition>("crosses-above");
  const [level, setLevel] = useState("70");
  const [trigger, setTrigger] = useState<IndicatorTrigger>("close");
  const [urgent, setUrgent] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const source = provider || sources[0]?.id || "";
  const info = providerInfo(source);
  const markets = info?.datasets?.filter((d) => d.value) ?? [];
  const needsDataset = markets.length > 0;
  const resolutions = (info?.resolutions ??
    (Object.keys(RESOLUTIONS) as Resolution[])) as Resolution[];
  if (!sources.length)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Enable a market data source in Settings first.")}
      </p>
    );
  const ready =
    symbol.trim() && (!needsDataset || dataset) && Number(level) > 0 && Number(level) < 100;
  return (
    <form
      className="space-y-3 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        setBusy(true);
        void onCreate({
          provider: source,
          dataset: needsDataset ? dataset : null,
          symbol: symbol.trim(),
          resolution,
          length: Number(length),
          condition,
          level: Number(level),
          trigger,
          urgent,
          note,
        }).finally(() => setBusy(false));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="rsi-source">{t("Source")}</Label>
          <OptionSelect
            id="rsi-source"
            value={source}
            onValueChange={(value) => {
              setProvider(value);
              setDataset("");
            }}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </OptionSelect>
        </div>
        {needsDataset && (
          <div className="space-y-1">
            <Label htmlFor="rsi-market">{t("Market")}</Label>
            <OptionSelect id="rsi-market" value={dataset} onValueChange={setDataset}>
              <option value="" disabled>
                {t("Choose a market")}
              </option>
              {markets.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.label)}
                </option>
              ))}
            </OptionSelect>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="rsi-symbol">{t("Symbol")}</Label>
          <SymbolSearchInput
            id="rsi-symbol"
            value={symbol}
            onChange={setSymbol}
            provider={source}
            dataset={dataset}
            searchable={Boolean(info?.searchable) && (!needsDataset || Boolean(dataset))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsi-timeframe">{t("Timeframe")}</Label>
          <OptionSelect
            id="rsi-timeframe"
            value={resolution}
            onValueChange={(value) => setResolution(value as Resolution)}
          >
            {resolutions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </OptionSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsi-length">{t("RSI length")}</Label>
          <Input
            id="rsi-length"
            type="number"
            min={2}
            max={200}
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsi-condition">{t("Condition")}</Label>
          <OptionSelect
            id="rsi-condition"
            value={condition}
            onValueChange={(value) => setCondition(value as IndicatorCondition)}
          >
            {INDICATOR_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(CONDITION_LABELS[c])}
              </option>
            ))}
          </OptionSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsi-level">{t("Level")}</Label>
          <Input
            id="rsi-level"
            type="number"
            min={1}
            max={99}
            step="0.5"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsi-trigger">{t("Check")}</Label>
          <OptionSelect
            id="rsi-trigger"
            value={trigger}
            onValueChange={(value) => setTrigger(value as IndicatorTrigger)}
          >
            <option value="close">{t("on candle close")}</option>
            <option value="live">{t("as it happens")}</option>
          </OptionSelect>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="rsi-note">{t("Note (optional)")}</Label>
          <Input
            id="rsi-note"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCondition(p.condition);
              setLevel(String(p.level));
            }}
          >
            {t(p.label)}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Checkbox checked={urgent} onCheckedChange={(checked) => setUrgent(checked === true)} />
          {t("Urgent (repeat until acknowledged)")}
        </label>
        <Button type="submit" size="sm" disabled={!ready || busy}>
          {t("Add alert")}
        </Button>
      </div>
    </form>
  );
}
