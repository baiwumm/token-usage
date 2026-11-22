// Pure device-code primitives — ports the non-I/O half of api/_lib/device.js.
// The user_code alphabet is contract-frozen (docs/cli-contract.md §2.1): no
// 0/1/I/L/O, dash after the 4th character.

import { createHash, randomBytes } from "node:crypto";

export const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function randomUserCode(): string {
  // Rejection sampling: the 31-char alphabet does not divide 256, so a bare
  // modulo favours the first 8 letters. Bytes >= 31 * 8 are redrawn.
  const limit = 256 - (256 % USER_CODE_ALPHABET.length);
  const chars: string[] = [];

  while (chars.length < 8) {
    for (const byte of randomBytes(8 - chars.length)) {
      if (byte >= limit) continue;
      chars.push(USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]);
      if (chars.length === 8) break;
    }
  }

  const code = chars.join("");

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function isValidUserCode(value: unknown): boolean {
  return /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(String(value || ""));
}

export function isValidDeviceCode(value: unknown): boolean {
  return /^[0-9a-f]{64}$/.test(String(value || ""));
}

export function clientHostname(clientInfo: unknown): string {
  const value = String(clientInfo || "").trim();

  if (!value) return "";
  const match = value.match(/^\S+\s+(.+)$/);

  return (match?.[1] || value).trim().slice(0, 96);
}

export function deviceNameFor(clientInfo: unknown, machineId: unknown): string {
  const hostname = clientHostname(clientInfo);
  const suffix = machineId ? ` #${String(machineId).slice(0, 8)}` : "";

  return `${hostname || "Token Usage CLI"}${suffix}`.slice(0, 128);
}
