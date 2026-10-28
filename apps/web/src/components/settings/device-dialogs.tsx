"use client";

// Device dialogs: rename (§2.8) and the two revoke steps (§2.9). Fully
// controlled — the orchestrator owns the target device, the drafts, the busy
// flags and the fetch flows; these components only render the dialogs.

import type { Locale } from "@/lib/copy/locale-config";
import type { SettingsCopy } from "@/lib/copy/settings";
import type { AccountDeviceRow } from "@/lib/dashboard/api";

import {
  AlertDialog,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextField,
  Typography,
} from "@heroui/react";

import { PendingButton } from "@/components/pending-button";
import { formatMessage } from "@/lib/copy/message";

export function RenameDeviceDialog({
  busy,
  copy,
  device,
  draft,
  error,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  busy: boolean;
  copy: SettingsCopy;
  device: AccountDeviceRow | null;
  draft: string;
  error: string | null;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Modal.Backdrop
      isOpen={device !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.CloseTrigger isDisabled={busy} />
            <Modal.Heading>{copy.renameTitle}</Modal.Heading>
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
                name="device_name"
                value={draft}
                onChange={onDraftChange}
              >
                <Label>{copy.renameLabel}</Label>
                <Input
                  placeholder={device?.device_name ?? ""}
                  variant="secondary"
                />
                {error ? <FieldError>{error}</FieldError> : null}
              </TextField>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary" onPress={onClose}>
              {copy.renameCancel}
            </Button>
            <PendingButton pending={busy} onPress={onSubmit}>
              {copy.renameSave}
            </PendingButton>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

// Restore-default-name confirmation. Reuses the frozen rename endpoint
// with the creation snapshot as the new name (§2.7 + §2.8).
export function RestoreDeviceDialog({
  busy,
  copy,
  device,
  locale,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  copy: SettingsCopy;
  device: AccountDeviceRow | null;
  locale: Locale;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <AlertDialog.Backdrop
      isOpen={device !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="accent" />
            <AlertDialog.Heading>{copy.restoreTitle}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Typography type="body-sm">
              {device
                ? formatMessage(copy.restoreBody, locale, {
                    current: device.device_name,
                    defaultName: device.default_device_name,
                  })
                : null}
            </Typography>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button isDisabled={busy} slot="close" variant="tertiary">
              {copy.restoreCancel}
            </Button>
            <PendingButton pending={busy} onPress={onSubmit}>
              {copy.restoreConfirm}
            </PendingButton>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

export function RevokeDeviceDialog({
  busy,
  copy,
  device,
  draft,
  locale,
  step,
  onClose,
  onContinue,
  onDraftChange,
  onSubmit,
}: {
  busy: boolean;
  copy: SettingsCopy;
  device: AccountDeviceRow | null;
  draft: string;
  locale: Locale;
  step: "confirm" | "type";
  onClose: () => void;
  onContinue: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const revokeDraftTrimmed = draft.trim();
  const revokeMatches =
    device !== null && revokeDraftTrimmed === device.device_name;
  const revokeMismatch = revokeDraftTrimmed.length > 0 && !revokeMatches;

  return (
    <>
      {/* Revoke step 1 — consequence summary. */}
      <Modal.Backdrop
        isOpen={device !== null && step === "confirm"}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.CloseTrigger />
              <Modal.Heading>{copy.revokeTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Typography type="body-sm">
                {device?.device_name} · {copy.revokeBody}
              </Typography>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                {copy.revokeCancel}
              </Button>
              <Button
                variant="danger"
                onPress={() => {
                  onContinue();
                }}
              >
                {copy.revokeContinue}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Revoke step 2 — typed confirmation. The final button only unlocks on
          an exact name match; this is a deliberate extra gate on a destructive,
          irreversible action. */}
      <Modal.Backdrop
        isOpen={device !== null && step === "type"}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.CloseTrigger isDisabled={busy} />
              <Modal.Heading>{copy.revokeTypeTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (revokeMatches) onSubmit();
                }}
              >
                <Typography type="body-sm">
                  {formatMessage(copy.revokeTypeBody, locale, {
                    name: device?.device_name ?? "",
                  })}
                </Typography>
                <TextField
                  isRequired
                  isInvalid={revokeMismatch}
                  name="revoke_confirm"
                  value={draft}
                  onChange={onDraftChange}
                >
                  <Label>{copy.revokeTypeLabel}</Label>
                  <Input
                    autoComplete="off"
                    placeholder={copy.revokeTypePlaceholder}
                    variant="secondary"
                  />
                  {revokeMismatch ? (
                    <FieldError>{copy.revokeTypeMismatch}</FieldError>
                  ) : null}
                </TextField>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button isDisabled={busy} slot="close" variant="secondary">
                {copy.revokeCancel}
              </Button>
              <PendingButton
                isDisabled={!revokeMatches}
                pending={busy}
                variant="danger"
                onPress={onSubmit}
              >
                {copy.revokeConfirm}
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
