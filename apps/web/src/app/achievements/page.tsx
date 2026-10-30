import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { AchievementsClient } from "@/components/achievements/achievements-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "achievements",
    path: "/achievements",
    locale,
  });
}

export default function AchievementsPage() {
  // No search params: the page keeps its whole state in the payload, so it
  // needs no Suspense boundary.
  return (
    <AppShell>
      <AchievementsClient />
    </AppShell>
  );
}
