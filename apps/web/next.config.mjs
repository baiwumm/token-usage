/** @type {import('next').NextConfig} */

// Legacy path alias for the pinned collector CLI (tokentracker-cli@1.4.x):
// its functionUrlFor() hardcodes the old `tokentracker-*` slugs, so the old
// paths keep serving identical behavior via rewrite. Frozen until every
// collector has migrated; see docs/cli-contract.md §1.5.
const legacyApiRewrites = [
  {
    source: "/api/functions/tokentracker-account-:series",
    destination: "/api/functions/token-usage-account-:series",
  },
  {
    source: "/api/functions/tokentracker-:slug",
    destination: "/api/functions/token-usage-:slug",
  },
];

const nextConfig = {
  async rewrites() {
    return legacyApiRewrites;
  },
};

export default nextConfig;
