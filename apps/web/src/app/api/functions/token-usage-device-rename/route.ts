// POST /api/functions/token-usage-device-rename — device token (own device
// only) or JWT (any device of the account). CLI face, frozen by
// docs/cli-contract.md §2.8.

import {
  HttpError,
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, select, update, SupabaseError } from "@/lib/api/supabase-rest";
import { invalidateAccountUsage } from "@/lib/api/account-data";
import { resolvePrincipal } from "@/lib/api/principal";

export const dynamic = "force-dynamic";

const NAME_MIN = 1;
const NAME_MAX = 60;

function normalizeName(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

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
    const deviceName = normalizeName(body.device_name);

    if (!deviceId || !deviceName) {
      return jsonResponse(400, { error: "device_id_and_name_required" });
    }
    if (deviceName.length < NAME_MIN || deviceName.length > NAME_MAX) {
      return jsonResponse(400, {
        error: "device_name_length",
        min: NAME_MIN,
        max: NAME_MAX,
      });
    }

    // Scope the target to the account. A device token may only rename itself.
    const rows = await select("token_devices", {
      select: "id,device_name,user_id,revoked_at",
      filters: [
        ["id", "eq", deviceId],
        ["user_id", "eq", principal.userId],
      ],
      limit: 1,
    });
    const target = rows[0];

    if (!target || target.revoked_at)
      return jsonResponse(404, { error: "device_not_found" });
    if (principal.deviceId && principal.deviceId !== target.id) {
      return jsonResponse(403, { error: "device_token_scoped_to_own_device" });
    }

    // A rename colliding with another active device of the same account would
    // break the pair flow's name fallback; reject it with a stable code.
    const siblings = await select("token_devices", {
      select: "id,revoked_at",
      filters: [
        ["user_id", "eq", principal.userId],
        ["device_name", "eq", deviceName],
      ],
      limit: 2,
    });

    if (siblings.some((row) => row.id !== target.id && !row.revoked_at)) {
      return jsonResponse(409, { error: "device_name_taken" });
    }

    try {
      await update(
        "token_devices",
        { device_name: deviceName },
        [
          ["id", "eq", target.id],
          ["user_id", "eq", principal.userId],
        ],
        { returning: false },
      );
    } catch (error) {
      // §2.8 forbids leaking the PostgREST message: a rename racing another
      // rename past the pre-check above surfaces as a unique violation here,
      // which must still answer with the stable 409 code (SupabaseError
      // carries status 409 for unique violations).
      if (error instanceof SupabaseError && error.status === 409) {
        return jsonResponse(409, { error: "device_name_taken" });
      }
      throw error;
    }
    // Device rows ride along in the cached account snapshot.
    invalidateAccountUsage(principal.userId);

    return jsonResponse(200, {
      device_id: target.id,
      device_name: deviceName,
      previous_name: target.device_name,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
