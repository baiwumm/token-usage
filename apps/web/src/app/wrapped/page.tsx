import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { WrappedClient } from "@/components/wrapped/wrapped-client";

export const metadata: Metadata = {
  title: "年度回顾",
};

export default function WrappedPage() {
  return (
    <AppShell>
      <WrappedClient />
    </AppShell>
  );
}
