"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESOLUTIONS,
  type Resolution,
  type MarketConnection,
  type TradeMarketResult,
} from "@/lib/market-data";
import type { TradePoint } from "@/lib/trade-explorer";
import { providerInfo } from "@/lib/market-providers";
import { useApi } from "@/lib/use-api";
import { Button } from "./ui/button";
import { OptionSelect } from "./ui/option-select";
import { useI18n } from "./i18n";

export function ReportMarketEstimates({
  points,
  currencies,
  onComplete,
}: {
  points: TradePoint[];
  currencies: string[];
  onComplete: () => void;
}) {
  const { t, tn } = useI18n();
  const { data } = useApi<{ connections: MarketConnection[] }>("/api/market-data/connections");
  const available = data?.connections.filter((item) => item.configured) ?? [];
  const [provider, setProvider] = useState("");
  const [dataset, setDataset] = useState("");
  const [resolution, setResolution] = useState<Resolution>("1m");
  const info = providerInfo(provider);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const missing = points.filter((point) => point.mae === null || point.mfe === null);
  const calculate = async () => {
    if (!available.some((item) => item.id === provider) || (info?.datasets && !dataset)) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setIssues([]);
    let saved = 0,
      failed = 0,
      completed = 0,
      consecutiveFailures = 0;
    const problems = new Set<string>();
    try {
      for (const point of missing) {
        if (request.signal.aborted) break;
        setStatus(
          t("Calculating {done} of {total} · {symbol}", {
            done: completed + 1,
            total: missing.length,
            symbol: point.symbol,
          }),
        );
        try {
          const response = await fetch(`/api/trades/${encodeURIComponent(point.key)}/market-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider,
              symbol: point.symbol,
              resolution,
              dataset,
              basisConfirmed: true,
              estimateOnly: true,
            }),
            signal: request.signal,
          });
          const body = (await response.json()) as TradeMarketResult & { error?: string };
          // Raw fetch: the server's English message is translated here.
          if (!response.ok) throw new Error(t(body.error ?? "History request failed."));
          if (body.estimate.mae === null || body.estimate.mfe === null)
            throw new Error(t(body.estimate.warnings[0] ?? "Estimate unavailable."));
          saved++;
          consecutiveFailures = 0;
        } catch (cause) {
          if (request.signal.aborted) break;
          failed++;
          consecutiveFailures++;
          problems.add(
            `${point.symbol}: ${cause instanceof Error ? cause.message : t("History request failed.")}`,
          );
          setIssues([...problems].slice(0, 3));
        }
        completed++;
        // Stop a systemic provider failure instead of repeating it across an entire account.
        if (consecutiveFailures >= 3) break;
      }
    } finally {
      setBusy(false);
      setStatus(
        t(
          request.signal.aborted
            ? "Stopped. {saved} estimates saved · {failed} unavailable · {skipped} not processed."
            : "{saved} estimates saved · {failed} unavailable · {skipped} not processed.",
          { saved, failed, skipped: missing.length - completed },
        ),
      );
      onComplete();
    }
  };
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-medium">{t("MAE & MFE estimates")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "{saved} of {total} closed trades have saved estimates. Estimated gross excursions exclude fees; MAE is shown as a positive adverse amount. Missing values are excluded from plots, never counted as zero.",
            { saved: points.length - missing.length, total: points.length },
          )}
        </p>
      </div>
      {missing.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">{t("Calculate missing estimates")}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "Loads {resolution} candles for this selection using each trade’s recorded symbol. This uses your provider allowance and may take several minutes. For custom symbols or a specific CSV dataset, load and save estimates from the individual trade.",
                { resolution },
              )}
            </p>
            {available.length ? (
              <>
                <OptionSelect
                  aria-label={t("Estimate data provider")}
                  value={provider}
                  disabled={busy}
                  onValueChange={(value) => {
                    setProvider(value);
                    setDataset("");
                    setConfirmed(false);
                  }}
                >
                  <option value="" disabled>
                    {t("Choose a data source")}
                  </option>
                  {available.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </OptionSelect>
                <OptionSelect
                  aria-label={t("Estimate candle resolution")}
                  disabled={busy}
                  value={resolution}
                  onValueChange={(value) => setResolution(value as Resolution)}
                >
                  {Object.keys(RESOLUTIONS).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </OptionSelect>
                {info?.datasets && (
                  <OptionSelect
                    aria-label={t("Estimate dataset")}
                    value={dataset}
                    disabled={busy}
                    onValueChange={(value) => {
                      setDataset(value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="" disabled>
                      {t("Choose a dataset")}
                    </option>
                    {info.datasets.map((item) => (
                      <option key={item.value} value={item.value}>
                        {t(item.label)}
                      </option>
                    ))}
                  </OptionSelect>
                )}
                <p className="text-xs text-muted-foreground">{info ? t(info.symbolHint) : ""}</p>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy || currencies.length !== 1}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  {t(
                    "I confirm these symbols, price adjustments and quote currencies match the fills and account currency ({currencies}).",
                    { currencies: currencies.join(", ") || t("none") },
                  )}
                </label>
                {currencies.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {t("Select accounts with one currency to calculate estimates together.")}
                  </p>
                )}
                <Button
                  disabled={
                    busy ||
                    !confirmed ||
                    currencies.length !== 1 ||
                    !available.some((item) => item.id === provider) ||
                    Boolean(info?.datasets && !dataset)
                  }
                  onClick={() => void calculate()}
                >
                  {tn(
                    missing.length,
                    "Calculate {count} missing estimate",
                    "Calculate {count} missing estimates",
                  )}
                </Button>
              </>
            ) : (
              <a className="text-sm underline" href="/settings#market-data">
                {t("Connect a market data provider in Settings")}
              </a>
            )}
          </div>
        </details>
      )}
      {busy && (
        <Button variant="outline" onClick={() => controller.current?.abort()}>
          {t("Stop calculation")}
        </Button>
      )}
      {status && (
        <p role="status" className="text-xs text-muted-foreground">
          {status}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
