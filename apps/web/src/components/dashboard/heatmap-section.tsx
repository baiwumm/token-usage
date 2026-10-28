import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { HeatmapPayload } from "@/lib/dashboard/api";

import { Card } from "@heroui/react";

import { HeatmapCard } from "./heatmap-card";
import { PanelOverlay } from "./panel-overlay";

import { SectionError, SectionSkeleton } from "@/components/section-states";

/** Activity heatmap slot: the year grid, or its placeholder while it loads. */
export function HeatmapSection({
  copy,
  locale,
  payload,
  refreshing,
  status,
  timezone,
  onDaySelect,
  onRetry,
}: {
  copy: DashboardCopy;
  locale: "zh" | "en";
  payload: HeatmapPayload | null;
  refreshing: boolean;
  status: LoadStatus;
  timezone: string;
  onDaySelect: (day: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="relative">
      <PanelOverlay active={refreshing} />
      {payload ? (
        <HeatmapCard
          copy={copy}
          locale={locale}
          payload={payload}
          timezone={timezone}
          onDaySelect={onDaySelect}
        />
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
    </div>
  );
}
