// POST /api/functions/token-usage-device-flow-grant — device token or JWT.
// The /device page calls this to approve a CLI pairing code. CLI face, frozen
// by docs/cli-contract.md §2.3.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, update } from "@/lib/api/supabase-rest";
import { resolvePrincipal } from "@/lib/api/principal";
import { isValidUserCode } from "@/lib/device-codes";

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

    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const userCode = String(body.user_code || "")
      .toUpperCase()
      .trim();

    if (!isValidUserCode(userCode)) {
      return jsonResponse(400, { error: "Invalid user_code format" });
    }

    const rows = await update(
      "token_device_codes",
      {
        status: "approved",
        user_id: principal.userId,
        approved_at: new Date().toISOString(),
      },
      [
        ["user_code", "eq", userCode],
        ["status", "eq", "pending"],
        ["expires_at", "gt", new Date().toISOString()],
      ],
    );

    if (rows.length === 0) {
      return jsonResponse(404, {
        error: "Code not found, expired, or already used",
      });
    }

    return jsonResponse(200, { ok: true, user_code: userCode });
  } catch (error) {
    return errorResponse(error);
  }
}
