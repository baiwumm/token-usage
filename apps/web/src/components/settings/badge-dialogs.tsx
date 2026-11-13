"use client";

// Badge dialogs (docs/badge.md §7.2): the shared add/edit name dialog and the
// permanent-delete confirmation. Fully controlled — the orchestrator owns the
// dialog target, the draft, the busy flags and the fetch flows.
//
// Revoke needs no dialog: it is reversible (the same link comes back) and the
// row stays in the list, so the icon button plus a toast is enough.

import type { BadgeCopy } from "@/lib/copy/badge";
import type { Locale } from "@/lib/copy/locale-config";
import type { BadgeLink } from "@/lib/badge/api";

import {
  AlertDialog,
  Button,
  FieldError,
  Form,
  InputGroup,
  Label,
  Modal,
  TextField,
  Typography,
} from "@heroui/react";

import { PendingButton } from "@/components/pending-button";
import { MAX_BADGE_LABEL } from "@/lib/badge/limits";
import { formatMessage } from "@/lib/copy/message";

/** Which side of the shared name dialog is open ("add" creates a badge). */
export type BadgeNameDialogState =
  { mode: "add" } | { mode: "edit"; badge: BadgeLink };

export function BadgeNameDialog({
  busy,
  copy,
  dialog,
  draft,
  error,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  busy: boolean;
  copy: BadgeCopy;
  dialog: BadgeNameDialogState | null;
  draft: string;
  error: string | null;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const add = dialog?.mode === "add";

  return (
    <Modal.Backdrop
      isOpen={dialog !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.CloseTrigger isDisabled={busy} />
            <Modal.Heading>
              {add ? copy.labelDialogAdd : copy.labelDialogEdit}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <Form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              <TextField
                isRequired
                isInvalid={error !== null}
                name="badge_label"
                value={draft}
                onChange={onDraftChange}
              >
                <Label>{copy.labelField}</Label>
                {/* Suffix 实时字数（上限与 limits.ts / 迁移约束对齐） */}
                <InputGroup variant="secondary">
                  <InputGroup.Input
                    autoComplete="off"
                    maxLength={MAX_BADGE_LABEL}
                    placeholder={copy.labelFieldPlaceholder}
                  />
                  <InputGroup.Suffix>
                    {draft.length}/{MAX_BADGE_LABEL}
                  </InputGroup.Suffix>
                </InputGroup>
                {error ? <FieldError>{error}</FieldError> : null}
              </TextField>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              isDisabled={busy}
              slot="close"
              variant="secondary"
              onPress={onClose}
            >
              {copy.cancel}
            </Button>
            <PendingButton
              isDisabled={draft.trim().length === 0}
              pending={busy}
              onPress={onSubmit}
            >
              {add ? copy.labelConfirmAdd : copy.labelConfirmEdit}
            </PendingButton>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

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

// Rotate the public page token (§3.2 leak containment): every /u/<page_token>
// link dies at once, badge embeds are unaffected. Confirmation required —
// already-shared addresses break.
export function ResetPageTokenDialog({
  busy,
  copy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  copy: BadgeCopy;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>{copy.pageResetTitle}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Typography type="body-sm">{copy.pageResetBody}</Typography>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button isDisabled={busy} slot="close" variant="tertiary">
              {copy.cancel}
            </Button>
            <PendingButton pending={busy} variant="danger" onPress={onSubmit}>
              {copy.pageResetConfirm}
            </PendingButton>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
