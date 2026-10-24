// Magic-link callback tests (docs/rewrite-plan.md §5 M2, 拍板事项 3).
//
// Full PKCE round trip against the fake: a browser-leg client requests the
// magic link (the verifier lands in cookies), the fake plays the role of the
// email body by exposing the auth code, and the /auth/callback route handler
// exchanges it server-side and establishes the session on the redirect
// response. Failure paths bounce back to /login with stable error codes.

import { createServerClient } from "@supabase/ssr";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as callbackGet } from "@/app/auth/callback/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import { USER_EMAIL, USER_ID, initContractEnv } from "./helpers";

const fake = new FakeSupabase();

interface CapturedCookie {
	name: string;
	value: string;
}

beforeAll(async () => {
	initContractEnv(await fake.listen());
});

afterAll(async () => {
	await fake.close();
});

beforeEach(() => {
	fake.reset();
});

/** Browser leg: request the magic link, capture the verifier cookies. */
async function startMagicLinkFlow(email: string): Promise<CapturedCookie[]> {
	// Admin-created account, as the invite flow provisions it.
	fake.registerPasswordUser(email, "unused-password", USER_ID);

	const captured: CapturedCookie[] = [];
	const client = createServerClient(fake.url, "fake-publishable-key", {
		cookies: {
			getAll: () => [],
			setAll: (cookies) => {
				captured.push(...cookies.map(({ name, value }) => ({ name, value })));
			},
		},
	});

	const { error } = await client.auth.signInWithOtp({
		email,
		options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
	});

	expect(error).toBeNull();
	expect(fake.lastOtp).not.toBeNull();

	return captured;
}

function callbackRequest(query: string, cookies: CapturedCookie[]): Request {
	const cookieHeader = cookies
		.map((cookie) => `${cookie.name}=${cookie.value}`)
		.join("; ");

	return new Request(`http://localhost:3000/auth/callback${query}`, {
		headers: cookieHeader ? { cookie: cookieHeader } : {},
	});
}

function setCookieNames(response: Response): string[] {
	return response.headers
		.getSetCookie()
		.map((cookie) => cookie.split("=", 1)[0]);
}

describe("GET /auth/callback", () => {
	it("exchanges the PKCE code and establishes the session", async () => {
		const cookies = await startMagicLinkFlow(USER_EMAIL);
		const authCode = fake.lastOtp!.authCode;

		const response = await callbackGet(
			callbackRequest(`?code=${authCode}&next=${encodeURIComponent("/settings")}`, cookies),
		);

		expect(response.status).toBe(307);
		// Explicit ?next= is honored; a bare sign-in defaults to "/" (dashboard).
		expect(response.headers.get("location")).toBe("http://localhost:3000/settings");

		// Session cookies ride on the redirect response.
		const names = setCookieNames(response);

		expect(names.some((name) => name.startsWith("sb-") && name.endsWith("-auth-token"))).toBe(true);

		// The minted access token resolves against /auth/v1/user — the session
		// is live for the dual-principal contract endpoints.
		const session = fake.issuedSessions.at(-1);

		expect(session?.grant).toBe("pkce");
		const user = await fetch(`${fake.url}/auth/v1/user`, {
			headers: { Authorization: `Bearer ${session!.accessToken}` },
		});

		expect(user.status).toBe(200);
		expect(((await user.json()) as { id: string }).id).toBe(USER_ID);
	});

	it("is one-shot: replaying the same code fails", async () => {
		const cookies = await startMagicLinkFlow(USER_EMAIL);
		const authCode = fake.lastOtp!.authCode;

		const first = await callbackGet(
			callbackRequest(`?code=${authCode}`, cookies),
		);

		expect(first.status).toBe(307);
		expect(first.headers.get("location")).toBe("http://localhost:3000/");

		const replay = await callbackGet(callbackRequest(`?code=${authCode}`, cookies));

		expect(replay.status).toBe(307);
		expect(new URL(replay.headers.get("location") || "").searchParams.get("error")).toBe(
			"auth_exchange_failed",
		);
	});

	it("bounces a missing code to /login", async () => {
		const response = await callbackGet(
			callbackRequest("", []),
		);

		expect(response.status).toBe(307);
		const target = new URL(response.headers.get("location") || "");

		expect(target.pathname).toBe("/login");
		expect(target.searchParams.get("error")).toBe("auth_code_missing");
		expect(target.searchParams.get("next")).toBe("/");
	});

	it("bounces an unknown code to /login", async () => {
		const cookies = await startMagicLinkFlow(USER_EMAIL);
		const response = await callbackGet(
			callbackRequest("?code=notarealcode", cookies),
		);

		expect(response.status).toBe(307);
		const target = new URL(response.headers.get("location") || "");

		expect(target.pathname).toBe("/login");
		expect(target.searchParams.get("error")).toBe("auth_exchange_failed");
	});

	it("bounces when the PKCE verifier cookie is missing", async () => {
		await startMagicLinkFlow(USER_EMAIL);
		const authCode = fake.lastOtp!.authCode;

		const response = await callbackGet(
			callbackRequest(`?code=${authCode}`, []),
		);

		expect(response.status).toBe(307);
		const target = new URL(response.headers.get("location") || "");

		expect(target.searchParams.get("error")).toBe("auth_exchange_failed");
	});

	it("sanitizes ?next= against open redirects", async () => {
		for (const next of ["https://evil.example", "//evil.example", "/login"]) {
			const cookies = await startMagicLinkFlow(USER_EMAIL);
			const authCode = fake.lastOtp!.authCode;

			const response = await callbackGet(
				callbackRequest(`?code=${authCode}&next=${encodeURIComponent(next)}`, cookies),
			);

			// Falls back to the default destination; /login never loops.
			expect(response.status).toBe(307);
			expect(new URL(response.headers.get("location") || "").pathname).toBe(
				"/",
			);
		}
	});
});
