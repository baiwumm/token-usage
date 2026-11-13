"use client";

// App shell for the authenticated pages (docs/ui-spec.md 响应式): a
// profile-first sidebar with pill navigation and a sticky top bar that owns
// the page title (dashboard shows a time-based greeting). Below lg the
// sidebar collapses into a drawer with the same anatomy.
//
// The CLI API and /login stay outside this shell.

import { cn, toast } from "@heroui/react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  getCollapsedServerSnapshot,
  getCollapsedSnapshot,
  setCollapsedPreference,
  subscribeCollapsed,
} from "./collapse-state";
import { MobileDrawer } from "./mobile-drawer";
import { firstNameOf, titleForPath } from "./page-title";
import { Sidebar } from "./sidebar";
import { SignOutDialog } from "./sign-out-dialog";
import { TopBar } from "./top-bar";
import { useLocalHour } from "./use-local-hour";

import { AchievementUnlockWatcher } from "@/components/achievement-unlock-watcher";
import { BackToTop } from "@/components/back-to-top";
import { authBrowserClient } from "@/lib/auth/browser";
import { useProfile } from "@/lib/auth/profile";
import { NAV_COPY } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];
  const hour = useLocalHour();
  const { profile } = useProfile();
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsedPreference(!getCollapsedSnapshot());
  }, []);

  const requestSignOut = useCallback(() => setSignOutOpen(true), []);

  async function signOut() {
    setSigningOut(true);

    try {
      const client = authBrowserClient();

      if (!client) throw new Error("auth client unavailable");
      // supabase-js reports failures in `error` instead of throwing; ignoring
      // it navigated to /login while the session cookie survived, and the
      // login page bounced straight back.
      //
      // scope: "local" — signOut() defaults to the global scope, which revokes
      // every session of the account (other browsers included). The menu entry
      // reads as "sign out of this browser", so only this one goes; revoking
      // everyone stays a server-side action. The CLI is unaffected either way
      // (device tokens, not auth sessions).
      const { error } = await client.auth.signOut({ scope: "local" });

      if (error) throw error;
      setSignOutOpen(false);
      router.replace("/login");
      router.refresh();
    } catch {
      // Keep the dialog open so the operator can retry rather than believing
      // they are signed out when the session is still live.
      toast.danger(copy.signOutError);
    } finally {
      setSigningOut(false);
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
      <Sidebar
        collapsed={collapsed}
        profile={profile}
        onRequestSignOut={requestSignOut}
      />

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-19" : "lg:pl-66",
        )}
      >
        <TopBar
          collapsed={collapsed}
          copy={copy}
          title={pageTitle}
          onOpenMenu={() => setMenuOpen(true)}
          onToggleCollapsed={toggleCollapsed}
        />

        {children}
      </div>

      <AchievementUnlockWatcher />

      <BackToTop label={copy.backToTop} />

      <MobileDrawer
        copy={copy}
        open={menuOpen}
        profile={profile}
        onOpenChange={setMenuOpen}
        onRequestSignOut={requestSignOut}
      />

      <SignOutDialog
        copy={copy}
        open={signOutOpen}
        signingOut={signingOut}
        onConfirm={() => void signOut()}
        onOpenChange={(open) => {
          if (!open) setSignOutOpen(false);
        }}
      />
    </div>
  );
}
