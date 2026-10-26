import type { Metadata, Viewport } from "next";

import { cookies, headers } from "next/headers";

import "@/styles/globals.css";

import { Providers } from "./providers";

import { LocaleProvider } from "@/lib/copy/locale";
import {
  LOCALE_COOKIE,
  htmlLangFor,
  normalizeLocalePreference,
  resolveLocale,
} from "@/lib/copy/locale-config";
import { FormatProvider } from "@/lib/format/format";
import { resolveFxSnapshot } from "@/lib/format/server";
import { createSiteMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createSiteMetadata(locale);
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the UI language before rendering so the SSR markup, <html lang>
  // and the client's first render all agree (no zh → en flash on reload).
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const storedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const initialLocale = resolveLocale(
    storedLocale,
    headerStore.get("accept-language"),
  );
  const initialPreference = normalizeLocalePreference(storedLocale);

  return (
    <html suppressHydrationWarning lang={htmlLangFor(initialLocale)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <LocaleProvider
          initialLocale={initialLocale}
          initialPreference={initialPreference}
        >
          <FormatProvider fx={resolveFxSnapshot()}>
            <Providers
              themeProps={{
                attribute: "class",
                defaultTheme: "system",
                enableSystem: true,
              }}
            >
              {children}
            </Providers>
          </FormatProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
