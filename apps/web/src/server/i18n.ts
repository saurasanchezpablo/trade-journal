import {
  isLocale,
  translate,
  translateCount,
  translateIn,
  type Locale,
  type Vars,
} from "@/lib/i18n";
import { getSetting, setSetting } from "./settings";

/** The journal's language, one setting for every browser (Settings → Language). */
const KEY = "locale";

export function getLocale(): Locale {
  const value = getSetting(KEY);
  return isLocale(value) ? value : "en";
}

export function setLocale(locale: Locale) {
  setSetting(KEY, locale);
}

/** Server text (notifications, messages) in the journal's language. */
export const serverT = (text: string, vars?: Vars) => translate(getLocale(), text, vars);
export const serverTn = (count: number, one: string, other: string, vars?: Vars) =>
  translateCount(getLocale(), count, one, other, vars);
export const serverTx = (context: string, text: string, vars?: Vars) =>
  translateIn(getLocale(), context, text, vars);
