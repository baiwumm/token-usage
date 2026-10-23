// GET /api/functions/token-usage-public-config — public. CLI face, frozen by
// docs/cli-contract.md §2.5. Only public client values leave the server; the
// secret key never appears here. The frozen `supabase_anon_key` field carries
// the current publishable key (anon replacement in Supabase's key system).

import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
} from "@/lib/api/http";
import { publishableKey, supabaseUrl } from "@/lib/api/supabase-rest";

export const dynamic = "force-dynamic";

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export async function GET() {
  try {
    let url: string;
    let publicKeyValue: string;

    try {
      url = supabaseUrl();
      publicKeyValue = publishableKey();
    } catch {
      return jsonResponse(503, {
        error: "Supabase public configuration is not set",
      });
    }

    return jsonResponse(200, {
      supabase_url: url,
      supabase_anon_key: publicKeyValue,
      dashboard_url:
        String(process.env.TOKEN_USAGE_DASHBOARD_URL || "").trim() || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
