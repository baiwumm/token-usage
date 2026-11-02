"use client";

// Badge token dialogs (docs/badge.md §7.2): the reset confirmation and the
// one-time reveal of a freshly generated token. Fully controlled — the card
// owns the open state, the busy flag and the fetch flow.

import type { BadgeView } from "@/lib/badge/api";
import type { BadgeCopy } from "@/lib/copy/badge";

import { Copy } from "@gravity-ui/icons";
import {
  Alert,
  AlertDialog,
  Button,
  Input,
  Label,
  Modal,
  TextField,
  Typography,
} from "@heroui/react";

import { BadgeSnippetSection, copyText } from "./badge-snippet-section";

import { PendingButton } from "@/components/pending-button";

export function ResetBadgeDialog({
  busy,
  copy,
  isOpen,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  copy: BadgeCopy;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="warning" />
            <AlertDialog.Heading>{copy.resetTitle}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Typography type="body-sm">{copy.resetBody}</Typography>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button isDisabled={busy} slot="close" variant="tertiary">
              {copy.cancel}
            </Button>
            <PendingButton pending={busy} variant="danger" onPress={onConfirm}>
              {copy.resetConfirm}
            </PendingButton>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

// The plaintext lives only in this dialog's props: closing it drops the token
// for good, so a stray backdrop click or Escape must not dismiss it.
export function RevealTokenDialog({
  copy,
  origin,
  token,
  view,
  onClose,
}: {
  copy: BadgeCopy;
  origin: string;
  token: string | null;
  view: BadgeView;
  onClose: () => void;
}) {
  return (
    <Modal.Backdrop
      isKeyboardDismissDisabled
      isDismissable={false}
      isOpen={token !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>{copy.revealTitle}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{copy.revealWarning}</Alert.Description>
              </Alert.Content>
            </Alert>
            <div className="flex items-end gap-2">
              <TextField
                isReadOnly
                className="min-w-0 flex-1"
                value={token ?? ""}
              >
                <Label>{copy.revealTokenLabel}</Label>
                <Input
                  className="font-mono text-xs"
                  spellCheck={false}
                  variant="secondary"
                />
              </TextField>
              <Button
                isIconOnly
                aria-label={copy.copy}
                variant="secondary"
                onPress={() => {
                  if (token) void copyText(token, copy);
                }}
              >
                <Copy aria-hidden="true" className="size-4" />
              </Button>
            </div>
            {token ? (
              <BadgeSnippetSection
                copy={copy}
                origin={origin}
                token={token}
                view={view}
              />
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" onPress={onClose}>
              {copy.revealDone}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
