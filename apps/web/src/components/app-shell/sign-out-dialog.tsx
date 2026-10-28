import type { NavCopy } from "@/lib/copy/nav";

import { AlertDialog, Button, Spinner, Typography } from "@heroui/react";

/**
 * Sign-out confirmation. Same controlled-overlay workaround as the mobile
 * drawer: state lives on the backdrop, not the root.
 */
export function SignOutDialog({
  copy,
  open,
  signingOut,
  onConfirm,
  onOpenChange,
}: {
  copy: NavCopy;
  open: boolean;
  signingOut: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog.Backdrop
      isDismissable={!signingOut}
      isOpen={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Heading>{copy.signOut}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <Typography type="body-sm">{copy.signOutConfirm}</Typography>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button isDisabled={signingOut} slot="close" variant="tertiary">
              {copy.cancel}
            </Button>
            <Button isPending={signingOut} variant="danger" onPress={onConfirm}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {copy.signOut}
                </>
              )}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
