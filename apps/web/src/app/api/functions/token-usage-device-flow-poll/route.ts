// POST /api/functions/token-usage-device-flow-poll — public (knowledge of the
// device_code is the credential). CLI face, frozen by docs/cli-contract.md §2.2.

import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, select, update } from "@/lib/api/supabase-rest";
import { isValidDeviceCode } from "@/lib/device-codes";
import { issueDeviceToken } from "@/lib/api/devices";

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
    const deviceCode =
      typeof body.device_code === "string" ? body.device_code.trim() : "";

    if (!isValidDeviceCode(deviceCode)) {
      return jsonResponse(404, { status: "unknown" });
    }

    const rows = await select("token_device_codes", {
      select:
        "device_code,user_id,status,expires_at,approved_at,client_info,machine_id",
      filters: [["device_code", "eq", deviceCode]],
      limit: 1,
    });
    const row = rows[0];

    if (!row) return jsonResponse(404, { status: "unknown" });

    const expiresAt = new Date(String(row.expires_at)).getTime();

    if (Date.now() > expiresAt) {
      await update(
        "token_device_codes",
        { status: "expired" },
        [
          ["device_code", "eq", deviceCode],
          ["status", "eq", "pending"],
        ],
        { returning: false },
      );

      return jsonResponse(410, { status: "expired" });
    }

    if (row.status === "approved" && row.user_id) {
      // Claim the code before issuing: two concurrent polls must not both
      // mint a token (the second would revoke the first's token, leaving the
      // CLI holding a dead credential). The conditional update is the
      // compare-and-swap; the loser sees status='used' and answers 410.
      const claimed = await update("token_device_codes", { status: "used" }, [
        ["device_code", "eq", deviceCode],
        ["status", "eq", "approved"],
      ]);

      if (claimed.length === 0) {
        return jsonResponse(410, { status: "expired" });
      }

      try {
        const issued = await issueDeviceToken({
          userId: String(row.user_id),
          clientInfo: row.client_info,
          machineId: (row.machine_id as string | null) || null,
        });

        return jsonResponse(200, {
          status: "approved",
          user_id: row.user_id,
          device_token: issued.token,
          device_id: issued.deviceId,
          machine_id: issued.machineId,
        });
      } catch (error) {
        // Never strand the CLI: if issuance failed after the claim, release
        // the code so the next poll can retry.
        await update(
          "token_device_codes",
          { status: "approved" },
          [
            ["device_code", "eq", deviceCode],
            ["status", "eq", "used"],
          ],
          { returning: false },
        ).catch(() => undefined);
        throw error;
      }
    }

    if (row.status === "expired" || row.status === "used") {
      return jsonResponse(410, { status: "expired" });
    }

    return jsonResponse(200, { status: "pending" });
  } catch (error) {
    return errorResponse(error);
  }
}
