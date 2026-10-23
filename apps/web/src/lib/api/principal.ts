// Principal resolution — ports api/_lib/principal.js against the token_* tables.
// Order is contract-frozen (docs/cli-contract.md §1.4): device-token hash
// lookup first, then Supabase Auth validation for three-part JWTs. An
// unverified JWT sub is never trusted directly.

import { getUser, select, type AuthUser, type RestRow } from "./supabase-rest";

import { sha256Hex } from "@/lib/device-codes";

export type Principal =
  | { kind: "device"; userId: string; deviceId: string; user: null }
  | { kind: "user"; userId: string; deviceId: null; user: AuthUser };

export function looksLikeJwt(value: unknown): boolean {
  return typeof value === "string" && value.split(".").length === 3;
}

export async function resolvePrincipal(
  bearer: unknown,
): Promise<Principal | null> {
  const token = String(bearer || "").trim();

  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const tokenRows = await select("token_device_tokens", {
    select: "user_id,device_id,revoked_at",
    filters: [
      ["token_hash", "eq", tokenHash],
      ["revoked_at", "is", "null"],
    ],
    limit: 1,
  });
  const tokenRow: RestRow | undefined = tokenRows[0];

  if (tokenRow) {
    const deviceRows = await select("token_devices", {
      select: "id,revoked_at",
      filters: [["id", "eq", tokenRow.device_id]],
      limit: 1,
    });

    if (!deviceRows[0] || deviceRows[0].revoked_at) return null;

    return {
      kind: "device",
      userId: String(tokenRow.user_id),
      deviceId: String(tokenRow.device_id),
      user: null,
    };
  }

  if (looksLikeJwt(token)) {
    const user = await getUser(token);

    if (user?.id) {
      return {
        kind: "user",
        userId: user.id,
        deviceId: null,
        user,
      };
    }
  }

  return null;
}
