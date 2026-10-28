import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { ModelBreakdownSource } from "@/lib/dashboard/api";

import { Card } from "@heroui/react";

import { PanelOverlay } from "./panel-overlay";
import { SourcePanel } from "./source-panel";
import { TopModels } from "./top-models-panel";

import { SectionError, SectionSkeleton } from "@/components/section-states";

/**
 * Model/source breakdown row. Both cards ride the same breakdown slot: the
 * source card always keeps a skeleton placeholder (it never showed an error
 * card of its own), the model card falls back to the shared error block.
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
    </div>
  );
}
