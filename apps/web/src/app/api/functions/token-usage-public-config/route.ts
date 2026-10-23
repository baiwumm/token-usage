// GET /api/functions/token-usage-public-config — public. CLI face, frozen by
// docs/cli-contract.md §2.5. Only public client values leave the server; the
// service-role key never appears here.

import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
} from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export async function GET() {
  try {
    const supabaseUrl = String(process.env.SUPABASE_URL || "")
      .trim()
      .replace(/\/$/, "");
    const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(503, {
        error: "Supabase public configuration is not set",
      });
    }

    return jsonResponse(200, {
      supabase_url: supabaseUrl,
      supabase_anon_key: supabaseAnonKey,
      dashboard_url:
        String(process.env.TOKEN_USAGE_DASHBOARD_URL || "").trim() || null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
