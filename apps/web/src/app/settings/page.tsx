import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "@/components/settings/settings-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "settings",
    path: "/settings",
    locale,
  });
}

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsClient />
    </AppShell>
  );
}
