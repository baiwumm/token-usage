// Demo instance mode (docs/demo-instance-plan.md §3/§5).
//
// The demo deployment runs this same image with `TOKEN_USAGE_DEMO=on`: the
// proxy rejects writes, the shell shows a read-only banner, and unauthenticated
// visitors get signed into the shared demo account server-side. Production
// deployments never set the variable, so every branch here is inert there.
//
// Client components import `isDemoUi` (and the write-error helpers) only —
// NEXT_PUBLIC_* values are inlined for STATIC member access, so the lookups
// must stay literal.

import type { Locale } from "@/lib/copy/locale-config";

import { DEMO_COPY } from "@/lib/copy/demo";

/** Stable envelope for every blocked write on a demo instance. */
export const DEMO_WRITE_ERROR = "Demo instance is read-only";

/** Hosts that must never be treated as a demo instance (decision #19). */
const PRODUCTION_INSTANCE_HOSTS = ["app.token-usage.cc"];

function hostOf(value: string): string {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

/** Server-side gate: is this deployment the public demo instance? */
export function isDemoInstance(): boolean {
  return process.env.TOKEN_USAGE_DEMO === "on";
}

/** Client-side flag for banner/disabled controls (build-time inlined). */
export function isDemoUi(): boolean {
  return process.env.NEXT_PUBLIC_TOKEN_USAGE_DEMO === "on";
}

/**
 * Client-side recognition of the proxy's demo write gate: 403 plus the stable
 * envelope. Every browser API client copies `payload.error` into its own error
 * class, so the check reads the shape instead of an instanceof.
 */
export function isDemoWriteError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const { status, message } = error as { status?: unknown; message?: unknown };

  return status === 403 && message === DEMO_WRITE_ERROR;
}

/**
 * Friendly copy for a refused demo write, else null. Call sites do
 * `toast(demoWriteNotice(error, locale) ?? copy.saveError)` so the demo does
 * not report a generic "save failed" (let alone the English envelope).
 */
export function demoWriteNotice(error: unknown, locale: Locale): string | null {
  return isDemoWriteError(error) ? DEMO_COPY[locale].readOnly : null;
}

/** Shared demo account credentials — server-only, never inlined. */
export function demoCredentials(): { email: string; password: string } | null {
  const email = String(process.env.TOKEN_USAGE_DEMO_EMAIL || "").trim();
  const password = String(process.env.TOKEN_USAGE_DEMO_PASSWORD || "");

  if (!email || !password) return null;

  return { email, password };
}

/**
 * Boot-time sanity check. Returns an error message when the demo env is
 * misconfigured — the two failures that matter are "demo flag but pointing at
 * the production instance" (decision #19 isolation) and "demo flag without a
 * demo account to sign visitors into" (every page would bounce to /login).
 */
export function demoMisconfiguration(): string | null {
  if (!isDemoInstance()) return null;

  const dashboard = String(process.env.TOKEN_USAGE_DASHBOARD_URL || "").trim();
  const host = hostOf(dashboard);

  if (host && PRODUCTION_INSTANCE_HOSTS.includes(host)) {
    return `demo mode points TOKEN_USAGE_DASHBOARD_URL at the production instance (${host})`;
  }

  if (!demoCredentials()) {
    return "demo mode requires TOKEN_USAGE_DEMO_EMAIL and TOKEN_USAGE_DEMO_PASSWORD";
  }

  return null;
}
