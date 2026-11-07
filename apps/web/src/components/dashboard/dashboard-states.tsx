import type { DashboardCopy } from "@/lib/copy/dashboard";

import { Button, Card, Typography } from "@heroui/react";

import { SectionError } from "@/components/section-states";

/**
 * Section card that stands in for a panel whose request failed. Same shell as
 * every panel card, so a failing slot keeps the page grid intact.
 */
export function DashboardErrorCard({
  copy,
  onRetry,
}: {
  copy: DashboardCopy;
  onRetry: () => void;
}) {
  return (
    <Card className="p-6">
      <Card.Content>
        <SectionError
          message={copy.states.loadError}
          retry={onRetry}
          retryLabel={copy.states.retry}
        />
      </Card.Content>
    </Card>
  );
}

/**
 * Zero-data state: an empty window vs. a window narrowed to nothing by the
 * filters (the latter offers a way back to the default range). The bare empty
 * window also points at /sync-runs — with the standalone status page gone
 * (2026-11-07 信息架构调整), the runs list is where capture health lives.
 */
export function DashboardEmptyCard({
  copy,
  hasFilters,
  onClearFilters,
  onOpenSyncRuns,
}: {
  copy: DashboardCopy;
  hasFilters: boolean;
  onClearFilters: () => void;
  onOpenSyncRuns: () => void;
}) {
  return (
    <Card className="p-10">
      <Card.Header>
        <Card.Title>
          {hasFilters ? copy.states.filterEmptyTitle : copy.states.emptyTitle}
        </Card.Title>
        <Card.Description>
          {hasFilters ? copy.states.filterEmptyBody : copy.states.emptyBody}
        </Card.Description>
      </Card.Header>
      <Card.Footer
        className={
          hasFilters
            ? undefined
            : "flex flex-wrap items-center justify-between gap-3"
        }
      >
        {hasFilters ? (
          <Button size="sm" variant="outline" onPress={onClearFilters}>
            {copy.clearFilters}
          </Button>
        ) : (
          <>
            <Typography color="muted" type="body-xs">
              {copy.states.emptyPipelineHint}
            </Typography>
            <Button size="sm" variant="outline" onPress={onOpenSyncRuns}>
              {copy.states.emptyPipelineCta}
            </Button>
          </>
        )}
      </Card.Footer>
    </Card>
  );
}
