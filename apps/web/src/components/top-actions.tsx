"use client";

// Top-right action cluster for the app shell: GitHub, language, accent color,
// light/dark/system mode, and the primary "pair device" action. Controls are
// round ghost buttons so the page title stays the loudest element in the bar.
import {
  LogoGithub,
  Moon,
  Plus,
  Shuffle,
  Sun,
  BucketPaint,
} from "@gravity-ui/icons";
import {
  Badge,
  Button,
  ColorSwatchPicker,
  Dropdown,
  Header,
  Label,
  Popover,
  Tooltip,
  Typography,
  parseColor,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { NAV_COPY } from "@/lib/copy/nav";
import { useLocalePreference, type LocalePreference } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { THEME_COLOR_PALETTES, useThemeColor } from "@/lib/ui/theme-color";

// Lucide "languages" glyph (ISC license, operator pick) — the gravity-ui set
// has no equivalent. Stroke attributes mirror @gravity-ui/icons rendering.
function LanguagesIcon({ className }: { className?: string }) {
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
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

// Lucide "sun-moon" glyph (ISC license, operator pick) — the gravity-ui set
// has no equivalent. Stroke attributes mirror @gravity-ui/icons rendering.
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

/** Small arrowed hint shared by the top-bar controls. */
function ControlTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip delay={0}>
      {children}
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{label}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}

const GITHUB_URL = "https://github.com/baiwumm/token-usage";

/**
 * GitHub icon button. A RAC Link cannot host a tooltip (it does not consume
 * TooltipTrigger's focusable context), so this is a Button that opens the repo
 * in a new tab instead.
 */
function GitHubLink() {
  return (
    <ControlTooltip label="GitHub">
      <Button
        isIconOnly
        aria-label="GitHub"
        size="sm"
        variant="tertiary"
        onPress={() => window.open(GITHUB_URL, "_blank", "noopener,noreferrer")}
      >
        <LogoGithub className="size-4" />
      </Button>
    </ControlTooltip>
  );
}

/** Globe icon button, opening a single-select menu of system / 中文 / English. */
export function LanguageDropdown() {
  const { locale, preference, setPreference } = useLocalePreference();
  const copy = NAV_COPY[locale];

  return (
    <ControlTooltip label={copy.language}>
      <Dropdown>
        <Button
          isIconOnly
          aria-label={copy.language}
          size="sm"
          variant="tertiary"
        >
          <LanguagesIcon className="size-4" />
        </Button>
        <Dropdown.Popover>
          <Popover.Arrow />
          <Dropdown.Menu
            selectedKeys={[preference]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const key = [...keys][0];

              if (typeof key === "string") {
                setPreference(key as LocalePreference);
              }
            }}
          >
            <Dropdown.Section>
              <Header>{copy.language}</Header>
              <Dropdown.Item id="system" textValue={copy.languageSystem}>
                <Dropdown.ItemIndicator />
                <Label>{copy.languageSystem}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="zh" textValue={copy.languageZh}>
                <Dropdown.ItemIndicator />
                <Label>{copy.languageZh}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="en" textValue={copy.languageEn}>
                <Dropdown.ItemIndicator />
                <Label>{copy.languageEn}</Label>
              </Dropdown.Item>
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </ControlTooltip>
  );
}

const THEME_CYCLE = {
  system: "light",
  light: "dark",
  dark: "system",
} as const;

const THEME_MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: SunMoonIcon,
} as const;

const THEME_MODE_LABELS = {
  light: "themeLight",
  dark: "themeDark",
  system: "themeSystem",
} as const;

/**
 * Single button that cycles system → light → dark (operator call 2026-10-28,
 * mirroring the desktop app): the icon and tooltip show the active mode. Shown
 * at every breakpoint — the mobile drawer no longer carries its own toggle.
 */
