import type { Metadata } from "next";

import { StatusClient } from "./status-client";

export const metadata: Metadata = {
  title: "服务状态",
};

export default function ServiceStatusPage() {
  return <StatusClient />;
}
