import type { Metadata } from "next";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { SyncRunsClient } from "@/components/sync-runs/sync-runs-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "sync-runs",
    path: "/sync-runs",
    locale,
  });
}

export default function SyncRunsPage() {
  // useSearchParams (filters + pagination live in the URL) needs a Suspense
  // boundary when the page is statically rendered.
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SyncRunsClient />
      </Suspense>
    </AppShell>
  );
}
