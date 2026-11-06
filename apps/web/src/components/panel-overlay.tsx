// Blur overlay shown while a panel refetches data in place — the previous
// content stays visible underneath, so the layout never collapses. Shared by
// the dashboard cards and the badge preview (docs/ui-spec.md 设置 · 公开徽章).

import { Spinner, cn } from "@heroui/react";

export function PanelOverlay({
  active,
  className = "rounded-2xl",
}: {
  active: boolean;
  className?: string;
}) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        // Pure visual layer: it must never swallow clicks on the card's
        // controls while a refresh is in flight (aria-hidden only hides it
        // from the a11y tree, it does not block pointer events).
        "bg-surface/60 pointer-events-none absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[2px]",
        className,
      )}
    >
      <Spinner size="sm" />
    </div>
  );
}
