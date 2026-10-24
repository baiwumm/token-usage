"use client";

// App shell for the authenticated pages (2026-10-24 rework): fixed sidebar
// with user block, collapsible (icons-only), pill-shaped active states,
// Settings grouped at the bottom, sign-out with an AlertDialog confirm, and
// a top actions row (collapse / GitHub / language / theme mode / theme
// color). Drawer below lg. The CLI API and /login stay outside.

import { Calendar, Display, Gear, Tachometer } from "@gravity-ui/icons";
import { AlertDialog, Avatar, Button, Drawer, Typography } from "@heroui/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useProfile } from "@/lib/auth/profile";
import { authBrowserClient } from "@/lib/auth/browser";
import { NAV_COPY, NAV_ITEMS } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";
import { LanguageDropdown, TopActions } from "@/components/top-actions";

const NAV_ICONS = {
  dashboard: Display,
  wrapped: Calendar,
  status: Tachometer,
  settings: Gear,
} as const;

const COLLAPSE_KEY = "token-usage.sidebar-collapsed";

function initialsFor(name: string, email: string | null): string {
  if (name.trim()) return name.trim().charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();

  return "?";
}

function NavItems({
  collapsed,
  group,
  onNavigate,
}: {
  collapsed: boolean;
  group: "main" | "settings";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const items =
    group === "main"
      ? NAV_ITEMS.filter((item) => item.key !== "settings")
      : NAV_ITEMS.filter((item) => item.key === "settings");

  return (
    <nav aria-label={copy.menu} className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.key];
        const label = copy[item.key];

        return (
          <Link
            key={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 text-sm ${
              collapsed ? "justify-center px-0 py-2" : "rounded-full px-3 py-2"
            } ${
              active
                ? "bg-content2 text-foreground font-medium"
                : "text-foreground/60 hover:bg-content2/60 hover:text-foreground"
            }`}
            href={item.href}
            title={collapsed ? label : undefined}
            onClick={onNavigate}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {collapsed ? null : <span className="truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { profile } = useProfile();
  const name = profile?.displayName || "";
  const email = profile?.email ?? null;

  if (collapsed) {
    return (
      <Link
        aria-label="Profile"
        className="flex justify-center px-0 py-1"
        href="/settings"
        title={email ?? undefined}
      >
        <Avatar className="size-9">
          {profile?.avatarUrl ? (
            <Avatar.Image
              alt={name || email || "avatar"}
              src={profile.avatarUrl}
            />
          ) : null}
          <Avatar.Fallback>{initialsFor(name, email)}</Avatar.Fallback>
        </Avatar>
      </Link>
    );
  }

  return (
    <Link
      className="hover:bg-content2/60 flex items-center gap-2.5 rounded-full px-3 py-2"
      href="/settings"
    >
      <Avatar className="size-9 shrink-0">
        {profile?.avatarUrl ? (
          <Avatar.Image
            alt={name || email || "avatar"}
            src={profile.avatarUrl}
          />
        ) : null}
        <Avatar.Fallback>{initialsFor(name, email)}</Avatar.Fallback>
      </Avatar>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          {name || email || "…"}
        </span>
        {name && email ? (
          <span className="text-foreground/50 truncate text-xs">{email}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [locale] = useLocale();
  const navCopy = NAV_COPY[locale];
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage unavailable — default expanded
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;

      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // best effort
      }

      return next;
    });
  }, []);

  async function signOut() {
    setSigningOut(true);

    try {
      await authBrowserClient()?.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
      setSignOutOpen(false);
    }
  }

  const sidebar = (mobile: boolean) => {
    const collapsedNow = !mobile && collapsed;

    return (
      <div className="flex h-full flex-col gap-4 px-3 py-5">
        <div className={collapsedNow ? "flex justify-center" : "px-2"}>
          <Typography weight="semibold">
            {collapsedNow ? "TU" : "Token Usage"}
          </Typography>
        </div>
        <UserBlock collapsed={collapsedNow} />
        <NavItems collapsed={collapsedNow} group="main" />
        <div className="mt-auto flex flex-col gap-3">
          <NavItems collapsed={collapsedNow} group="settings" />
          {mobile ? (
            <div className="px-1">
              <LanguageDropdown />
            </div>
          ) : null}
          <Button
            className={
              collapsedNow ? "justify-center px-0" : "justify-start px-3"
            }
            variant="ghost"
            onPress={() => setSignOutOpen(true)}
          >
            {navCopy.signOut}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar (lg+) — fixed: full viewport height, collapsible. */}
      <aside
        className={`border-default-100 fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto border-r bg-background transition-all lg:flex ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        {sidebar(false)}
      </aside>

      <div
        className={`flex min-h-screen flex-col transition-all ${
          collapsed ? "lg:pl-[68px]" : "lg:pl-60"
        }`}
      >
        {/* Top actions row: collapse toggle + global controls. */}
        <div className="border-default-100 bg-background/90 sticky top-0 z-20 flex items-center justify-end border-b px-4 py-2.5">
          <TopActions
            collapsed={collapsed}
            onCollapseToggle={toggleCollapsed}
          />
        </div>

        {children}
      </div>

      {/* Mobile drawer (<lg). */}
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
                <UserBlock collapsed={false} />
                <div className="mt-4 flex flex-col gap-3">
                  <NavItems
                    collapsed={false}
                    group="main"
                    onNavigate={() => setMenuOpen(false)}
                  />
                  <NavItems
                    collapsed={false}
                    group="settings"
                    onNavigate={() => setMenuOpen(false)}
                  />
                  <Button
                    className="justify-start px-3"
                    variant="ghost"
                    onPress={() => {
                      setMenuOpen(false);
                      setSignOutOpen(true);
                    }}
                  >
                    {navCopy.signOut}
                  </Button>
                </div>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>

      {/* Sign-out confirmation. */}
      <AlertDialog>
        <AlertDialog.Backdrop
          isDismissable={!signingOut}
          isOpen={signOutOpen}
          onOpenChange={(open) => {
            if (!open) setSignOutOpen(false);
          }}
        >
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="danger" />
                <AlertDialog.Heading>{navCopy.signOut}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>{navCopy.signOutConfirm}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button isDisabled={signingOut} slot="close" variant="tertiary">
                  {navCopy.cancel}
                </Button>
                <Button
                  isPending={signingOut}
                  variant="danger"
                  onPress={() => void signOut()}
                >
                  {navCopy.signOut}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
