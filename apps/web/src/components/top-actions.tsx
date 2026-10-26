"use client";

// Top-right action cluster for the app shell: GitHub, language, accent color,
// light/dark/system mode, and the primary "pair device" action. Controls are
// round ghost buttons so the page title stays the loudest element in the bar.
import { buttonVariants } from "@heroui/styles";
import {
  Display,
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
  Tabs,
  parseColor,
} from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { NAV_COPY } from "@/lib/copy/nav";
import { useLocalePreference, type LocalePreference } from "@/lib/copy/locale";
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

function GitHubLink() {
  return (
    <Link
      aria-label="GitHub"
      className={buttonVariants({
        isIconOnly: true,
        size: "sm",
        variant: "tertiary",
      })}
      href="https://github.com/baiwumm/token-usage"
      rel="noopener noreferrer"
      target="_blank"
    >
      <LogoGithub className="text-muted size-4" />
    </Link>
  );
}

/** Globe icon button, opening a single-select menu of system / 中文 / English. */
export function LanguageDropdown() {
  const { locale, preference, setPreference } = useLocalePreference();
  const copy = NAV_COPY[locale];
  const currentLabel = locale === "zh" ? copy.languageZh : copy.languageEn;

  return (
    <Dropdown>
      <Button
        isIconOnly
        aria-label="LanguageDropdown"
        size="sm"
        variant="tertiary"
      >
        <LanguagesIcon className="text-muted size-4" />
      </Button>
      <Dropdown.Popover className="min-w-56 scrollbar-none">
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
              <Label>
                {copy.languageSystem}
                <span className="text-muted ml-1.5 text-xs">
                  {copy.languageCurrent}: {currentLabel}
                </span>
              </Label>
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
  );
}

const THEME_MODES = [
  { value: "light", icon: Sun, labelKey: "themeLight" },
  { value: "dark", icon: Moon, labelKey: "themeDark" },
  { value: "system", icon: Display, labelKey: "themeSystem" },
] as const;

/** HeroUI Tabs styled as a compact segmented pill (32px, matching icon buttons).
 * Default (top bar) hides below lg — the drawer owns the <lg theme toggle. */
export function ThemeModeToggle({
  alwaysVisible = false,
}: {
  alwaysVisible?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const { locale } = useLocalePreference();
  const copy = NAV_COPY[locale];
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div aria-hidden="true" className="h-8 w-23 shrink-0" />;
  }

  return (
    <Tabs
      className={`shrink-0 gap-0 ${alwaysVisible ? "flex" : "hidden lg:flex"}`}
      selectedKey={theme ?? "system"}
      onSelectionChange={(key) => setTheme(String(key))}
    >
      <Tabs.ListContainer className="bg-default/60 ring-border/60 rounded-full p-0.5 ring-1">
        <Tabs.List
          aria-label={copy.themeMode}
          className="w-auto min-w-0 gap-0.5 p-0"
        >
          {THEME_MODES.map(({ value, icon: Icon, labelKey }) => (
            <Tabs.Tab
              key={value}
              aria-label={copy[labelKey]}
              className="text-muted data-[selected=true]:text-foreground size-7 min-w-7 rounded-full px-0"
              id={value}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              <Tabs.Indicator className="bg-surface ring-border/70 rounded-full shadow-sm ring-1" />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
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
      <Popover>
        <Button
          isIconOnly
          aria-label={`${copy.appearance}: ${active.label}`}
          className="size-8 min-w-8"
          size="sm"
          variant="tertiary"
        >
          <BucketPaint className="text-muted size-4" />
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
