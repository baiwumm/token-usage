import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { DeviceClient } from "@/components/device/device-client";

export const metadata: Metadata = {
  title: "设备配对",
};

export default function DevicePage() {
  return (
    <AppShell>
      <DeviceClient />
    </AppShell>
  );
}
