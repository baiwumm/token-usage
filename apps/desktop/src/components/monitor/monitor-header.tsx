import type { ThemeMode, UsagePeriod } from "@/lib/preferences";
import type { ReactNode } from "react";

import {
  ArrowRotateRight,
  ChartColumn,
  CirclePause,
  CirclePlay,
  Display,
  Gear,
  Globe,
  ListCheck,
  ListUl,
  LogoGithub,
  NodesRight,
  Stethoscope,
} from "@gravity-ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { Button, Spinner, Tooltip, Typography } from "@heroui/react";

import { PeriodFilter } from "@/components/monitor/period-filter";
import { ThemeToggle } from "@/components/theme-toggle";
import { LANDING_URL, webUrl } from "@/lib/links";

/** The two top-level views the header toggles between (desktop-plan §12.13). */
export type MonitorView = "monitor" | "sessions";

function openInBrowser(url: string): void {
  void invoke("open_in_browser", { url }).catch(() => undefined);
}

/**
 * Window header: the period filter (今日 / 7D / 30D / 总计) leads, the right
 * group is tertiary icon buttons — the four CLI actions and the share button
 * (<640px they hide; the sync card keeps the CLI buttons as the narrow
 * fallback), then the sessions view toggle (D11), landing / dashboard (0.4.1),
 * repo / theme / settings. The period filter and CLI actions are optional —
 * the first-run wizard renders this header without them, and an unpaired
 * machine has no dashboard deep link to offer.
 */
export function MonitorHeader({
  paused,
  period,
  theme,
  view = "monitor",
  cliAvailable = false,
  runningCommand = null,
  shareAvailable = false,
  dashboardUrl = null,
  onPeriodChange,
  onChangeTheme,
  onOpenRepo,
  onOpenSettings,
  onRun,
  onOpenShare,
  onToggleView,
}: {
  paused: boolean;
  period?: UsagePeriod;
  theme: ThemeMode;
  view?: MonitorView;
  cliAvailable?: boolean;
  runningCommand?: string | null;
  /** No data in the active window → the share card has nothing to draw. */
  shareAvailable?: boolean;
  /** Paired instance base URL; null hides the dashboard button. */
  dashboardUrl?: string | null;
  onPeriodChange?: (period: UsagePeriod) => void;
  onChangeTheme: (mode: ThemeMode) => void;
  onOpenRepo: () => void;
  onOpenSettings: () => void;
  onRun?: (command: string, args?: string[]) => void;
  onOpenShare?: () => void;
  onToggleView?: (view: MonitorView) => void;
}) {
  const busy = runningCommand !== null;
  const showControls = period !== undefined && onPeriodChange && onRun;
  const dashboardLink = webUrl(dashboardUrl, "dashboard");
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      {showControls && view === "monitor" ? (
        <PeriodFilter period={period} onChange={onPeriodChange} />
      ) : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
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
        {onOpenShare ? (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              aria-label="分享卡片"
              className="hidden size-8 min-w-8 shrink-0 text-muted hover:text-foreground sm:inline-flex"
              isDisabled={!shareAvailable}
              size="sm"
              variant="tertiary"
              onPress={onOpenShare}
            >
              <NodesRight aria-hidden="true" className="size-4" />
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              <Typography type="body-xs">分享卡片</Typography>
            </Tooltip.Content>
          </Tooltip>
        ) : null}
        {onToggleView ? (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              aria-label={view === "monitor" ? "会话" : "用量监控"}
              className="size-8 min-w-8 shrink-0 text-muted hover:text-foreground"
              size="sm"
              variant="tertiary"
              onPress={() =>
                onToggleView(view === "monitor" ? "sessions" : "monitor")
              }
            >
              {view === "monitor" ? (
                <ListUl aria-hidden="true" className="size-4" />
              ) : (
                <ChartColumn aria-hidden="true" className="size-4" />
              )}
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              <Typography type="body-xs">
                {view === "monitor" ? "会话" : "用量监控"}
              </Typography>
            </Tooltip.Content>
          </Tooltip>
        ) : null}
        {/* Landing is always reachable; the dashboard needs a paired instance. */}
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label="落地页"
            className="size-8 min-w-8 shrink-0 text-muted hover:text-foreground"
            size="sm"
            variant="tertiary"
            onPress={() => openInBrowser(LANDING_URL)}
          >
            <Globe aria-hidden="true" className="size-4" />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">落地页</Typography>
          </Tooltip.Content>
        </Tooltip>
        {dashboardLink !== null ? (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              aria-label="仪表盘"
              className="size-8 min-w-8 shrink-0 text-muted hover:text-foreground"
              size="sm"
              variant="tertiary"
              onPress={() => openInBrowser(dashboardLink)}
            >
              <Display aria-hidden="true" className="size-4" />
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              <Typography type="body-xs">仪表盘</Typography>
            </Tooltip.Content>
          </Tooltip>
        ) : null}
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
