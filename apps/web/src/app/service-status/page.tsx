import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ServiceStatusClient } from "@/components/service-status/service-status-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "service-status",
    path: "/service-status",
    locale,
  });
}

export default function ServiceStatusPage() {
  return (
    <AppShell>
      <ServiceStatusClient />
    </AppShell>
  );
}
