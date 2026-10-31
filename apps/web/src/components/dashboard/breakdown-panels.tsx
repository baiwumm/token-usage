import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { ModelBreakdownSource } from "@/lib/dashboard/api";

import { Card } from "@heroui/react";
import { useMemo } from "react";

import { canonicalSourceRows } from "./aggregate";
import { CreditsCard } from "./credits-card";
import { PanelOverlay } from "./panel-overlay";
import { SourcePanel } from "./source-panel";
import { TopModels } from "./top-models-panel";

import { SectionError, SectionSkeleton } from "@/components/section-states";

/**
 * Model/source breakdown row. Both cards ride the same breakdown slot: the
 * source card always keeps a skeleton placeholder (it never showed an error
 * card of its own), the model card falls back to the shared error block.
 * When credit-based usage exists in the window, the credits card appends
 * below the pair (docs/sources-capture-plan.md §3, C 方案).
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
      ) : (
        <Card className="p-6">
          <Card.Content>
            {status === "loading" ? (
              <SectionSkeleton className="h-56 w-full" />
            ) : (
              <SectionError
                message={copy.states.loadError}
                retry={onRetry}
                retryLabel={copy.states.retry}
              />
            )}
          </Card.Content>
        </Card>
      )}

      {status === "ready" ? (
        <SourcePanel copy={copy} sources={sources} />
      ) : (
        <Card className="p-6">
          <Card.Content>
            <SectionSkeleton className="h-44 w-full" />
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
      ) : null}
    </div>
  );
}
