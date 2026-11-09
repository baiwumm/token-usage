// Single button cycling 跟随系统 → 浅色 → 深色 (same cycle as the web, operator
// call 2026-10-28). The icon and tooltip always show the *current* mode, never
// the mode a click would switch to.

import { Display, Moon, Sun } from "@gravity-ui/icons";
import { Button, Tooltip, Typography } from "@heroui/react";

import { nextTheme, type ThemeMode } from "@/lib/preferences";

const MODE_ICONS = {
  system: Display,
  light: Sun,
  dark: Moon,
} as const;

const MODE_LABELS: Record<ThemeMode, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

export function ThemeToggle({
  mode,
  onChange,
}: {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const Icon = MODE_ICONS[mode];
  const label = MODE_LABELS[mode];

  return (
    <Tooltip delay={0}>
      <Button
        isIconOnly
        aria-label={`主题：${label}`}
        className="text-muted hover:text-foreground size-8 min-w-8 shrink-0"
        size="sm"
        variant="ghost"
        onPress={() => onChange(nextTheme(mode))}
      >
        <Icon aria-hidden="true" className="size-4" />
      </Button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{`主题：${label}`}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}
