"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/ui/option-select";
import { LOCALES, isLocale } from "@/lib/i18n";
import { postJson } from "@/lib/use-api";
import { useI18n } from "./i18n";

/** The journal's language, for every browser. The page reloads in the new language. */
export function LanguageSettings() {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async (next: string) => {
    if (!isLocale(next) || next === locale) return;
    setBusy(true);
    setError("");
    try {
      await postJson("/api/locale", { locale: next }, "PUT");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the language."));
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-4" aria-hidden="true" /> {t("Language")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="journal-language">{t("Language of the journal")}</Label>
        <OptionSelect
          id="journal-language"
          className="w-56"
          value={locale}
          disabled={busy}
          onValueChange={(value) => void change(value)}
        >
          {LOCALES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </OptionSelect>
        <p className="text-xs text-muted-foreground">
          {t(
            "Pages, messages, notifications and AI answers use it, in every browser. Names you typed (accounts, tags, notes) stay as you wrote them.",
          )}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
