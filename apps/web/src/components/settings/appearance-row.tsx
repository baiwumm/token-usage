// Shared appearance row (docs/ui-spec.md 设置 · 偏好): label + optional
// description on the left, the control on the right. Every appearance card uses
// the same divider-separated row, so the layout lives in one place.

import { Description, Typography } from "@heroui/react";

export function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="flex min-w-0 flex-col gap-1 md:max-w-sm">
        <Typography type="body-sm" weight="medium">
          {label}
        </Typography>
        {description ? (
          <Description className="text-muted text-xs">
            {description}
          </Description>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
        {children}
      </div>
    </div>
  );
}
