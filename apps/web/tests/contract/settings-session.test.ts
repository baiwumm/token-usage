// Settings-page session link (docs/rewrite-plan.md §5 M2 验收线).
//
// The whole chain the settings UI relies on: password grant issues a
// Supabase session → the route guard admits its cookie → the contract
// endpoints accept the session JWT as the user principal (dual-principal
// path, §1.4) → revoking a device invalidates that device's tokens
// immediately (revoke 期间同一会话仍有效，被吊销设备的令牌 401).

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { POST as ingestPost } from "@/app/api/functions/token-usage-ingest/route";
import { POST as renamePost } from "@/app/api/functions/token-usage-device-rename/route";
import { POST as revokePost } from "@/app/api/functions/token-usage-device-revoke/route";
import { handleFunctionsGet as seriesGet } from "@/lib/api/account-series-router";

import { FakeSupabase } from "../helpers/fake-supabase";
import {
	DEVICE_A,
	DEVICE_B,
	TOKEN_B,
	USER_EMAIL,
	USER_ID,
	base,
	initContractEnv,
	jsonRequest,
	seedScenario,
} from "./helpers";

const fake = new FakeSupabase();
const PASSWORD = "accept-m2-password";

let accessToken = "";
let grantedSession: { accessToken: string } | null = null;

beforeAll(async () => {
	initContractEnv(await fake.listen());
});

afterAll(async () => {
	await fake.close();
});

beforeEach(() => {
	fake.reset();
	seedScenario(fake);
	fake.registerPasswordUser(USER_EMAIL, PASSWORD, USER_ID);
	// The password-grant test mints a session; seedScenario resets the auth
	// map each round, so keep the issued access token resolvable.
	if (grantedSession) {
		fake.authUsers.set(grantedSession.accessToken, {
			id: USER_ID,
			email: USER_EMAIL,
		});
	}
});

function contractGet(slug: string, query: string, token: string): Promise<Response> {
	const series = slug.replace(/^account-/, "");

	return seriesGet(
		new Request(`${base(slug)}${query}`, {
			headers: { Authorization: `Bearer ${token}` },
		}),
		{ params: Promise.resolve({ slug: [`token-usage-account-${series}`] }) },
	);
}

async function sessionCookie(token: string): Promise<NextRequest> {
	const captured: Array<{ name: string; value: string }> = [];
	const client = createServerClient(fake.url, "fake-publishable-key", {
		cookies: {
			getAll: () => [],
			setAll: (cookies) => {
				captured.push(...cookies.map(({ name, value }) => ({ name, value })));
			},
		},
	});
	const { error } = await client.auth.setSession({
		access_token: token,
		refresh_token: "fake-refresh",
	});

	if (error) throw error;
	await new Promise((resolve) => setTimeout(resolve, 100));

	return new NextRequest("http://localhost/settings", {
		headers: {
			cookie: captured.map((c) => `${c.name}=${c.value}`).join("; "),
		},
	});
}

describe("settings session link", () => {
	it("signs in with the password grant", async () => {
		const wrong = await fetch(`${fake.url}/auth/v1/token?grant_type=password`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: USER_EMAIL, password: "nope" }),
		});

		expect(wrong.status).toBe(400);
		expect(((await wrong.json()) as { error: string }).error).toBe("invalid_grant");

		const granted = await fetch(`${fake.url}/auth/v1/token?grant_type=password`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: USER_EMAIL, password: PASSWORD }),
		});

		expect(granted.status).toBe(200);
		const payload = (await granted.json()) as { access_token: string; user: { id: string } };

		expect(payload.user.id).toBe(USER_ID);
		accessToken = payload.access_token;
		grantedSession = { accessToken };
	});

	it("admits the session cookie through the page guard", async () => {
		const request = await sessionCookie(accessToken);
		const response = await proxy(request);

		expect(response.status).toBe(200);
		expect(response.headers.get("x-middleware-next")).toBe("1");
	});

	it("lists devices through account-devices with the session JWT", async () => {
		const response = await contractGet(
			"account-devices",
			"?from=2026-10-01&to=2026-10-31",
			accessToken,
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			devices: Array<{ id: string; device_name: string }>;
		};

		expect(payload.devices.map((device) => device.id)).toEqual([DEVICE_A, DEVICE_B]);
	});

	it("renames a device through device-rename with the session JWT", async () => {
		const response = await renamePost(
			jsonRequest(base("device-rename"), {
				token: accessToken,
				body: { device_id: DEVICE_A, device_name: "Settings Renamed" },
			}),
		);

		expect(response.status).toBe(200);
		const payload = (await response.json()) as { previous_name: string };

		expect(payload.previous_name).toBe("PC One #aaaa1111");
	});

	it("revokes a sibling device and its token dies immediately", async () => {
		const revoked = await revokePost(
			jsonRequest(base("device-revoke"), {
				token: accessToken,
				body: { device_id: DEVICE_B },
			}),
		);

		expect(revoked.status).toBe(200);
		const payload = (await revoked.json()) as { revoked_tokens: number; already_revoked: boolean };

		expect(payload.already_revoked).toBe(false);
		expect(payload.revoked_tokens).toBe(1);

		// Same session still works; the revoked device's own token is 401.
		const stillValid = await contractGet(
			"account-devices",
			"?from=2026-10-01&to=2026-10-31",
			accessToken,
		);

		expect(stillValid.status).toBe(200);

		const dead = await ingestPost(
			jsonRequest(base("ingest"), {
				token: TOKEN_B,
				body: {
					hourly: [
						{
							hour_start: "2026-10-21T09:00:00.000Z",
							source: "codex",
							model: "test-unpriced-model",
							input_tokens: 1,
							cached_input_tokens: 0,
							cache_creation_input_tokens: 0,
							output_tokens: 0,
							reasoning_output_tokens: 0,
							total_tokens: 1,
						},
					],
				},
			}),
		);

		expect(dead.status).toBe(401);
	});
});
