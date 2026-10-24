import type { Metadata, Viewport } from "next";

import { cookies, headers } from "next/headers";

import "@/styles/globals.css";

import { Providers } from "./providers";

import { LocaleProvider } from "@/lib/copy/locale";
import {
  LOCALE_COOKIE,
  htmlLangFor,
  resolveLocale,
} from "@/lib/copy/locale-config";

export const metadata: Metadata = {
  title: {
    default: "Token Usage",
    template: "%s - Token Usage",
  },
  description: "Self-hosted AI token usage tracking.",
  icons: {
    icon: "/favicon.ico",
  },
};

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
  const initialLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );

  return (
    <html suppressHydrationWarning lang={htmlLangFor(initialLocale)}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <LocaleProvider initialLocale={initialLocale}>
          <Providers themeProps={{ attribute: "class", defaultTheme: "dark" }}>
            {children}
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
