// Button in the HeroUI pending pattern (web's PendingButton): the clicked
// button flips its render-prop isPending flag and a small current-color
// Spinner takes the place of its leading icon — without it, a pending click
// shows nothing but a disabled row of siblings. Rendering the Spinner *next
// to* the icon (the first cut) showed two glyphs at once; HeroUI's documented
// pattern is `isPending ? <Spinner /> : <Icon />` in the same slot.

import type { ReactNode } from "react";

import { Button, Spinner, type ButtonProps } from "@heroui/react";

export function PendingButton({
  pending,
  icon,
  children,
  ...props
}: Omit<ButtonProps, "isPending" | "children"> & {
  pending: boolean;
  /** Leading icon, replaced by the Spinner while pending. */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Button isPending={pending} {...props}>
      {({ isPending }: { isPending: boolean }) => (
        <>
          {isPending ? (
            <Spinner aria-hidden="true" color="current" size="sm" />
          ) : (
            (icon ?? null)
          )}
          {children}
        </>
      )}
    </Button>
  );
}
