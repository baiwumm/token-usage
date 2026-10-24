// Browser-auth environment access (docs/rewrite-plan.md §9): the public URL
// and publishable key drive @supabase/ssr clients. The secret key never
// reaches this module — it stays inside the contract data-access layer.
//
// NEXT_PUBLIC_* values are inlined into client bundles only for STATIC
// `process.env.NEXT_PUBLIC_X` member access — dynamic indexing is invisible
// to the inliner and reads empty in the browser, so the lookups here must
// stay literal. This module is imported by client code; the server-side
// legacy-name fallbacks simply inline as undefined there.

export interface AuthConfig {
  url: string;
  publishableKey: string;
}

// Null when the deployment is missing browser-auth configuration; callers
// decide how to degrade (the route guard fails closed, UI hides auth flows).
export function authConfig(): AuthConfig | null {
  const url = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  )
    .trim()
    .replace(/\/$/, "");
  const publishableKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "",
  ).trim();

  if (!url || !publishableKey) return null;

  return { url, publishableKey };
}
