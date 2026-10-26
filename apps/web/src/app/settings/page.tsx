import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = {
  title: "账户设置",
};

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsClient />
    </AppShell>
  );
}
