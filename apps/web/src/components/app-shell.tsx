"use client";

// App shell for the authenticated pages — layout mirrors the better-admin
// sidebar: brand row with a collapse chevron, scrollable nav (pill states),
// bottom user block that opens an upward popover (profile header + menu with
// edit-profile and danger sign-out behind an AlertDialog). Drawer below lg.
// The CLI API and /login stay outside this shell.

import {
  ArrowRightFromSquare,
  Calendar,
  ArrowUpArrowDown,
  Display,
  Gear,
  Tachometer,
} from "@gravity-ui/icons";
import {
  AlertDialog,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Label,
  ScrollShadow,
  Separator,
  Typography,
} from "@heroui/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type Key,
  type ReactNode,
} from "react";

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

/**
 * Brand row: logo mark + name (ChevronsUpDown mirrors the reference layout's
 * affordance; the brand itself is static here).
 */
function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-default-100 flex h-16 shrink-0 items-center border-b px-4">
      <div className="bg-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Display aria-hidden="true" className="text-accent-foreground size-5" />
      </div>
      {collapsed ? null : (
        <Typography className="ml-3 min-w-0 truncate" type="h5" weight="bold">
          Token Usage
        </Typography>
      )}
    </div>
  );
}

function NavItems({
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
    <nav aria-label={copy.menu} className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
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
              collapsed ? "justify-center px-2 py-2" : "rounded-3xl px-2.5 py-2"
            } ${
              active
                ? "bg-default text-foreground font-medium"
                : "text-foreground/60 hover:bg-default hover:text-foreground"
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

/**
 * Bottom user block (better-admin SidebarUser pattern): trigger opens an
 * upward dropdown with the profile header, an edit-profile item and a danger
 * sign-out that raises the AlertDialog confirm. Collapsed shows avatar only.
 */
function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const { profile } = useProfile();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const name = profile?.displayName || "";
  const email = profile?.email ?? null;
  const displayName = name || email || "…";

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

  const avatar = (
    <Avatar className="size-8 shrink-0">
      {profile?.avatarUrl ? (
        <Avatar.Image alt={displayName} src={profile.avatarUrl} />
      ) : null}
      <Avatar.Fallback>{initialsFor(name, email)}</Avatar.Fallback>
    </Avatar>
  );

  const handleAction = (key: Key) => {
    if (key === "profile") {
      router.push("/settings");
    } else if (key === "signout") {
      setSignOutOpen(true);
    }
  };

  return (
    <div
      className={`border-default-100 border-t p-3 ${collapsed ? "flex justify-center" : ""}`}
    >
      <Dropdown>
        <Dropdown.Trigger
          className={`hover:bg-default flex w-full items-center gap-3 rounded-3xl px-3 py-2 text-start ${
            collapsed ? "w-auto justify-center px-2" : ""
          }`}
        >
          {avatar}
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  {displayName}
                </span>
                {email ? (
                  <span className="text-foreground/50 truncate text-xs">
                    {email}
                  </span>
                ) : null}
              </span>
              <ArrowUpArrowDown className="text-foreground/50 size-4 shrink-0" />
            </>
          )}
        </Dropdown.Trigger>

        <Dropdown.Popover className="min-w-56">
          {/* Popover header: same user info as the trigger. */}
          <div className="flex items-center gap-3 px-3 pb-1 pt-3">
            {avatar}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {displayName}
              </span>
              {email ? (
                <span className="text-foreground/50 truncate text-xs">
                  {email}
                </span>
              ) : null}
            </span>
          </div>

          <Separator />

          <Dropdown.Menu onAction={handleAction}>
            <Dropdown.Item id="profile" textValue={copy.myProfile}>
              <Gear className="text-foreground/60 size-4 shrink-0" />
              <Label>{copy.myProfile}</Label>
            </Dropdown.Item>

            <Separator />

            <Dropdown.Item
              id="signout"
              textValue={copy.signOut}
              variant="danger"
            >
              <ArrowRightFromSquare className="text-danger size-4 shrink-0" />
              <Label>{copy.signOut}</Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      {/* Sign-out confirmation lives inside SidebarUser: the menu action only
          reaches this component's state, not the shell's. */}
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
                <AlertDialog.Heading>{copy.signOut}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>{copy.signOutConfirm}</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button isDisabled={signingOut} slot="close" variant="tertiary">
                  {copy.cancel}
                </Button>
                <Button
                  isPending={signingOut}
                  variant="danger"
                  onPress={() => void signOut()}
                >
                  {copy.signOut}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
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

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar (lg+) — fixed: full viewport height, collapsible. */}
      <aside
        className={`border-default-100 fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r bg-surface transition-all lg:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarBrand collapsed={collapsed} />
        <ScrollShadow className="min-h-0 flex-1 px-3 py-2" size={24}>
          <NavItems collapsed={collapsed} />
        </ScrollShadow>
        <SidebarUser collapsed={collapsed} />
      </aside>

      <div
        className={`flex min-h-screen flex-col transition-all ${
          collapsed ? "lg:pl-16" : "lg:pl-64"
        }`}
      >
        {/* Top bar: collapse toggle LEFT, global controls RIGHT. */}
        <div className="border-default-100 bg-background/90 sticky top-0 z-20 flex items-center justify-between border-b px-4 py-2.5">
          <Button
            isIconOnly
            aria-label="Toggle sidebar"
            size="sm"
            variant="ghost"
            onPress={toggleCollapsed}
          >
            <ArrowUpArrowDown className="size-4" />
          </Button>
          <TopActions />
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
                <div className="flex flex-col gap-3">
                  <NavItems
                    collapsed={false}
                    onNavigate={() => setMenuOpen(false)}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <Button
                    aria-label={navCopy.signOut}
                    className="justify-start px-3"
                    variant="ghost"
                    onPress={() => {
                      setMenuOpen(false);
                      setSignOutOpen(true);
                    }}
                  >
                    <ArrowRightFromSquare
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    {navCopy.signOut}
                  </Button>
                  <LanguageDropdown />
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
