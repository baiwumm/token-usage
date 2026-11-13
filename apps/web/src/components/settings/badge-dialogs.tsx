"use client";

// Badge dialogs (docs/badge.md §7.2): the permanent-delete confirmation. Fully
// controlled — the orchestrator owns the target badge and the busy flag.
//
// Revoke needs no dialog: it is reversible (the same link comes back) and the
// row stays in the list, so the icon button plus a toast is enough.

import type { BadgeCopy } from "@/lib/copy/badge";
import type { Locale } from "@/lib/copy/locale-config";
import type { BadgeLink } from "@/lib/badge/api";

import { AlertDialog, Button, Typography } from "@heroui/react";

import { PendingButton } from "@/components/pending-button";
import { formatMessage } from "@/lib/copy/message";

export function DeleteBadgeDialog({
  badge,
  busy,
  copy,
  locale,
  onClose,
  onSubmit,
}: {
  badge: BadgeLink | null;
  busy: boolean;
  copy: BadgeCopy;
  locale: Locale;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen={badge !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>{copy.deleteTitle}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Typography type="body-sm">
              {badge
                ? formatMessage(copy.deleteBody, locale, {
                    name: badge.label.trim() || copy.untitled,
                  })
                : null}
            </Typography>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button isDisabled={busy} slot="close" variant="tertiary">
              {copy.cancel}
            </Button>
            <PendingButton pending={busy} variant="danger" onPress={onSubmit}>
              {copy.deleteConfirm}
            </PendingButton>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
