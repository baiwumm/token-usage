import type { Metadata } from "next";

import { DeviceClient } from "./device-client";

export const metadata: Metadata = {
  title: "设备配对",
};

export default function DevicePage() {
  return <DeviceClient />;
}
