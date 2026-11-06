"use client";

// Shared manual-refresh affordance (docs/ui-spec.md:387-389). The spin + the
// last-updated tooltip were duplicated across the dashboard, Sessions, Sync
// runs, Achievements and Projects pages. Tooltip copy arrives as an ICU
// template and is resolved here with the caller's locale so all five pages
// stay in sync.

import type { Locale } from "@/lib/copy/locale";

import { ArrowsRotateRight } from "@gravity-ui/icons";
import { Button, Tooltip, Typography, cn } from "@heroui/react";

import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export function RefreshButton({
  lastUpdatedAt,
  lastUpdatedNone,
  lastUpdatedTemplate,
  locale,
  onPress,
  refreshLabel,
  refreshing,
}: {
  /** Timestamp (ms) of the last successful load, null before the first one. */
  lastUpdatedAt: number | null;
  /** Copy shown when no data has loaded yet. */
  lastUpdatedNone: string;
  /** ICU template for the tooltip, e.g. "Updated {time}". */
  lastUpdatedTemplate: string;
  /** Locale used to format the tooltip template. */
  locale: Locale;
  onPress: () => void;
  /** Accessible label for the icon-only button. */
  refreshLabel: string;
  refreshing: boolean;
}) {
  const { formatDateTime } = useFormat();
  const tooltipText =
    lastUpdatedAt == null
      ? lastUpdatedNone
      : formatMessage(lastUpdatedTemplate, locale, {
          time: formatDateTime(new Date(lastUpdatedAt)),
        });

  return (
    <Tooltip delay={0}>
      <Button
        isIconOnly
        aria-busy={refreshing}
        aria-label={refreshLabel}
        isDisabled={refreshing}
        size="sm"
        variant="tertiary"
        onPress={onPress}
      >
        <ArrowsRotateRight
          aria-hidden="true"
          className={cn(
            "size-4",
            refreshing && "animate-spin motion-reduce:animate-none",
          )}
        />
      </Button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{tooltipText}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}
