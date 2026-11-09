// Button in the HeroUI pending pattern (web's PendingButton): the clicked
// button flips its render-prop isPending flag and a small current-color
// Spinner rides in front of the label — without it, a pending click shows
// nothing but a disabled row of siblings.

import type { ReactNode } from "react";

import { Button, Spinner, type ButtonProps } from "@heroui/react";

export function PendingButton({
  pending,
  children,
  ...props
}: Omit<ButtonProps, "isPending" | "children"> & {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <Button isPending={pending} {...props}>
      {({ isPending }: { isPending: boolean }) => (
        <>
          {isPending ? (
            <Spinner aria-hidden="true" color="current" size="sm" />
          ) : null}
          {children}
        </>
      )}
    </Button>
  );
}
