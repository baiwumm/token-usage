import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

// Dashboard at / — requires login (route guard in src/proxy.ts). The product
// landing page is a separate site on token-usage.cc (docs/requirements.md
// 路由约定, 2026-10-24 二次修订).
export const metadata: Metadata = {
  title: "仪表盘",
};

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardClient />
    </AppShell>
  );
}
