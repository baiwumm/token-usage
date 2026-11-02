// Public badge landing page (docs/badge.md §6): where a README badge click
// lands. No AppShell (a public page, like /login), never indexed, and served
// straight from the service-role loaders the badge itself uses — not through
// /api/app. Unknown or disabled tokens 404. Only aggregates cross into the
// client body; the token stays in the URL the visitor already holds.

import type { Metadata } from "next";

import { notFound } from "next/navigation";
import { cache } from "react";

import { UBody } from "@/components/u/u-body";
import { findBadgeOwner, loadBadgeData } from "@/lib/badge/data";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

// generateMetadata and the page share one owner lookup per request.
const publicOwner = cache(async (token: string) => {
  const owner = await findBadgeOwner(decodeURIComponent(token));

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

  const config = { displayName: owner.displayName, timezone: owner.timezone };
  const [account, ...repos] = await Promise.all([
    loadBadgeData(owner.userId, config, "user", null, "all"),
    ...owner.allowedProjects.map((project) =>
      loadBadgeData(owner.userId, config, "repo", project, "all"),
    ),
  ]);

  return <UBody account={account} repos={repos} />;
}
