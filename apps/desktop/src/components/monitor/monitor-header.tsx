import type { ThemeMode } from "@/lib/preferences";

import { Gear } from "@gravity-ui/icons";
import { Button, Tooltip, Typography } from "@heroui/react";

import { ThemeToggle } from "@/components/theme-toggle";

/** Window header: brand lockup, pause chip, theme cycle and settings entry. */
export function MonitorHeader({
  paused,
  theme,
  onChangeTheme,
  onOpenSettings,
}: {
  paused: boolean;
  theme: ThemeMode;
  onChangeTheme: (mode: ThemeMode) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-8 shrink-0 select-none">
          <img
            alt=""
            className="col-start-1 row-start-1 size-8 rounded-lg dark:hidden"
            height={32}
            src="/logo.svg"
            width={32}
          />
          <img
            alt=""
            className="col-start-1 row-start-1 hidden size-8 rounded-lg dark:block"
            height={32}
            src="/logo-dark.svg"
            width={32}
          />
        </span>
        <Typography type="h6" weight="semibold">
          Token Usage
        </Typography>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {paused ? (
          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted tabular-nums">
            采集已暂停
          </span>
        ) : null}
        <ThemeToggle mode={theme} onChange={onChangeTheme} />
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label="设置"
            className="text-muted hover:text-foreground size-8 min-w-8 shrink-0"
            size="sm"
            variant="ghost"
            onPress={onOpenSettings}
          >
            <Gear aria-hidden="true" className="size-4" />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">设置</Typography>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
