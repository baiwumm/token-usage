"use client";

// Top-right action cluster for the app shell: sidebar collapse, GitHub link,
// language dropdown, light/dark/system theme mode, and the theme color
// palette picker (HeroUI "primary" = the --accent variable, recolored via
// [data-theme-color] overrides in globals.css).

import { LogoGithub, Moon, Sun, Palette, Display } from "@gravity-ui/icons";
import { Button, Dropdown, Header } from "@heroui/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useLocale } from "@/lib/copy/locale";
import { THEME_COLOR_PALETTES, useThemeColor } from "@/lib/ui/theme-color";

function GitHubLink() {
  return (
    <Button isIconOnly aria-label="GitHub" size="sm" variant="ghost">
      <Link
        href="https://github.com/baiwumm/token-usage"
        rel="noopener noreferrer"
        target="_blank"
      >
        <LogoGithub className="size-4" />
      </Link>
    </Button>
  );
}

export function LanguageDropdown() {
  const [locale, setLocale] = useLocale();

  return (
    <Dropdown>
      <Button isIconOnly aria-label="Language" size="sm" variant="ghost">
        <span className="text-xs font-medium">
          {locale === "zh" ? "中" : "EN"}
        </span>
      </Button>
      <Dropdown.Popover className="min-w-40">
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
            <Header>Language / 语言</Header>
            <Dropdown.Item id="zh" textValue="简体中文">
              <Dropdown.ItemIndicator />
              简体中文
            </Dropdown.Item>
            <Dropdown.Item id="en" textValue="English">
              <Dropdown.ItemIndicator />
              English
            </Dropdown.Item>
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

const THEME_MODES = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Display, label: "System" },
] as const;

function ThemeModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div aria-hidden="true" className="h-8 w-[92px]" />;

  return (
    <div
      aria-label="Theme mode"
      className="bg-content2 flex items-center gap-0.5 rounded-full p-0.5"
      role="group"
    >
      {THEME_MODES.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          isIconOnly
          aria-label={label}
          size="sm"
          variant={theme === value ? "secondary" : "ghost"}
          onPress={() => setTheme(value)}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}

function ThemeColorPicker() {
  const [paletteId, setPaletteId] = useThemeColor();
  const index = Math.max(
    0,
    THEME_COLOR_PALETTES.findIndex((palette) => palette.id === paletteId),
  );
  const next = THEME_COLOR_PALETTES[(index + 1) % THEME_COLOR_PALETTES.length];

  return (
    <Button
      isIconOnly
      aria-label={`Theme color: ${THEME_COLOR_PALETTES[index].label} (next: ${next.label})`}
      size="sm"
      variant="ghost"
      onPress={() => setPaletteId(next.id)}
    >
      <Palette className="text-primary size-4" />
    </Button>
  );
}

export function TopActions() {
  return (
    <div className="flex items-center gap-1.5">
      <GitHubLink />
      <LanguageDropdown />
      <ThemeModeToggle />
      <ThemeColorPicker />
    </div>
  );
}
