// Single button cycling 跟随系统 → 浅色 → 深色 (same cycle as the web, operator
// call 2026-10-28). The icon and tooltip always show the *current* mode, never
// the mode a click would switch to. The system glyph mirrors the web header's
// Lucide "sun-moon" mark (0.4.1); the gravity-ui set has no equivalent.

import type { ReactNode } from "react";

import { Moon, Sun } from "@gravity-ui/icons";
import { Button, Tooltip, Typography } from "@heroui/react";

import { nextTheme, type ThemeMode } from "@/lib/preferences";

/** Lucide "sun-moon" (ISC license), stroke attributes mirror @gravity-ui/icons. */
function SunMoonIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 2v2" />
      <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" />
      <path d="M16 12a4 4 0 0 0-4-4" />
      <path d="m19 5-1.256 1.256" />
      <path d="M20 12h2" />
    </svg>
  );
}

const MODE_ICONS: Record<ThemeMode, ReactNode> = {
  system: <SunMoonIcon className="size-4" />,
  light: <Sun aria-hidden="true" className="size-4" />,
  dark: <Moon aria-hidden="true" className="size-4" />,
};

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
  const label = MODE_LABELS[mode];

  return (
    <Tooltip delay={0}>
      <Button
        isIconOnly
        aria-label={`主题：${label}`}
        className="text-muted hover:text-foreground size-8 min-w-8 shrink-0"
        size="sm"
        variant="tertiary"
        onPress={() => onChange(nextTheme(mode))}
      >
        {MODE_ICONS[mode]}
      </Button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{`主题：${label}`}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}
