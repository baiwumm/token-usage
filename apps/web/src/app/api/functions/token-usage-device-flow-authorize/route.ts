// POST /api/functions/token-usage-device-flow-authorize — public. CLI face,
// frozen by docs/cli-contract.md §2.1.

import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, insert } from "@/lib/api/supabase-rest";
import { randomHex, randomUserCode } from "@/lib/device-codes";

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
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const clientInfo =
      typeof body.client_info === "string"
        ? body.client_info.slice(0, 200)
        : null;
    const machineId =
      typeof body.machine_id === "string" && body.machine_id.trim().length >= 8
        ? body.machine_id.trim().slice(0, 64)
        : null;

    const dashboardUrl = String(process.env.TOKEN_USAGE_DASHBOARD_URL || "")
      .trim()
      .replace(/\/$/, "");

    if (!dashboardUrl) {
      return jsonResponse(500, {
        error: "TOKEN_USAGE_DASHBOARD_URL is not configured",
      });
    }

    let lastError: unknown = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const deviceCode = randomHex(32);
      const userCode = randomUserCode();

      try {
        await insert(
          "token_device_codes",
          [
            {
              device_code: deviceCode,
              user_code: userCode,
              status: "pending",
              client_info: clientInfo,
              machine_id: machineId,
              expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
          ],
          { returning: false },
        );

        return jsonResponse(200, {
          device_code: deviceCode,
          user_code: userCode,
          verification_uri: `${dashboardUrl}/device`,
          verification_uri_complete: `${dashboardUrl}/device?user_code=${encodeURIComponent(userCode)}`,
          expires_in: 900,
          interval: 5,
        });
      } catch (error) {
        lastError = error;
        const status = (error as { status?: unknown }).status;

        if (status !== 409) throw error;
      }
    }

    console.error("device-flow-authorize: could not allocate code", lastError);

    return jsonResponse(503, { error: "Could not allocate a device code" });
  } catch (error) {
    return errorResponse(error);
  }
}
