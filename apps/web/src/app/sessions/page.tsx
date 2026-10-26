import type { Metadata } from "next";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { SessionsClient } from "@/components/sessions/sessions-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "sessions",
    path: "/sessions",
    locale,
  });
}

export default function SessionsPage() {
  // useSearchParams (filters + pagination live in the URL) needs a Suspense
  // boundary when the page is statically rendered.
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SessionsClient />
      </Suspense>
    </AppShell>
  );
}
