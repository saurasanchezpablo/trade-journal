import { handler, ok, requireValue } from "@/server/api";
import { isLocale } from "@/lib/i18n";
import { getLocale, setLocale } from "@/server/i18n";

/** The journal's language: `{ locale }`, `en` or `es`. */
export const GET = handler(() => ok({ locale: getLocale() }));

export const PUT = handler(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  requireValue(isLocale(body?.locale), "Choose English or Spanish.");
  setLocale(body.locale);
  return ok({ locale: body.locale });
});
