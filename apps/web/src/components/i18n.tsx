"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  intlLocale,
  setActiveLocale,
  translate,
  translateCount,
  translateIn,
  type Locale,
  type Vars,
} from "@/lib/i18n";

const I18nContext = createContext<Locale>("en");

/** The journal's language for everything below it (set from the server's setting). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  // Helpers outside React read the same language (see `tr` in lib/i18n).
  setActiveLocale(locale);
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

/**
 * Text in the journal's language: `t("Add trade")`, `t("{count} trades", { count })`,
 * `tn(count, "{count} trade", "{count} trades")`, `tx("status", "Open")` for a word that
 * reads differently in a context, and the Intl locale for dates.
 */
export function useI18n() {
  const locale = useContext(I18nContext);
  return useMemo(
    () => ({
      locale,
      intl: intlLocale(locale),
      t: (text: string, vars?: Vars) => translate(locale, text, vars),
      tx: (context: string, text: string, vars?: Vars) => translateIn(locale, context, text, vars),
      tn: (count: number, one: string, other: string, vars?: Vars) =>
        translateCount(locale, count, one, other, vars),
    }),
    [locale],
  );
}

/** Just `t`, for components that only need text. */
export const useT = () => useI18n().t;
