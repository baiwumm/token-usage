import type { Metadata } from "next";

import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ProjectsClient } from "@/components/projects/projects-client";
import { createPageMetadata, resolveRequestLocale } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveRequestLocale();

  return createPageMetadata({
    key: "projects",
    path: "/projects",
    locale,
  });
}

export default function ProjectsPage() {
  // useSearchParams (the sort key lives in the URL) needs a Suspense boundary
  // when the page is statically rendered.
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ProjectsClient />
      </Suspense>
    </AppShell>
  );
}
