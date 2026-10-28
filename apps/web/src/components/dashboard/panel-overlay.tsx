// Blur overlay shown while a refresh refetches data in place — the previous
// content stays visible underneath, so the layout never collapses.

import { Spinner } from "@heroui/react";

export function PanelOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="bg-surface/60 absolute inset-0 z-10 flex items-center justify-center rounded-2xl backdrop-blur-[2px]"
    >
      <Spinner size="sm" />
    </div>
  );
}
