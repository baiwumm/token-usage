// Route-guard tests (docs/requirements.md 路由约定, 2026-10-24).
//
// The proxy contract gate must stay byte-identical to M1 (OPTIONS 204 / 405
// envelope / GET+POST pass-through, session never consulted); the page guard
// redirects unauthenticated browsers to /login carrying the original path +
// query in ?next= (the pairing link's ?user_code= must survive).

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proxy, config } from "@/proxy";

import { FakeSupabase } from "../helpers/fake-supabase";
import { USER_EMAIL, USER_ID, initContractEnv, seedScenario } from "./helpers";

const fake = new FakeSupabase();

interface CapturedCookie {
	name: string;
	value: string;
}

let sessionCookies: CapturedCookie[] = [];
let guardSession: { accessToken: string } | null = null;

beforeAll(async () => {
	initContractEnv(await fake.listen());
	seedScenario(fake);

	const user = fake.registerPasswordUser(USER_EMAIL, "test-password", USER_ID);
	const session = fake.mintSession(user, "password");

	guardSession = session;
	sessionCookies = await cookieSessionFor(session.accessToken, session.refreshToken);
});

afterAll(async () => {
	await fake.close();
});

beforeEach(() => {
	seedScenario(fake);
	// seedScenario resets the auth-user map; re-register the minted access
	// token the session cookies carry.
	fake.authUsers.set(guardSession!.accessToken, { id: USER_ID, email: USER_EMAIL });
});

/** Build the real @supabase/ssr cookie payload for a minted session. */
async function cookieSessionFor(
	accessToken: string,
	refreshToken: string,
): Promise<CapturedCookie[]> {
	const captured: CapturedCookie[] = [];
	const client = createServerClient(fake.url, "fake-publishable-key", {
		cookies: {
			getAll: () => [],
			setAll: (cookies) => {
				captured.push(...cookies.map(({ name, value }) => ({ name, value })));
			},
		},
	});
	const { error } = await client.auth.setSession({
		access_token: accessToken,
		refresh_token: refreshToken,
	});

	if (error) throw error;
	// The SIGNED_IN flush runs on the auth state listener.
	await new Promise((resolve) => setTimeout(resolve, 100));

	return captured;
}

function guardRequest(
	path: string,
	cookies: CapturedCookie[] = [],
	method = "GET",
): NextRequest {
	const cookieHeader = cookies
		.map((cookie) => `${cookie.name}=${cookie.value}`)
		.join("; ");

	return new NextRequest(`http://localhost${path}`, {
		method,
		headers: cookieHeader ? { cookie: cookieHeader } : {},
	});
}

function expectNext(response: Response): void {
	expect(response.status).toBe(200);
	expect(response.headers.get("x-middleware-next")).toBe("1");
	expect(response.headers.get("location")).toBeNull();
}

function redirectTarget(response: Response): URL {
	expect([301, 302, 307, 308]).toContain(response.status);

	return new URL(response.headers.get("location") || "");
}

describe("proxy config", () => {
	it("guards every protected page in the matcher (dashboard IS /)", () => {
		const matcher = config.matcher;

		expect(matcher).toContain("/");
		for (const page of ["/settings", "/wrapped", "/service-status", "/device"]) {
			expect(matcher).toContain(`${page}/:path*`);
		}
		expect(matcher).toContain("/api/functions/:path*");
	});
});

describe("public pages", () => {
	it.each(["/login", "/auth/callback", "/login?next=%2F"])(
		"never guards %s",
		async (path) => {
			expectNext(await proxy(guardRequest(path)));
		},
	);
});

describe("page guard redirects", () => {
	it.each([
		"/",
		"/settings",
		"/wrapped",
		"/service-status",
		"/device",
	])("sends unauthenticated %s to /login", async (path) => {
		const target = redirectTarget(await proxy(guardRequest(path)));

		expect(target.pathname).toBe("/login");
		expect(target.searchParams.get("next")).toBe(path);
	});

	it("preserves path AND query in ?next= (pairing user_code survives)", async () => {
		const device = redirectTarget(
			await proxy(guardRequest("/device?user_code=XXXX-YYYY")),
		);

		expect(device.searchParams.get("next")).toBe("/device?user_code=XXXX-YYYY");
	});
});

describe("page guard pass-through", () => {
	it("lets a session cookie through to protected pages", async () => {
		for (const path of ["/", "/settings", "/device?user_code=XXXX-YYYY"]) {
			expectNext(await proxy(guardRequest(path, sessionCookies)));
		}
	});

	it("fails closed on a garbage session cookie", async () => {
		const target = redirectTarget(
			await proxy(guardRequest("/settings", [{ name: "sb-127-auth-token", value: "garbage" }])),
		);

		expect(target.pathname).toBe("/login");
		expect(target.searchParams.get("next")).toBe("/settings");
	});
});

describe("contract gate stays frozen under the page guard", () => {
	it("answers OPTIONS with the 204 preflight without any session", async () => {
		const response = await proxy(
			guardRequest("/api/functions/token-usage-ingest", [], "OPTIONS"),
		);

		// Direct NextResponse — not a next() pass-through.
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-methods")).toBe(
			"GET, POST, OPTIONS",
		);
		expect(response.headers.get("access-control-max-age")).toBe("86400");
	});

	it("keeps the 405 envelope for non-GET/POST verbs", async () => {
		const response = await proxy(
			guardRequest(
				"/api/functions/token-usage-ingest",
				sessionCookies,
				"PATCH",
			),
		);

		expect(response.status).toBe(405);
		expect(await response.json()).toEqual({ error: "Method not allowed" });
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("passes GET through without consulting the session", async () => {
		expectNext(await proxy(guardRequest("/api/functions/token-usage-public-config")));
	});

	it("passes POST through without consulting the session", async () => {
		expectNext(await proxy(guardRequest("/api/functions/token-usage-ingest")));
	});
});
