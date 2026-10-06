import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";
import { PrivacyProvider } from "@/components/privacy";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { connection } from "next/server";
import { I18nProvider } from "@/components/i18n";
import { getLocale } from "@/server/i18n";

export const metadata: Metadata = {
  title: "Trade Journal",
  description:
    "The open-source trade journal: broker sync, deep analytics, daily journaling, and AI-native reflection. Self-hosted, free forever.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language is the journal's setting, read on every request (not at build time).
  await connection();
  const locale = getLocale();
  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <TooltipProvider delayDuration={350} skipDelayDuration={150}>
          <Suspense>
            <I18nProvider locale={locale}>
              <ThemeProvider>
                <PrivacyProvider>
                  <Shell>{children}</Shell>
                </PrivacyProvider>
              </ThemeProvider>
            </I18nProvider>
          </Suspense>
        </TooltipProvider>
      </body>
    </html>
  );
}
