// Contract-layer request gate (docs/cli-contract.md §1.2).
//
// Next 16's proxy convention (the successor of middleware) runs before
// routing, which is what lets the whole /api/functions/* family keep the
// frozen behavior for every HTTP verb: OPTIONS answers 204 with the CORS
// headers, and everything besides GET and POST — HEAD included, matching the
// reference handlers' method checks — gets the JSON 405 envelope. Requests
// arriving through the legacy tokentracker-* rewrites pass through here too.

import { NextResponse, type NextRequest } from "next/server";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-api-key",
  "Access-Control-Max-Age": "86400",
};

export function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  if (method !== "GET" && method !== "POST") {
    return new NextResponse(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/functions/:path*",
};
