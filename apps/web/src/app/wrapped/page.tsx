import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { WrappedClient } from "@/components/wrapped/wrapped-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "wrapped",
    path: "/wrapped",
    locale,
  });
}

export default function WrappedPage() {
  return (
    <AppShell>
      <WrappedClient />
    </AppShell>
  );
}
