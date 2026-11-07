"use client";

// /login orchestration (docs/ui-spec.md 登录页): ?next=/?error= plumbing plus
// the two-column page shell — brand panel / form body, and the four top-bar
// quick actions (repo / language / accent / theme) pinned top-right, without
// the "pair device" primary button. It owns no Supabase calls; auth traffic
// stays in login-body through the exempted browser client. ?next= is
// sanitized before it is honored anywhere.

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { LoginBrandPanel } from "./login-brand-panel";
import { LoginBody } from "./login-body";

import {
  GitHubLink,
  LanguageDropdown,
  ThemeColorPicker,
  ThemeModeToggle,
} from "@/components/top-actions";
import { resolvePostLoginPath } from "@/lib/auth/next-path";

function LoginClientInner() {
  const searchParams = useSearchParams();
  const next = resolvePostLoginPath(searchParams.get("next"));
  const callbackError = searchParams.get("error");

  return (
    <main className="relative flex min-h-svh flex-col lg:grid lg:grid-cols-[minmax(0,45%)_minmax(0,1fr)]">
      {/* Quick actions (docs/ui-spec.md 登录页): the app-shell top bar's four
          icon buttons, minus the pairing primary. top/height mirror the brand
          rows (mobile bar pt-8 h-8, desktop lockup lg:py-10 h-9) so both
          centers sit on the same line. */}
      <div className="absolute top-8 right-6 z-10 flex h-8 items-center gap-1 lg:top-10 lg:right-12 lg:h-9">
        <GitHubLink />
        <LanguageDropdown />
        <ThemeColorPicker />
        <ThemeModeToggle />
      </div>

      <LoginBrandPanel />
      <LoginBody callbackError={callbackError} next={next} />
    </main>
  );
}

// useSearchParams needs a Suspense boundary for the static prerender.
export function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginClientInner />
    </Suspense>
  );
}
