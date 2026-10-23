import type { Metadata, Viewport } from "next";

import "@/styles/globals.css";

import { Providers } from "./providers";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="zh-CN">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers themeProps={{ attribute: "class", defaultTheme: "dark" }}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
