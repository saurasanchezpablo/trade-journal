"use client";

import type { ImportReview, ImportReviewOptions } from "@/lib/import-review";
import { Button } from "@/components/ui/button";
import { fmtMoney } from "@/lib/utils";
import { MonetaryValue } from "@/components/privacy";
import { useI18n } from "@/components/i18n";

export function ImportReconciliation({
  review,
  options,
  onChange,
  onReview,
  busy,
}: {
  review?: ImportReview;
  options: ImportReviewOptions;
  onChange: (next: ImportReviewOptions) => void;
  onReview: () => void;
  busy: boolean;
}) {
  const { t, tn } = useI18n();
  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-sm font-medium">{t("Review NinjaTrader import")}</p>
      <p className="text-xs text-muted-foreground">
        {t(
          "Keep each source account separate inside your selected journal account. Review the result before saving.",
        )}
      </p>
      {review && (
        <>
          {review.sources.map((source) => (
            <label key={source.key} className="block space-y-1 text-sm">
              <span>{source.label}</span>
              <select
                aria-label={t("Source mapping for {source}", { source: source.label })}
                disabled={busy || source.saved}
                className="block w-full rounded-md border bg-background p-2 text-sm"
                value={options.sourceMappings?.[source.key] ?? source.selected ?? ""}
                onChange={(event) =>
                  onChange({
                    ...options,
                    sourceMappings: { ...options.sourceMappings, [source.key]: event.target.value },
                  })
                }
              >
                <option value="">{t("Choose the source this file belongs to")}</option>
                {review.savedSources.map((saved) => (
                  <option key={saved.id} value={saved.id}>
                    {saved.name}
                  </option>
                ))}
                <option value="new">{t("Create a separate source account")}</option>
              </select>
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            {t(
              "If an account or connection was renamed, select its existing source. Choose a new source only for a genuinely different account.",
            )}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status">
            <span>{tn(review.inserted, "{count} new fill", "{count} new fills")}</span>
            <span>
              {tn(review.duplicates, "{count} duplicate fill", "{count} duplicate fills")}
            </span>
            <span>
              {tn(review.corrections.length, "{count} fee correction", "{count} fee corrections")}
            </span>
          </div>
          {review.multipliers.map((item) => (
            <p key={item.symbol} className="text-xs">
              {item.value === null
                ? t("{symbol} multiplier: missing, set it in Settings", { symbol: item.symbol })
                : t("{symbol} multiplier: {value}", { symbol: item.symbol, value: item.value })}
            </p>
          ))}
          {review.multipliers.some((item) => item.value === null) && (
            <a className="text-sm underline" href="/settings" target="_blank" rel="noreferrer">
              {t("Open Settings, then review again")}
            </a>
          )}
          {review.totals && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {t("Destination account after import ({currency})", {
                  currency: review.currency,
                })}
              </p>
              <p>
                {tn(review.totals.closedTrades, "{count} closed trade", "{count} closed trades")} ·{" "}
                {tn(review.totals.openTrades, "{count} open trade", "{count} open trades")}
              </p>
              <p>
                {t("Closed-trade net P&L:")}{" "}
                <MonetaryValue>{fmtMoney(review.totals.netPnl, review.currency)}</MonetaryValue> ·
                {t("Fees:")}{" "}
                <MonetaryValue>{fmtMoney(review.totals.fees, review.currency)}</MonetaryValue>
              </p>
            </div>
          )}
          {review.needsCompleteHistory && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!options.completeHistory}
                disabled={busy}
                onChange={(event) =>
                  onChange({ ...options, completeHistory: event.target.checked })
                }
              />
              <span>
                {t(
                  "This export includes every execution for each listed source contract between its first and last timestamp. It is not a partial selection of repeated fills.",
                )}
              </span>
            </label>
          )}
          {!!review.corrections.length && (
            <div className="space-y-2">
              {review.corrections.slice(0, 10).map((correction, index) => (
                <p key={index} className="text-xs">
                  {correction.symbol} · {correction.executedAt}: {t("commission")}{" "}
                  <MonetaryValue>{fmtMoney(correction.oldFee, review.currency)}</MonetaryValue> →{" "}
                  <MonetaryValue>{fmtMoney(correction.newFee, review.currency)}</MonetaryValue>
                </p>
              ))}
              {review.corrections.length > 10 && (
                <p className="text-xs">
                  {tn(
                    review.corrections.length - 10,
                    "Plus {count} more fee correction.",
                    "Plus {count} more fee corrections.",
                  )}
                </p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!options.approveFeeCorrections}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({ ...options, approveFeeCorrections: event.target.checked })
                  }
                />
                <span>
                  {t(
                    "Apply these commission corrections to the existing executions and recalculate P&L.",
                  )}
                </span>
              </label>
            </div>
          )}
          {review.warnings.map((message) => (
            <p key={message} className="text-xs text-muted-foreground">
              {message}
            </p>
          ))}
          {review.conflicts.map((message) => (
            <p key={message} role="alert" className="text-xs text-loss">
              {message}
            </p>
          ))}
        </>
      )}
      <Button variant="outline" disabled={busy} onClick={onReview}>
        {busy ? t("Reviewing…") : t("Review import")}
      </Button>
      {review?.token && (
        <p className="text-xs text-muted-foreground">
          {t(
            "Review complete. Import will save this result; if the file, settings or journal changes, another review is required.",
          )}
        </p>
      )}
    </div>
  );
}
