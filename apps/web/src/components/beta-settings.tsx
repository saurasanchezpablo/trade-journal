"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { BETA_FEATURES, type BetaFeature } from "@/lib/beta-features";
import { postJson } from "@/lib/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useBeta } from "./beta";
import { useI18n } from "./i18n";

/** Beta features, each on or off for the whole journal. The page reloads with the change. */
export function BetaSettings() {
  const { t } = useI18n();
  const flags = useBeta();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async (feature: BetaFeature, on: boolean) => {
    setBusy(true);
    setError("");
    try {
      await postJson("/api/beta", { [feature]: on }, "PUT");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-4" aria-hidden="true" /> {t("Beta features")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            "Experimental parts of the journal. Switched off, they leave the sidebar, their pages and their background work stop; what they stored is kept for when you switch them on again.",
          )}
        </p>
        {BETA_FEATURES.map((f) => (
          <div key={f.id} className="flex items-start gap-3">
            <Checkbox
              id={`beta-${f.id}`}
              checked={flags[f.id]}
              disabled={busy}
              onCheckedChange={(checked) => void change(f.id, checked === true)}
            />
            <div className="space-y-0.5">
              <Label htmlFor={`beta-${f.id}`}>{t(f.title)}</Label>
              <p className="text-xs text-muted-foreground">{t(f.detail)}</p>
            </div>
          </div>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
