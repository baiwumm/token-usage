// Unit tests for the post-login ?next= URL builders (lib/auth/next-path):
// the default destination omits the redundant parameter (its absence
// resolves back to "/" on both /login and /auth/callback), deep links keep
// carrying their path + query through it.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_POST_LOGIN_PATH,
  loginPathFor,
  urlWithNext,
} from "@/lib/auth/next-path";

describe("urlWithNext", () => {
	it("keeps a deep link's path + query through ?next=", () => {
		expect(urlWithNext("/auth/callback", "/device?user_code=XXXX-YYYY")).toBe(
			"/auth/callback?next=%2Fdevice%3Fuser_code%3DXXXX-YYYY",
		);
	});

	it("omits the parameter for the default destination", () => {
		expect(urlWithNext("/auth/callback", DEFAULT_POST_LOGIN_PATH)).toBe(
			"/auth/callback",
		);
		expect(urlWithNext("/login", "/")).toBe("/login");
	});

	it("keeps non-default page targets on any base", () => {
		expect(urlWithNext("/auth/callback", "/settings")).toBe(
			"/auth/callback?next=%2Fsettings",
		);
	});
});

describe("loginPathFor", () => {
	it("bounces the bare domain to a clean /login", () => {
		expect(loginPathFor("/")).toBe("/login");
	});

	it("carries deep links through ?next=", () => {
		expect(loginPathFor("/sessions")).toBe("/login?next=%2Fsessions");
	});
});
