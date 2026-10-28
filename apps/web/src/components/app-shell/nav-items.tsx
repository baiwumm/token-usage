"use client";

import {
  Calendar,
  ClockArrowRotateLeft,
  Display,
  Gear,
  ListUl,
  Tachometer,
} from "@gravity-ui/icons";
import { Chip } from "@heroui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_COPY, NAV_ITEMS } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

const NAV_ICONS = {
  dashboard: Display,
  sessions: ListUl,
  syncRuns: ClockArrowRotateLeft,
  wrapped: Calendar,
  status: Tachometer,
  settings: Gear,
} as const;

const NAV_ITEM_BASE =
  "group flex h-9 items-center gap-2.5 rounded-3xl text-sm transition-colors";

/** Pill navigation shared by the desktop sidebar and the mobile drawer. */
export function NavItems({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];

  return (
    <nav
      aria-label={copy.menu}
      className={`flex flex-col gap-0.5 ${collapsed ? "items-center" : ""}`}
    >
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/" || pathname === "/dashboard"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.key];
        const label = copy[item.key];
        const showBadge = "badge" in item && item.badge;

        return (
          <Link
            key={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? label : undefined}
            className={`${NAV_ITEM_BASE} ${
              collapsed ? "w-9 justify-center" : "px-2.5"
            } ${
              active
                ? "bg-surface text-surface-foreground font-medium"
                : "text-foreground/65 hover:bg-default hover:text-foreground"
            }`}
            href={item.href}
            title={collapsed ? label : undefined}
            onClick={onNavigate}
          >
            <Icon
              aria-hidden="true"
              className={`size-4.5 shrink-0 ${
                active
                  ? "text-foreground"
                  : "text-muted group-hover:text-foreground"
              }`}
            />
            {collapsed ? null : <span className="truncate">{label}</span>}
            {!collapsed && showBadge ? (
              <Chip
                className="ml-auto h-5 shrink-0 px-1.5 text-[10px]"
                color="success"
                size="sm"
                variant="soft"
              >
                {copy.newBadge}
              </Chip>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
