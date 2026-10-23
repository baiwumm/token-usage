// Shared HTTP behavior for the contract layer — ports api/_lib/http.js.
// Every rule here is frozen by docs/cli-contract.md §1.2/§1.3.

const MAX_BODY_BYTES = 1_048_576;

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-api-key",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function methodNotAllowedResponse(): Response {
  return jsonResponse(405, { error: "Method not allowed" });
}

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Read the request body with the contract's 1 MiB cap (413 beyond it) and
 * parse as JSON. An empty body parses to {}. A malformed body throws the
 * SyntaxError, which errorResponse turns into a generic 500 — the same
 * behavior the reference implementation had.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();

  if (!text) return {};
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new HttpError("Upload too large", 413);
  }

  return JSON.parse(text) as unknown;
}

export function getBearer(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

// 5xx bodies never leak internals (§1.3); details go to the server log only.
export function errorResponse(error: unknown): Response {
  const candidate = error as { statusCode?: unknown; status?: unknown } | null;
  const status =
    Number(candidate?.statusCode) || Number(candidate?.status) || 500;

  if (status >= 500) {
    console.error(error);
  }
  const message = error instanceof Error ? error.message : undefined;

  return jsonResponse(status, {
    error: status >= 500 ? "Internal server error" : message,
  });
}
