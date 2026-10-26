import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { ServiceStatusClient } from "@/components/service-status/service-status-client";

export const metadata: Metadata = {
  title: "服务状态",
};

export default function ServiceStatusPage() {
  return (
    <AppShell>
      <ServiceStatusClient />
    </AppShell>
  );
}
