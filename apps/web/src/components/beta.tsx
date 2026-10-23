"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { FlaskConical } from "lucide-react";
import { BETA_FEATURES, NO_BETA, type BetaFeature, type BetaFlags } from "@/lib/beta-features";
import { useI18n } from "./i18n";

const BetaContext = createContext<BetaFlags>(NO_BETA);

/** The beta switches, read by the server for every request (as the language is). */
export function BetaProvider({ flags, children }: { flags: BetaFlags; children: React.ReactNode }) {
  return <BetaContext.Provider value={flags}>{children}</BetaContext.Provider>;
}

export const useBeta = () => useContext(BetaContext);

/** A beta feature's page: its content when switched on, else how to switch it on. */
export function BetaGate({
  feature,
  children,
}: {
  feature: BetaFeature;
  children: React.ReactNode;
}) {
  const flags = useBeta();
  const { t } = useI18n();
  if (flags[feature]) return <>{children}</>;
  const info = BETA_FEATURES.find((f) => f.id === feature)!;
  return (
    <div className="mx-auto max-w-xl space-y-3 p-8 text-center">
      <FlaskConical className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">{t(info.title)}</h1>
      <p className="text-sm text-muted-foreground">{t(info.detail)}</p>
      <p className="text-sm">
        {t("This is a beta feature and it is off.")}{" "}
        <Link href="/settings#beta" className="underline underline-offset-2">
          {t("Turn it on in Settings, Beta features.")}
        </Link>
      </p>
    </div>
  );
}
