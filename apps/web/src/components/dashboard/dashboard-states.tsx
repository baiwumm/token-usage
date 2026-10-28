import type { DashboardCopy } from "@/lib/copy/dashboard";

import { Button, Card } from "@heroui/react";

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
 * filters (the latter offers a way back to the default range).
 */
export function DashboardEmptyCard({
  copy,
  hasFilters,
  onClearFilters,
}: {
  copy: DashboardCopy;
  hasFilters: boolean;
  onClearFilters: () => void;
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
      {hasFilters ? (
        <Card.Footer>
          <Button size="sm" variant="outline" onPress={onClearFilters}>
            {copy.clearFilters}
          </Button>
        </Card.Footer>
      ) : null}
    </Card>
  );
}
