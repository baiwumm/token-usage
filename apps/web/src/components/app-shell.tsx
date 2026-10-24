"use client";

// App shell for the authenticated pages: fixed sidebar on lg+, drawer below
// (docs/ui-spec.md 响应式). Active state follows usePathname; the CLI API and
// /login stay outside this shell.

import { Calendar, Display, Gear, Tachometer } from "@gravity-ui/icons";
import { Button, Drawer } from "@heroui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { NAV_COPY, NAV_ITEMS } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

const NAV_ICONS = {
  dashboard: Display,
  settings: Gear,
  wrapped: Calendar,
  status: Tachometer,
} as const;

function LocaleSwitcher() {
  const [locale, setLocale] = useLocale();

  return (
    <Button
      aria-label="Switch language"
      size="sm"
      variant="ghost"
      onPress={() => {
        setLocale(locale === "zh" ? "en" : "zh");
      }}
    >
      {locale === "zh" ? "EN" : "中文"}
    </Button>
  );
}

function NavLinkList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];

  return (
    <nav aria-label={copy.menu} className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.key];

        return (
          <Link
            key={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-medium flex items-center gap-2.5 px-3 py-2 text-sm ${
              active
                ? "bg-content2 text-foreground font-medium"
                : "text-foreground/60 hover:bg-content2/60 hover:text-foreground"
            }`}
            href={item.href}
            onClick={onNavigate}
          >
            <Icon aria-hidden="true" className="size-4" />
            {copy[item.key]}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  const [locale] = useLocale();

  return (
    <div className="flex flex-col gap-0.5 px-3">
      <span className="font-semibold">Token Usage</span>
      <span className="text-foreground/40 text-xs">
        {NAV_COPY[locale].menu}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar (lg+). */}
      <aside className="border-default-100 hidden w-56 shrink-0 flex-col gap-6 border-r px-3 py-6 lg:flex">
        <Brand />
        <NavLinkList />
        <div className="mt-auto px-3">
          <LocaleSwitcher />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with the drawer trigger (<lg). */}
        <header className="border-default-100 flex items-center gap-3 border-b px-4 py-3 lg:hidden">
          <Button
            isIconOnly
            aria-label="Menu"
            size="sm"
            variant="ghost"
            onPress={() => setMenuOpen(true)}
          >
            <svg
              aria-hidden="true"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </Button>
          <span className="font-semibold">Token Usage</span>
        </header>

        {children}
      </div>

      <Drawer>
        <Drawer.Backdrop
          isOpen={menuOpen}
          onOpenChange={(open) => setMenuOpen(open)}
        >
          <Drawer.Content placement="left">
            <Drawer.Dialog className="w-64">
              <Drawer.Header>
                <Drawer.Heading>Token Usage</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body>
                <NavLinkList onNavigate={() => setMenuOpen(false)} />
                <div className="mt-4">
                  <LocaleSwitcher />
                </div>
              </Drawer.Body>
              <Drawer.Footer>
                <Button size="sm" slot="close" variant="secondary">
                  close
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </div>
  );
}
