/** @type {import('next').NextConfig} */

// 2026-11-03: the legacy `tokentracker-*` path aliases were RETIRED (breaking
// change, decided by the operator; record in docs/cli-contract.md §1.5).
// Old paths now get no handler: GET falls through routing to 404, write verbs
// hit the catch-all's frozen 405 envelope.
const nextConfig = {
	// Tests that boot their own server (tests/contract/legacy-alias-removed.test.ts)
	// set NEXT_DIST_DIR so two dev instances on this tree never contend for
	// the same build directory. Unset in every other environment.
	distDir: process.env.NEXT_DIST_DIR || ".next",
	experimental: {
		// Barrel packages imported by name across many client components; the
		// optimizer rewrites them to per-symbol modules.
		optimizePackageImports: ["@heroui/react", "recharts", "@gravity-ui/icons"],
	},
};

export default nextConfig;
