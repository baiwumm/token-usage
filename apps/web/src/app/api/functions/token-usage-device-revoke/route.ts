// POST /api/functions/token-usage-device-revoke — device token (own device
// only) or JWT (any device of the account). CLI face, frozen by
// docs/cli-contract.md §2.9. Soft revocation is idempotent; usage rows stay
// in the database and leave account aggregation until re-pairing.

import {
  HttpError,
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, select, update } from "@/lib/api/supabase-rest";
import { resolvePrincipal } from "@/lib/api/principal";

export const dynamic = "force-dynamic";

export async function GET() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export async function POST(request: Request) {
  try {
    assertConfigured();
    const principal = await resolvePrincipal(getBearer(request));

    if (!principal) return jsonResponse(401, { error: "Unauthorized" });

    let body: Record<string, unknown>;

    try {
      const raw = await readJsonBody(request);

      body =
        typeof raw === "object" && raw !== null
          ? (raw as Record<string, unknown>)
          : {};
    } catch (error) {
      // A size violation keeps its 413; anything else is malformed JSON.
      if (error instanceof HttpError) throw error;

      return jsonResponse(400, { error: "invalid_json" });
    }

    const deviceId = String(body.device_id || "").trim();

    if (!deviceId) return jsonResponse(400, { error: "device_id_required" });

    // Scope the target to the account. A device token may only revoke itself.
    const rows = await select("token_devices", {
      select: "id,device_name,user_id,revoked_at",
      filters: [
        ["id", "eq", deviceId],
        ["user_id", "eq", principal.userId],
      ],
      limit: 1,
    });
    const target = rows[0];

    if (!target) return jsonResponse(404, { error: "device_not_found" });
    if (principal.deviceId && principal.deviceId !== target.id) {
      return jsonResponse(403, { error: "device_token_scoped_to_own_device" });
    }

    const now = new Date().toISOString();
    const alreadyRevoked = Boolean(target.revoked_at);
    const revokedAt = (target.revoked_at as string) || now;

    if (!alreadyRevoked) {
      await update(
        "token_devices",
        { revoked_at: revokedAt, updated_at: revokedAt },
        [
          ["id", "eq", target.id],
          ["user_id", "eq", principal.userId],
          ["revoked_at", "is", "null"],
        ],
        { returning: false },
      );
    }

    // Only the count leaves this handler; token hashes never leave the server.
    const revokedTokens = await update(
      "token_device_tokens",
      { revoked_at: revokedAt },
      [
        ["device_id", "eq", target.id],
        ["user_id", "eq", principal.userId],
        ["revoked_at", "is", "null"],
      ],
      { returning: true },
    );

    return jsonResponse(200, {
      device_id: target.id,
      device_name: target.device_name,
      revoked_at: revokedAt,
      already_revoked: alreadyRevoked,
      revoked_tokens: revokedTokens.length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
