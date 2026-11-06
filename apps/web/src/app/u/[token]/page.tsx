// Public badge landing page (docs/badge.md §6): where a README badge click
// lands. No AppShell (a public page, like /login), never indexed, and served
// straight from the service-role loaders the badge itself uses — not through
// /api/app. Unknown or disabled tokens 404. Only aggregates cross into the
// client body; the token stays in the URL the visitor already holds.

import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { cache } from "react";

import { UBody } from "@/components/u/u-body";
import { findBadgeOwner } from "@/lib/badge/data";
import { loadPublicPageData } from "@/lib/public-page/data";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

// generateMetadata and the page share one owner lookup per request.
// App Router dynamic params are already URL-decoded; decoding again turns a
// malformed segment (e.g. /u/%25ZZ -> "%ZZ") into an uncaught URIError and a
// 500 instead of the intended 404. Pass the segment through untouched.
const publicOwner = cache(async (token: string) => {
  const owner = await findBadgeOwner(token);

  return owner?.enabled ? owner : null;
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const owner = await publicOwner((await params).token);
  const name = owner?.displayName.trim() || "AI Coding Usage";

  return {
    title: { absolute: `${name} · Token Usage` },
    robots: { index: false, follow: false },
  };
}

export default async function PublicBadgePage({ params }: PageProps) {
  const owner = await publicOwner((await params).token);

  if (!owner) notFound();

  // §4.7 / §6: one all-time payload, SSR service-role, with both opt-in
  // public sections resolved server-side (off = null, never transmitted).
  const data = await loadPublicPageData(owner);

  return <UBody data={data} />;
}
