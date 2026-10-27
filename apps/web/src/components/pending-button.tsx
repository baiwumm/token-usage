"use client";

// Button in the HeroUI pending pattern: isPending flips the render-prop flag
// and a small current-color Spinner rides in front of the label. Wrapping the
// Spinner+flag dance here keeps the six-plus submit buttons one-liners.

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
          {isPending ? <Spinner color="current" size="sm" /> : null}
          {children}
        </>
      )}
    </Button>
  );
}
