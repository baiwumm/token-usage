"use client";

import type { DOMAttributes, ReactElement } from "react";

import {
  Calendar,
  ClockArrowRotateLeft,
  Display,
  Folder,
  Gear,
  ListUl,
  Medal,
} from "@gravity-ui/icons";
import { Chip, Focusable, Tooltip, Typography, cn } from "@heroui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_COPY, NAV_ITEMS } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

const NAV_ICONS = {
  dashboard: Display,
  sessions: ListUl,
  projects: Folder,
  syncRuns: ClockArrowRotateLeft,
  wrapped: Calendar,
  achievements: Medal,
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
      className={cn("flex flex-col gap-0.5", collapsed && "items-center")}
    >
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/" || pathname === "/dashboard"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.key];
        const label = copy[item.key];
        const showBadge = "badge" in item && item.badge;

        const itemClassName = cn(
          NAV_ITEM_BASE,
          collapsed ? "w-9 justify-center px-0" : "px-2.5",
          active
            ? "bg-surface text-surface-foreground font-medium"
            : "text-foreground/65 hover:bg-default hover:text-foreground",
        );
        const icon = (
          <Icon
            aria-hidden="true"
            className={cn(
              "size-4.5 shrink-0",
              active
                ? "text-foreground"
                : "text-muted group-hover:text-foreground",
            )}
          />
        );

        // Collapsed rail: the native title is replaced by a HeroUI Tooltip.
        // The tooltip root feeds hover/focus through React Aria's
        // FocusableContext, which a bare <a> never consumes, so the link is
        // wrapped in <Focusable> — it renders no DOM of its own and merges the
        // focusable props + ref into its child, keeping the Next.js Link
        // (client-side navigation, link semantics, native <a>). HeroUI's
        // Button/Trigger `render` escape hatch would trip React Aria's
        // "Expected <button>/<div>, got <a>" element check instead. The focus
        // ring replicates the Button variant the pill used to carry.
        if (collapsed) {
          return (
            <Tooltip key={item.href} delay={0}>
              <Focusable>
                {/* Focusable's children prop only types intrinsic elements,
                    but cloneElement just needs a child that forwards its ref —
                    Next.js Link does, hence the cast. */}
                {
                  (
                    <Link
                      aria-current={active ? "page" : undefined}
                      aria-label={label}
                      className={cn(
                        itemClassName,
                        "focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline",
                      )}
                      href={item.href}
                      onClick={onNavigate}
                    >
                      {icon}
                    </Link>
                  ) as unknown as ReactElement<
                    DOMAttributes<HTMLElement>,
                    string
                  >
                }
              </Focusable>
              <Tooltip.Content showArrow placement="right">
                <Tooltip.Arrow />
                <Typography type="body-xs">{label}</Typography>
              </Tooltip.Content>
            </Tooltip>
          );
        }

        return (
          <Link
            key={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClassName}
            href={item.href}
            onClick={onNavigate}
          >
            {icon}
            <span className="truncate">{label}</span>
            {showBadge ? (
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
