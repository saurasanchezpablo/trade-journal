import { ES } from "./i18n/es-index";

/**
 * The journal's languages. Text is written in English in the code and looked up by that
 * English text (`t("Add trade")`); a language's dictionary maps it to the translation, and
 * anything without one shows in English, so a missing entry never breaks a page. Values go
 * in braces (`t("{count} trades", { count })`); a count picks its wording with `tn`.
 */
export type Locale = "en" | "es";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

export const isLocale = (value: unknown): value is Locale => value === "en" || value === "es";

export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Readonly<Record<string, string>> | null> = { en: null, es: ES };

const fill = (text: string, vars?: Vars) =>
  vars
    ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all))
    : text;

/** A text in a language, its `{values}` filled in. */
export function translate(locale: Locale, text: string, vars?: Vars): string {
  return fill(DICTIONARIES[locale]?.[text] ?? text, vars);
}

/**
 * A word whose translation depends on where it is ("Open" the button, "Open" the trade
 * status): looked up as `context|text` first, then as the text alone.
 */
export function translateIn(locale: Locale, context: string, text: string, vars?: Vars): string {
  const dictionary = DICTIONARIES[locale];
  return fill(dictionary?.[`${context}|${text}`] ?? dictionary?.[text] ?? text, vars);
}

/** The wording for a count: `one` for 1, `other` otherwise (`{count}` is filled in). */
export function translateCount(
  locale: Locale,
  count: number,
  one: string,
  other: string,
  vars?: Vars,
): string {
  return translate(locale, count === 1 ? one : other, { count, ...vars });
}

/**
 * The language in use, for code outside React components (helpers that build labels or
 * messages). The page sets it from the journal's setting before rendering; it is one
 * setting for the whole journal, so it is the same for every request.
 */
let active: Locale = "en";
export const setActiveLocale = (locale: Locale) => {
  active = locale;
};
export const activeLocale = () => active;

/** `translate` in the language in use. */
export const tr = (text: string, vars?: Vars) => translate(active, text, vars);
/** `translateIn` in the language in use. */
export const trx = (context: string, text: string, vars?: Vars) =>
  translateIn(active, context, text, vars);
/** `translateCount` in the language in use. */
export const trn = (count: number, one: string, other: string, vars?: Vars) =>
  translateCount(active, count, one, other, vars);

/** The BCP 47 tag for dates and month names in a language. */
export const intlLocale = (locale: Locale = active) => (locale === "es" ? "es-ES" : "en-US");
