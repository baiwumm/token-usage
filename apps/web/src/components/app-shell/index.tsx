"use client";

// App shell for the authenticated pages (docs/ui-spec.md 响应式): a
// profile-first sidebar with pill navigation and a sticky top bar that owns
// the page title (dashboard shows a time-based greeting). Below lg the
// sidebar collapses into a drawer with the same anatomy.
//
// The CLI API and /login stay outside this shell.

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { MobileDrawer } from "./mobile-drawer";
import { firstNameOf, titleForPath } from "./page-title";
import { Sidebar } from "./sidebar";
import { SignOutDialog } from "./sign-out-dialog";
import { TopBar } from "./top-bar";
import { useLocalHour } from "./use-local-hour";

import { AchievementUnlockWatcher } from "@/components/achievements/achievement-unlock-watcher";
import { authBrowserClient } from "@/lib/auth/browser";
import { useProfile } from "@/lib/auth/profile";
import { NAV_COPY } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

const COLLAPSE_KEY = "token-usage.sidebar-collapsed";

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
      <Sidebar
        collapsed={collapsed}
        profile={profile}
        onRequestSignOut={requestSignOut}
      />

      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-200 ${
          collapsed ? "lg:pl-19" : "lg:pl-66"
        }`}
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
