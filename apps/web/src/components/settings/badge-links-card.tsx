"use client";

// Settings · public badge tab, badge list card (docs/badge.md §7.2,
// docs/ui-spec.md 设置 · 公开徽章). Presentational: the orchestrator owns the
// list, the selection and every mutation. Revoked rows stay listed (and keep
// their slot) until the operator deletes them.

import type { BadgeLink } from "@/lib/badge/api";
import type { BadgeCopy } from "@/lib/copy/badge";

import { Plus } from "@gravity-ui/icons";
import { Card, Description, Typography } from "@heroui/react";

import { BadgeLinkRow } from "./badge-link-row";

import { PendingButton } from "@/components/pending-button";

export function BadgeLinksCard({
  addBusy,
  badges,
  busyId,
  copy,
  limit,
  revokingId,
  selectedId,
  onAdd,
  onCopy,
  onDelete,
  onSelect,
  onToggleRevoked,
}: {
  addBusy: boolean;
  badges: BadgeLink[];
  busyId: string | null;
  copy: BadgeCopy;
  limit: number;
  revokingId: string | null;
  selectedId: string | null;
  onAdd: () => void;
  onCopy: (badge: BadgeLink) => void;
  onDelete: (badge: BadgeLink) => void;
  onSelect: (id: string) => void;
  onToggleRevoked: (badge: BadgeLink) => void;
}) {
  const atLimit = badges.length >= limit;

  return (
    <Card className="p-6">
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Card.Title>{copy.listTitle}</Card.Title>
            <Card.Description>{copy.listDescription}</Card.Description>
          </div>
          <PendingButton
            isDisabled={atLimit || addBusy}
            pending={addBusy}
            size="sm"
            onPress={onAdd}
          >
            {(pending) => (
              <>
                {pending ? null : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                {copy.addBadge}
              </>
            )}
          </PendingButton>
        </div>
      </Card.Header>
      <Card.Content className="flex flex-col gap-1">
        {badges.length === 0 ? (
          <Typography className="py-6 text-center" color="muted" type="body-sm">
            {copy.listEmpty}
          </Typography>
        ) : (
          badges.map((badge) => (
            <BadgeLinkRow
              key={badge.id}
              badge={badge}
              busy={busyId === badge.id}
              copy={copy}
              revoking={revokingId === badge.id}
              selected={selectedId === badge.id}
              onCopy={() => {
                onCopy(badge);
              }}
              onDelete={() => {
                onDelete(badge);
              }}
              onSelect={() => {
                onSelect(badge.id);
              }}
              onToggleRevoked={() => {
                onToggleRevoked(badge);
              }}
            />
          ))
        )}
        {atLimit ? (
          <Description className="text-muted px-3 pt-2 text-xs">
            {copy.addBadgeLimit}
          </Description>
        ) : null}
      </Card.Content>
    </Card>
  );
}
