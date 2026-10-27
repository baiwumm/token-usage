// Unit tests for the pure device-code primitives (docs/cli-contract.md §2.1
// invariants: user_code alphabet without 0/1/I/L/O, XXXX-XXXX shape, device_code
// 64-hex, deterministic device naming).

import { describe, expect, it } from "vitest";

import {
  USER_CODE_ALPHABET,
  clientHostname,
  deviceNameFor,
  isValidDeviceCode,
  isValidUserCode,
  randomUserCode,
  sha256Hex,
} from "@/lib/device-codes";

describe("randomUserCode", () => {
  it("always produces XXXX-XXXX from the frozen alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = randomUserCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(code).toHaveLength(9);
      expect(code[4]).toBe("-");
    }
  });

  it("never emits the excluded characters 0/1/I/L/O", () => {
    const forbidden = /[01ILO]/;
    for (let i = 0; i < 500; i++) {
      expect(randomUserCode()).not.toMatch(forbidden);
    }
  });

  it("exposes the canonical alphabet", () => {
    expect(USER_CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    expect(USER_CODE_ALPHABET).toHaveLength(31);
    expect(USER_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });
});

describe("isValidUserCode", () => {
  it("accepts valid shapes", () => {
    expect(isValidUserCode("AAAA-BBBB")).toBe(true);
    expect(isValidUserCode("Z9Z9-Z9Z9")).toBe(true);
  });

  it("rejects excluded characters, wrong lengths, wrong shapes", () => {
    expect(isValidUserCode("AAAA0BBBB")).toBe(false);
    expect(isValidUserCode("A1AA-BBBB")).toBe(false);
    expect(isValidUserCode("AILA-BBBB")).toBe(false);
    expect(isValidUserCode("AAA-BBBB")).toBe(false);
    expect(isValidUserCode("AAAAA-BBBB")).toBe(false);
    expect(isValidUserCode("AAAABBBB")).toBe(false);
    expect(isValidUserCode("aaaa-bbbb")).toBe(false);
    expect(isValidUserCode("")).toBe(false);
    expect(isValidUserCode(null)).toBe(false);
  });
});

describe("isValidDeviceCode", () => {
  it("accepts exactly 64 hex chars", () => {
    expect(isValidDeviceCode("a".repeat(64))).toBe(true);
    expect(isValidDeviceCode("0123456789abcdef".repeat(4))).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidDeviceCode("a".repeat(63))).toBe(false);
    expect(isValidDeviceCode("A".repeat(64))).toBe(false);
    expect(isValidDeviceCode("g".repeat(64))).toBe(false);
    expect(isValidDeviceCode("")).toBe(false);
    expect(isValidDeviceCode(undefined)).toBe(false);
  });
});

describe("clientHostname", () => {
  it("extracts the hostname part after the first token", () => {
    expect(clientHostname("tokentracker 1.4.0 DESKTOP-ABC123")).toBe("1.4.0 DESKTOP-ABC123");
  });

  it("falls back to the whole trimmed value", () => {
    expect(clientHostname("solo-hostname")).toBe("solo-hostname");
  });

  it("truncates to 96 chars and tolerates empty input", () => {
    expect(clientHostname("x".repeat(120))).toHaveLength(96);
    expect(clientHostname("")).toBe("");
    expect(clientHostname(null)).toBe("");
  });
});

describe("deviceNameFor", () => {
  it("builds <hostname> #<first 8 machine id chars>", () => {
    expect(deviceNameFor("tokentracker 1.4.0 DESKTOP-ABC123", "machine-abcd-1234")).toBe(
      "1.4.0 DESKTOP-ABC123 #machine-",
    );
  });

  it("falls back to the frozen CLI name without a hostname", () => {
    expect(deviceNameFor("", "machine-abcd-1234")).toBe("Token Usage CLI #machine-");
    expect(deviceNameFor(null, null)).toBe("Token Usage CLI");
  });

  it("caps the hostname at 96 chars before the suffix is added", () => {
    const long = deviceNameFor("x".repeat(200), "machine-abcd-1234");
    // 96-char hostname + " #machine-" suffix; the 128 cap never engages here.
    expect(long).toHaveLength(106);
  });
});

describe("sha256Hex", () => {
  it("matches the known vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is utf8-based and stable", () => {
    expect(sha256Hex("设备令牌")).toHaveLength(64);
    expect(sha256Hex("设备令牌")).toBe(sha256Hex("设备令牌"));
  });
});
