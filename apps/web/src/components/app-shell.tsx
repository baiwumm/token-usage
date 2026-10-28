"use client";

// App shell for the authenticated pages (docs/ui-spec.md 响应式): a
// profile-first sidebar with pill navigation and a sticky top bar that owns
// the page title (dashboard shows a time-based greeting). Below lg the
// sidebar collapses into a drawer with the same anatomy.
//
// The CLI API and /login stay outside this shell.

import {
  ArrowRightFromSquare,
  Bars,
  Calendar,
  ChevronsExpandVertical,
  ClockArrowRotateLeft,
  Display,
  Gear,
  LayoutSideContent,
  ListUl,
  Tachometer,
} from "@gravity-ui/icons";
import {
  AlertDialog,
  Avatar,
  Button,
  Chip,
  Drawer,
  Dropdown,
  Label,
  ScrollShadow,
  Separator,
  Spinner,
  Typography,
  Popover,
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

import { TopActions } from "@/components/top-actions";
import { useProfile, type Profile } from "@/lib/auth/profile";
import { authBrowserClient } from "@/lib/auth/browser";
import { NAV_COPY, NAV_ITEMS, type NavCopy } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

const NAV_ICONS = {
  dashboard: Display,
  sessions: ListUl,
  syncRuns: ClockArrowRotateLeft,
  wrapped: Calendar,
  status: Tachometer,
  settings: Gear,
} as const;

const COLLAPSE_KEY = "token-usage.sidebar-collapsed";

const NAV_ITEM_BASE =
  "group flex h-9 items-center gap-2.5 rounded-3xl text-sm transition-colors";

function initialsFor(name: string, email: string | null): string {
  if (name.trim()) return name.trim().charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();

  return "?";
}

function firstNameOf(profile: Profile | null): string | null {
  if (!profile) return null;
  const name = profile.displayName.trim();

  if (name) return name.split(/\s+/)[0];
  const local = profile.email?.split("@")[0]?.trim();

  return local || null;
}

/** Local hour of the signed-in user; null until mounted (SSR-safe). */
function useLocalHour(): number | null {
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  return hour;
}

function titleForPath(pathname: string, copy: NavCopy): string {
  if (pathname.startsWith("/sessions")) return copy.sessions;
  if (pathname.startsWith("/sync-runs")) return copy.syncRuns;
  if (pathname.startsWith("/wrapped")) return copy.wrapped;
  if (pathname.startsWith("/service-status")) return copy.status;
  if (pathname.startsWith("/settings")) return copy.settings;
  if (pathname.startsWith("/device")) return copy.device;

  return copy.dashboard;
}

function ProfileAvatar({
  profile,
  displayName,
  email,
}: {
  profile: Profile | null;
  displayName: string;
  email: string | null;
}) {
  return (
    <Avatar className="size-8 shrink-0" color="accent" variant="soft">
      {profile?.avatarUrl ? (
        <Avatar.Image alt={displayName} src={profile.avatarUrl} />
      ) : null}
      <Avatar.Fallback>
        {initialsFor(profile?.displayName ?? "", email)}
      </Avatar.Fallback>
    </Avatar>
  );
}

/** Brand lockup: accent tile + wordmark with a quiet product tagline. */
function Brand({ collapsed }: { collapsed: boolean }) {
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];

  return (
    <div className="flex h-16 shrink-0 items-center px-3">
      <Link
        aria-label="Token Usage"
        className={`hover:bg-default flex min-w-0 items-center gap-2.5 rounded-3xl p-1 transition-colors ${
          collapsed ? "w-full justify-center" : "w-full"
        }`}
        href="/"
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="col-start-1 row-start-1 size-8 rounded-lg dark:hidden"
            height={32}
            src="/logo.svg"
            width={32}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="col-start-1 row-start-1 hidden size-8 rounded-lg dark:block"
            height={32}
            src="/logo-dark.svg"
            width={32}
          />
        </span>
        {collapsed ? null : (
          <div className="flex min-w-0 flex-col">
            <Typography
              truncate
              className="leading-tight"
              type="h6"
              weight="semibold"
            >
              Token Usage
            </Typography>
            <Typography
              truncate
              className="text-[10px] tracking-[0.16em] uppercase"
              color="muted"
              type="body-xs"
              weight="medium"
            >
              {copy.brandTagline}
            </Typography>
          </div>
        )}
      </Link>
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

/**
 * Profile block pinned to the bottom of the sidebar: avatar + name + account
 * email, opening a dropdown with account settings and sign-out (the only
 * sign-out entry point). Collapsed shows the avatar only.
 */
function SidebarProfile({
  collapsed,
  profile,
  onRequestSignOut,
}: {
  collapsed: boolean;
  profile: Profile | null;
  onRequestSignOut: () => void;
}) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const email = profile?.email ?? null;
  const displayName = profile?.displayName || email || "…";

  const handleAction = (key: Key) => {
    if (key === "settings") {
      router.push("/settings");
    } else if (key === "signout") {
      onRequestSignOut();
    }
  };

  return (
    <div className={`px-2 pt-1 pb-2 ${collapsed ? "flex justify-center" : ""}`}>
      <Dropdown>
        <Dropdown.Trigger
          aria-label={collapsed ? displayName : undefined}
          className={`hover:bg-default flex items-center gap-2.5 rounded-3xl p-2 text-start transition-colors ${
            collapsed ? "justify-center" : "w-full"
          }`}
        >
          <ProfileAvatar
            displayName={displayName}
            email={email}
            profile={profile}
          />
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-tight font-medium">
                  {displayName}
                </span>
                {email ? (
                  <span className="text-muted mt-0.5 truncate text-xs">
                    {email}
                  </span>
                ) : null}
              </span>
              <ChevronsExpandVertical className="text-muted size-3.5 shrink-0" />
            </>
          )}
        </Dropdown.Trigger>

        <Dropdown.Popover className="min-w-60 scrollbar-none">
          <Popover.Arrow />
          <div className="flex items-center gap-3 px-3 pt-3 pb-1">
            <ProfileAvatar
              displayName={displayName}
              email={email}
              profile={profile}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {displayName}
              </span>
              {email ? (
                <span className="text-muted truncate text-xs">{email}</span>
              ) : null}
            </span>
          </div>

          <Separator />

          <Dropdown.Menu onAction={handleAction}>
            <Dropdown.Item id="settings" textValue={copy.accountSettings}>
              <Gear className="text-muted size-4 shrink-0" />
              <Label>{copy.accountSettings}</Label>
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
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const hour = useLocalHour();
  const { profile } = useProfile();
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

  const requestSignOut = useCallback(() => setSignOutOpen(true), []);

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

  const isDashboard = pathname === "/" || pathname === "/dashboard";
  const firstName = firstNameOf(profile);
  const greeting =
    hour === null
      ? null
      : hour < 12
        ? copy.greetingMorning
        : hour < 18
          ? copy.greetingAfternoon
          : copy.greetingEvening;
  const pageTitle = isDashboard
    ? greeting && firstName
      ? `${greeting}${locale === "zh" ? "，" : ", "}${firstName}`
      : greeting || copy.dashboard
    : titleForPath(pathname, copy);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar (lg+) — fixed, transparent over the page background. */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col transition-[width] duration-200 lg:flex ${
          collapsed ? "w-19" : "w-66"
        }`}
      >
        <Brand collapsed={collapsed} />
        <ScrollShadow className="min-h-0 flex-1 px-3 py-2" size={24}>
          <NavItems collapsed={collapsed} />
        </ScrollShadow>
        <SidebarProfile
          collapsed={collapsed}
          profile={profile}
          onRequestSignOut={requestSignOut}
        />
      </aside>

      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ${
          collapsed ? "lg:pl-19" : "lg:pl-66"
        }`}
      >
        {/* Top bar: navigation toggle LEFT, contextual page title, controls RIGHT. */}
        <header className="bg-background/80 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 px-3 backdrop-blur-xl md:px-6">
          <Button
            isIconOnly
            aria-label={copy.menu}
            className="text-muted hover:text-foreground size-8 min-w-8 shrink-0 rounded-full lg:hidden"
            size="sm"
            variant="ghost"
            onPress={() => setMenuOpen(true)}
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
            onPress={toggleCollapsed}
          >
            <LayoutSideContent className="size-4.5" />
          </Button>
          <Typography
            truncate
            className="min-w-0 flex-1 text-lg sm:text-xl"
            type="h1"
            weight="bold"
          >
            {pageTitle}
          </Typography>
          <TopActions />
        </header>

        {children}
      </div>

      {/* Mobile drawer (<lg) — same profile-first anatomy as the sidebar.
          Rendered without the Drawer root: it wraps children in react-aria's
          DialogTrigger, which warns when the overlay is controlled externally
          without a trigger child. Backdrop carries the state here. The panel
          uses the page background (not surface) so the active nav item's
          surface pill stays visible, matching the desktop sidebar. */}
      <Drawer.Backdrop isOpen={menuOpen} onOpenChange={setMenuOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog
            aria-label="Token Usage"
            className="bg-background w-72 max-w-[86vw] p-0"
          >
            <Drawer.Header className="flex h-16 flex-row items-center gap-1 pr-12">
              <div className="min-w-0 flex-1">
                <Brand collapsed={false} />
              </div>
              <Drawer.CloseTrigger aria-label={copy.closeMenu} />
            </Drawer.Header>
            <Drawer.Body className="mt-0 flex flex-col gap-4 px-3 py-3">
              <NavItems
                collapsed={false}
                onNavigate={() => setMenuOpen(false)}
              />
            </Drawer.Body>
            <Drawer.Footer className="mt-0 flex flex-col gap-2 px-3 py-3">
              <SidebarProfile
                collapsed={false}
                profile={profile}
                onRequestSignOut={() => {
                  setMenuOpen(false);
                  requestSignOut();
                }}
              />
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>

      {/* Sign-out confirmation. Same controlled-overlay workaround as the
          drawer above: state lives on the backdrop, not the root. */}
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
              <Typography type="body-sm">{copy.signOutConfirm}</Typography>
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
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    {copy.signOut}
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
