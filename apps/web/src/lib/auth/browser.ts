"use client";

// Browser-side auth client (login form, settings page). Created lazily so
// build-time prerendering never instantiates a Supabase client with missing
// environment; auth traffic from the browser is the one exempted direct
// connection (docs/requirements.md 验收标准, 2026-10-24 裁决).

import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserClient } from "@supabase/ssr";

import { authConfig } from "./config";

let cached: SupabaseClient | null = null;

/** Null when browser-auth env is missing (e.g. CI build prerender). */
export function authBrowserClient(): SupabaseClient | null {
  if (!cached) {
    const config = authConfig();

    if (!config) return null;
    cached = createBrowserClient(config.url, config.publishableKey);
  }

  return cached;
}
