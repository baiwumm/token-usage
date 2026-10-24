"use client";

// Top-right action cluster for the app shell: GitHub, language, accent color,
// light/dark/system mode, and the primary "pair device" action. Controls are
// round ghost buttons so the page title stays the loudest element in the bar.

import {
  Display,
  Globe,
  LogoGithub,
  Moon,
  Palette,
  Plus,
  Shuffle,
  Sun,
} from "@gravity-ui/icons";
import {
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
import { useLocale } from "@/lib/copy/locale";
import { THEME_COLOR_PALETTES, useThemeColor } from "@/lib/ui/theme-color";

const GHOST_ICON =
  "text-muted hover:bg-default hover:text-foreground size-8 shrink-0 rounded-full transition-colors";

function GitHubLink() {
  return (
    <Link
      aria-label="GitHub"
      className={`${GHOST_ICON} hidden items-center justify-center md:inline-flex`}
      href="https://github.com/baiwumm/token-usage"
      rel="noopener noreferrer"
      target="_blank"
    >
      <LogoGithub className="size-4" />
    </Link>
  );
}

/** Globe icon button, opening a single-select menu of 简体中文 / English. */
export function LanguageDropdown() {
  const [locale, setLocale] = useLocale();
  const copy = NAV_COPY[locale];

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={copy.language}
        className={`${GHOST_ICON} inline-flex items-center justify-center`}
      >
        <Globe className="size-4" />
      </Dropdown.Trigger>
      <Dropdown.Popover className="min-w-44">
        <Dropdown.Menu
          selectedKeys={[locale]}
          selectionMode="single"
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const key = [...keys][0];

            if (typeof key === "string") setLocale(key as "zh" | "en");
          }}
        >
          <Dropdown.Section>
            <Header>{copy.language}</Header>
            <Dropdown.Item id="zh" textValue="简体中文">
              <Dropdown.ItemIndicator />
              <Label>简体中文</Label>
            </Dropdown.Item>
            <Dropdown.Item id="en" textValue="English">
              <Dropdown.ItemIndicator />
              <Label>English</Label>
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

/** HeroUI Tabs styled as a compact segmented pill (32px, matching icon buttons). */
export function ThemeModeToggle({
  alwaysVisible = false,
}: {
  alwaysVisible?: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div aria-hidden="true" className="h-8 w-[92px] shrink-0" />;
  }

  return (
    <Tabs
      className={`shrink-0 gap-0 ${alwaysVisible ? "flex" : "hidden md:flex"}`}
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
export function ThemeColorPicker({
  alwaysVisible = false,
}: {
  alwaysVisible?: boolean;
}) {
  const [locale] = useLocale();
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
    <Popover>
      <Popover.Trigger
        aria-label={`${copy.appearance}: ${active.label}`}
        className={`${GHOST_ICON} items-center justify-center ${
          alwaysVisible ? "inline-flex" : "hidden md:inline-flex"
        }`}
      >
        <span className="relative flex items-center justify-center">
          <Palette className="text-muted size-4" />
          <span
            aria-hidden="true"
            className="ring-background absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2"
            style={{ backgroundColor: active.hex }}
          />
        </span>
      </Popover.Trigger>
      <Popover.Content className="w-64">
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
  );
}

export function TopActions() {
  const router = useRouter();
  const [locale] = useLocale();
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
