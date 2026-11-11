import type { ThemeMode, UsagePeriod } from "@/lib/preferences";
import type { ReactNode } from "react";

import {
  ArrowRotateRight,
  CirclePause,
  CirclePlay,
  Gear,
  ListCheck,
  LogoGithub,
  Stethoscope,
} from "@gravity-ui/icons";
import { Button, Spinner, Tooltip, Typography } from "@heroui/react";

import { PeriodFilter } from "@/components/monitor/period-filter";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Window header: the period filter (今日 / 7D / 30D / 总计) leads, the brand
 * lockup moved out (operator request 2026-11-11 — the window title already
 * says Token Usage), and the right group is tertiary icon buttons: the four
 * CLI actions (<640px they hide; the sync card keeps the buttons as the
 * narrow fallback), then repo / theme / settings. The period filter and CLI
 * actions are optional — the first-run wizard renders this header without
 * them (nothing to filter, CLI mid-setup).
 */
export function MonitorHeader({
  paused,
  period,
  theme,
  cliAvailable = false,
  runningCommand = null,
  onPeriodChange,
  onChangeTheme,
  onOpenRepo,
  onOpenSettings,
  onRun,
}: {
  paused: boolean;
  period?: UsagePeriod;
  theme: ThemeMode;
  cliAvailable?: boolean;
  runningCommand?: string | null;
  onPeriodChange?: (period: UsagePeriod) => void;
  onChangeTheme: (mode: ThemeMode) => void;
  onOpenRepo: () => void;
  onOpenSettings: () => void;
  onRun?: (command: string, args?: string[]) => void;
}) {
  const busy = runningCommand !== null;
  const showControls = period !== undefined && onPeriodChange && onRun;
  const actions: Array<{
    id: string;
    label: string;
    icon: ReactNode;
    pending: boolean;
    onPress: () => void;
  }> = [
    {
      id: "sync",
      label: "立即同步",
      icon: <ArrowRotateRight aria-hidden="true" className="size-4" />,
      pending: runningCommand === "sync",
      onPress: () => onRun?.("sync", ["--auto"]),
    },
    {
      id: "pause",
      label: paused ? "恢复采集" : "暂停采集",
      icon: paused ? (
        <CirclePlay aria-hidden="true" className="size-4" />
      ) : (
        <CirclePause aria-hidden="true" className="size-4" />
      ),
      pending: runningCommand === "pause" || runningCommand === "resume",
      onPress: () => onRun?.(paused ? "resume" : "pause"),
    },
    {
      id: "doctor",
      label: "Doctor",
      icon: <Stethoscope aria-hidden="true" className="size-4" />,
      pending: runningCommand === "doctor",
      onPress: () => onRun?.("doctor"),
    },
    {
      id: "reconcile",
      label: "对账 7 天",
      icon: <ListCheck aria-hidden="true" className="size-4" />,
      pending: runningCommand === "reconcile",
      onPress: () => onRun?.("reconcile", ["--days", "7"]),
    },
  ];

  return (
    <div className="flex items-center justify-between gap-3">
      {showControls ? (
        <PeriodFilter period={period} onChange={onPeriodChange} />
      ) : null}
      <div className="flex shrink-0 items-center gap-1">
        {paused ? (
          <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted tabular-nums">
            采集已暂停
          </span>
        ) : null}
        {showControls
          ? actions.map((action) => (
              <Tooltip key={action.id} delay={0}>
                <Button
                  isIconOnly
                  aria-label={action.label}
                  className="hidden size-8 min-w-8 shrink-0 text-muted hover:text-foreground sm:inline-flex"
                  isDisabled={busy || !cliAvailable}
                  size="sm"
                  variant="tertiary"
                  onPress={action.onPress}
                >
                  {action.pending ? (
                    <Spinner aria-hidden="true" size="sm" />
                  ) : (
                    action.icon
                  )}
                </Button>
                <Tooltip.Content showArrow placement="bottom">
                  <Tooltip.Arrow />
                  <Typography type="body-xs">{action.label}</Typography>
                </Tooltip.Content>
              </Tooltip>
            ))
          : null}
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label="GitHub 仓库"
            className="size-8 min-w-8 shrink-0 text-muted hover:text-foreground"
            size="sm"
            variant="tertiary"
            onPress={onOpenRepo}
          >
            <LogoGithub aria-hidden="true" className="size-4" />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">GitHub 仓库</Typography>
          </Tooltip.Content>
        </Tooltip>
        <ThemeToggle mode={theme} onChange={onChangeTheme} />
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label="设置"
            className="size-8 min-w-8 shrink-0 text-muted hover:text-foreground"
            size="sm"
            variant="tertiary"
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
