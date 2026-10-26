import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

// Dashboard at / — requires login (route guard in src/proxy.ts). The product
// landing page is a separate site on token-usage.cc (docs/requirements.md
// 路由约定, 2026-10-24 二次修订).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "dashboard",
    path: "/",
    locale,
  });
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}
