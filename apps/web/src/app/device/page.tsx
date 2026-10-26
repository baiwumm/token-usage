import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { DeviceClient } from "@/components/device/device-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "device",
    path: "/device",
    locale,
  });
}

export default function DevicePage() {
  return (
    <AppShell>
      <DeviceClient />
    </AppShell>
  );
}
