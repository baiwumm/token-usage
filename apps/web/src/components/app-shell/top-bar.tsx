import type { NavCopy } from "@/lib/copy/nav";

import { Bars, LayoutSideContent } from "@gravity-ui/icons";
import { Button, Typography } from "@heroui/react";

import { TopActions } from "@/components/top-actions";

/** Sticky top bar: nav toggle LEFT, contextual page title, controls RIGHT. */
export function TopBar({
  collapsed,
  copy,
  title,
  onOpenMenu,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  copy: NavCopy;
  title: string;
  onOpenMenu: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 px-3 backdrop-blur-xl md:px-6">
      <Button
        isIconOnly
        aria-label={copy.menu}
        className="text-muted hover:text-foreground size-8 min-w-8 shrink-0 rounded-full lg:hidden"
        size="sm"
        variant="ghost"
        onPress={onOpenMenu}
      >
        <Bars className="size-4.5" />
      </Button>
      <Button
        isIconOnly
        aria-label={copy.toggleSidebar}
        aria-pressed={collapsed}
        className="text-muted hover:text-foreground hidden size-8 min-w-8 shrink-0 rounded-full lg:inline-flex"
        size="sm"
        variant="ghost"
        onPress={onToggleCollapsed}
      >
        <LayoutSideContent className="size-4.5" />
      </Button>
      <Typography
        truncate
        className="min-w-0 flex-1 text-lg sm:text-xl"
        type="h1"
        weight="bold"
      >
        {title}
      </Typography>
      <TopActions />
    </header>
  );
}
