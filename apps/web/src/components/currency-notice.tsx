"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { CurrencyScope } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n";

export function CurrencyNotice({ scope }: { scope: CurrencyScope }) {
  const t = useT();
  if (scope.converted)
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">
        {t("Trading P&L in {currency} · saved baseline conversion rates.", {
          currency: scope.currency ?? "",
        })}{" "}
        <Link className="underline" href="/settings#currency-conversion">
          {t("Edit rates")}
        </Link>
      </p>
    );
  if (scope.monetary && !scope.missingCurrencies.length) return null;
  return (
    <div
      role="status"
      className="mx-4 my-3 flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
        />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            {t("Set up conversion to see your combined dashboard")}
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {scope.missingCurrencies.length
              ? t(
                  "Save conversion rates for {currencies} to use the reporting currency. Amounts below remain in their original currencies.",
                  { currencies: scope.missingCurrencies.join(", ") },
                )
              : t(
                  "These accounts use {currencies}. Set your conversion rates to combine their performance.",
                  { currencies: scope.sourceCurrencies.join(", ") },
                )}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0 self-start lg:self-auto">
        <Link href="/settings#currency-conversion">{t("Set up currency conversion")}</Link>
      </Button>
    </div>
  );
}
