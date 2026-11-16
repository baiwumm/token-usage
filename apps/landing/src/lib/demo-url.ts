// Demo instance (docs/demo-instance-plan.md §6). Single source for the
// landing links: the static export has no runtime env, so the URL is fixed at
// build time. The instance itself is deployed from this repo with
// TOKEN_USAGE_DEMO=on (read-only, seeded nightly).
//
// The production public page and badges still come from the README
// (src/lib/badge-url.ts) — the demo only adds a dashboard entry.

export const DEMO_URL = "https://demo.token-usage.cc";
