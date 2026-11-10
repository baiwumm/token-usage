import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { ModelBreakdownSource } from "@/lib/dashboard/api";

import { Card } from "@heroui/react";
import { useMemo } from "react";

import { canonicalSourceRows } from "./aggregate";
import { CreditsCard } from "./credits-card";
import {
  CreditsCardSkeleton,
  ModelsCardSkeleton,
  SourcesCardSkeleton,
} from "./dashboard-skeleton";
import { SourcePanel } from "./source-panel";
import { TopModels } from "./top-models-panel";

import { PanelOverlay } from "@/components/panel-overlay";
import { SectionError } from "@/components/section-states";

/**
 * Model/source breakdown row. Both cards ride the same breakdown slot and
 * share the three states: ready renders the real panel, loading renders the
 * matching skeleton block from `dashboard-skeleton.tsx` (the same shell the
 * first-load skeleton draws), anything else falls back to the shared error
 * block. When credit-based usage exists in the window, the credits card
 * appends below the pair (docs/sources-capture-plan.md §3, C 方案) — and is
 * drawn as a skeleton while the slot loads, so its row does not pop in.
 */
export function BreakdownPanels({
  copy,
  refreshing,
  sources,
  status,
  onRetry,
  onViewAll,
}: {
  copy: DashboardCopy;
  refreshing: boolean;
  sources: ModelBreakdownSource[];
  status: LoadStatus;
  onRetry: () => void;
  onViewAll: () => void;
}) {
  const credits = useMemo(() => {
    const rows = canonicalSourceRows(sources)
      .filter((row) => row.totalCredits > 0)
      .sort((first, second) => second.totalCredits - first.totalCredits);
    const total =
      Math.round(rows.reduce((sum, row) => sum + row.totalCredits, 0) * 1e6) /
      1e6;

    return {
      rows: rows.map((row) => ({
        id: row.id,
        label: row.label,
        credits: row.totalCredits,
        share: total > 0 ? row.totalCredits / total : 0,
      })),
      total,
    };
  }, [sources]);

  return (
    <div className="relative grid gap-4 lg:grid-cols-2">
      <PanelOverlay active={refreshing} />
      {status === "ready" ? (
        <TopModels copy={copy} sources={sources} onViewAll={onViewAll} />
      ) : status === "loading" ? (
        <ModelsCardSkeleton />
      ) : (
        <Card className="p-6">
          <Card.Content>
            <SectionError
              message={copy.states.loadError}
              retry={onRetry}
              retryLabel={copy.states.retry}
            />
          </Card.Content>
        </Card>
      )}

      {status === "ready" ? (
        <SourcePanel copy={copy} sources={sources} />
      ) : status === "loading" ? (
        <SourcesCardSkeleton />
      ) : (
        <Card className="p-6">
          <Card.Content>
            <SectionError
              message={copy.states.loadError}
              retry={onRetry}
              retryLabel={copy.states.retry}
            />
          </Card.Content>
        </Card>
      )}

      {status === "ready" && credits.total > 0 ? (
        <div className="lg:col-span-2">
          <CreditsCard
            copy={copy}
            refreshing={refreshing}
            rows={credits.rows}
            total={credits.total}
          />
        </div>
      ) : status === "loading" ? (
        <div className="lg:col-span-2">
          <CreditsCardSkeleton />
        </div>
      ) : null}
    </div>
  );
}