export function ThemeModeToggle() {
  const { theme, setTheme } = useTheme();
  const { locale } = useLocalePreference();
  const copy = NAV_COPY[locale];
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div aria-hidden="true" className="size-8 shrink-0" />;
  }

  const mode =
    theme === "light" || theme === "dark" ? theme : ("system" as const);
  const Icon = THEME_MODE_ICONS[mode];
  const label = copy[THEME_MODE_LABELS[mode]];

  return (
    <ControlTooltip
      label={formatMessage(copy.themeCurrent, locale, { mode: label })}
    >
      <Button
        isIconOnly
        aria-label={`${copy.themeMode}: ${label}`}
        className="size-8 min-w-8 shrink-0"
        size="sm"
        variant="tertiary"
        onPress={() => setTheme(THEME_CYCLE[mode])}
      >
        <Icon className="size-4" />
      </Button>
    </ControlTooltip>
  );
}

/**
 * Accent picker: a popover with the ColorSwatchPicker grid plus a shuffle
 * button, following better-admin's theme-color-picker. Swatch hexes map back
 * to palette ids; "default" clears the data attribute.
 */
export function ThemeColorPicker() {
  const { locale } = useLocalePreference();
  const copy = NAV_COPY[locale];
  const [paletteId, setPaletteId] = useThemeColor();
  const active =
    THEME_COLOR_PALETTES.find((palette) => palette.id === paletteId) ??
    THEME_COLOR_PALETTES[0];

  const handleColorChange = useCallback(
    (color: ReturnType<typeof parseColor>) => {
      const hex = color.toString("hex").toLowerCase();
      const next = THEME_COLOR_PALETTES.find(
        (palette) => palette.hex.toLowerCase() === hex,
      );

      if (next) setPaletteId(next.id);
    },
    [setPaletteId],
  );

  const shuffle = useCallback(() => {
    const candidates = THEME_COLOR_PALETTES.filter(
      (palette) => palette.id !== paletteId,
    );

    if (candidates.length === 0) return;

    const random = candidates[Math.floor(Math.random() * candidates.length)];

    setPaletteId(random.id);
  }, [paletteId, setPaletteId]);

  return (
    <Badge.Anchor>
      <ControlTooltip label={copy.appearance}>
        <Popover>
          <Button
            isIconOnly
            aria-label={`${copy.appearance}: ${active.label}`}
            className="size-8 min-w-8"
            size="sm"
            variant="tertiary"
          >
            <BucketPaint className="size-4" />
          </Button>
          <Popover.Content className="w-72">
            <Popover.Arrow />
            <Popover.Dialog className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <Popover.Heading>{copy.appearance}</Popover.Heading>
                <Button
                  isIconOnly
                  aria-label={copy.randomColor}
                  className="text-muted"
                  size="sm"
                  variant="ghost"
                  onPress={shuffle}
                >
                  <Shuffle className="size-4" />
                </Button>
              </div>
              <ColorSwatchPicker
                aria-label={copy.appearance}
                value={parseColor(active.hex)}
                onChange={handleColorChange}
              >
                {THEME_COLOR_PALETTES.map((palette) => (
                  <ColorSwatchPicker.Item key={palette.id} color={palette.hex}>
                    <ColorSwatchPicker.Swatch />
                    <ColorSwatchPicker.Indicator />
                  </ColorSwatchPicker.Item>
                ))}
              </ColorSwatchPicker>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </ControlTooltip>
      {/* Accent dot: the primary+accent badge tracks the live --accent token. */}
      <Badge
        aria-hidden="true"
        className="size-3 rounded-full min-h-3! min-w-3!"
        color="accent"
        placement="bottom-right"
        size="sm"
        variant="primary"
      />
    </Badge.Anchor>
  );
}

export function TopActions() {
  const router = useRouter();
  const { locale } = useLocalePreference();
  const copy = NAV_COPY[locale];

  return (
    <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
      <GitHubLink />
      <LanguageDropdown />
      <ThemeColorPicker />
      <ThemeModeToggle />
      <Button
        aria-label={copy.pairDevice}
        className="ml-0.5 rounded-full px-3 shadow-sm md:px-4"
        size="sm"
        variant="primary"
        onPress={() => router.push("/device")}
      >
        <Plus className="size-4" />
        <span className="hidden sm:inline">{copy.pairDevice}</span>
      </Button>
    </div>
  );
}
