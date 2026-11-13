"use client";

// One badge in the settings list (docs/badge.md §7.2). Presentational: the
// orchestrator owns selection, the fetch flows and the delete dialog. The text
// block selects the row; the icon buttons act on it without selecting.

import type { BadgeLink } from "@/lib/badge/api";
import type { BadgeCopy } from "@/lib/copy/badge";
import type { ReactNode } from "react";

import {
  ArrowRotateLeft,
  Ban,
  Copy,
  Pencil,
  TrashBin,
} from "@gravity-ui/icons";
import { Button, Chip, Spinner, Tooltip, Typography, cn } from "@heroui/react";

import { badgeName, badgeSummary } from "./badge-helpers";

// Icon-only row actions carry their label in a tooltip (docs/ui-spec.md).
function ActionTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip delay={0}>
      {children}
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{label}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function BadgeLinkRow({
  badge,
  busy,
  copy,
  revoking,
  selected,
  onCopy,
  onDelete,
  onEdit,
  onSelect,
  onToggleRevoked,
}: {
  badge: BadgeLink;
  busy: boolean;
  copy: BadgeCopy;
  /** True while this row's revoke/restore PATCH is in flight. */
  revoking: boolean;
  selected: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onToggleRevoked: () => void;
}) {
  const revoked = badge.revokedAt !== null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors",
        selected ? "bg-surface-secondary" : "hover:bg-surface-secondary/60",
      )}
    >
      <button
        aria-pressed={selected}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
        type="button"
        onClick={onSelect}
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <Typography type="body-sm" weight="medium">
            {badgeName(copy, badge)}
          </Typography>
          {revoked ? (
            <Chip color="warning" size="sm" variant="soft">
              {copy.revokedChip}
            </Chip>
          ) : (
            <Chip color="success" size="sm" variant="soft">
              {copy.activeChip}
            </Chip>
          )}
        </span>
        <Typography className="truncate" color="muted" type="body-xs">
          {badgeSummary(copy, badge)}
        </Typography>
      </button>

      <div className="flex shrink-0 gap-1">
        <ActionTooltip label={copy.labelDialogEdit}>
          <Button
            isIconOnly
            aria-label={copy.labelDialogEdit}
            isDisabled={busy}
            size="sm"
            variant="tertiary"
            onPress={onEdit}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </Button>
        </ActionTooltip>
        <ActionTooltip label={copy.copyLink}>
          <Button
            isIconOnly
            aria-label={copy.copyLink}
            size="sm"
            variant="tertiary"
            onPress={onCopy}
          >
            <Copy aria-hidden="true" className="size-4" />
          </Button>
        </ActionTooltip>
        <ActionTooltip label={revoked ? copy.restore : copy.revoke}>
          <Button
            isIconOnly
            aria-label={revoked ? copy.restore : copy.revoke}
            isDisabled={busy}
            size="sm"
            variant="tertiary"
            onPress={onToggleRevoked}
          >
            {revoking ? (
              <Spinner color="current" size="sm" />
            ) : revoked ? (
              <ArrowRotateLeft aria-hidden="true" className="size-4" />
            ) : (
              <Ban aria-hidden="true" className="size-4" />
            )}
          </Button>
        </ActionTooltip>
        <ActionTooltip label={copy.deleteBadge}>
          <Button
            isIconOnly
            aria-label={copy.deleteBadge}
            isDisabled={busy}
            size="sm"
            variant="danger-soft"
            onPress={onDelete}
          >
            <TrashBin aria-hidden="true" className="size-4" />
          </Button>
        </ActionTooltip>
      </div>
    </div>
  );
}
