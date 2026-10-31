// POST /api/functions/token-usage-subscription-report — device token only.
// CLI face, docs/cli-contract.md §2.13: the LATEST subscription balance
// snapshot per source, upserted on (user_id, source) — no history, no
// reconciliation. Strictly best-effort on the client; validation failures use
// the single stable `400 invalid_subscription_report` code with details
// logged server-side only.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, select, upsert } from "@/lib/api/supabase-rest";
import { sha256Hex } from "@/lib/device-codes";

export const dynamic = "force-dynamic";

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

function invalidReport(): Response {
  return jsonResponse(400, { error: "invalid_subscription_report" });
}

function optionalString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined as unknown as string;
  const trimmed = value.trim();

  return trimmed && trimmed.length <= max ? trimmed : null;
}

function optionalNonNegativeNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) return undefined as unknown as number;
  // Flag the overflow case separately so callers can reject oversized input.
  if (parsed > Number.MAX_SAFE_INTEGER) return undefined as unknown as number;

  return round6(parsed);
}

function isRejected(value: unknown): boolean {
  return value === (undefined as unknown as string);
}

function normalizePools(raw: unknown): Record<string, unknown>[] | undefined {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 8) return undefined;

  const pools: Record<string, unknown>[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    const name = optionalString(record.name, 100);

    if (isRejected(name)) return undefined;
    const unit = optionalString(record.unit, 100);

    if (isRejected(unit)) return undefined;
    const total = optionalNonNegativeNumber(record.total);

    if (isRejected(total)) return undefined;
    const used = optionalNonNegativeNumber(record.used);

    if (isRejected(used)) return undefined;
    const remaining = optionalNonNegativeNumber(record.remaining);

    if (isRejected(remaining)) return undefined;
    pools.push({ name, unit, total, used, remaining });
  }

  return pools;
}

function normalizeWindows(raw: unknown): Record<string, unknown>[] | undefined {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 8) return undefined;

  const windows: Record<string, unknown>[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    const label = optionalString(record.label, 40);

    if (isRejected(label)) return undefined;
    let percent: number | null = null;

    if (record.percent !== undefined && record.percent !== null) {
      const parsed = Number(record.percent);

      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return undefined;
      }
      percent = round6(parsed);
    }
    let resetsAt: string | null = null;

    if (record.resets_at !== undefined && record.resets_at !== null) {
      const parsed = Date.parse(String(record.resets_at));

      if (!Number.isFinite(parsed)) return undefined;
      resetsAt = new Date(parsed).toISOString();
    }
    windows.push({ label, percent, resets_at: resetsAt });
  }

  return windows;
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
    const deviceToken = getBearer(request);

    if (!deviceToken)
      return jsonResponse(401, { error: "Missing bearer token" });

    const tokenHash = sha256Hex(deviceToken);
    const tokenRows = await select("token_device_tokens", {
      select: "user_id,device_id,revoked_at",
      filters: [
        ["token_hash", "eq", tokenHash],
        ["revoked_at", "is", "null"],
      ],
      limit: 1,
    });
    const tokenRow = tokenRows[0];

    if (!tokenRow) return jsonResponse(401, { error: "Unauthorized" });

    const deviceRows = await select("token_devices", {
      select: "id,revoked_at",
      filters: [["id", "eq", tokenRow.device_id]],
      limit: 1,
    });

    if (!deviceRows[0] || deviceRows[0].revoked_at) {
      return jsonResponse(403, { error: "Device is revoked" });
    }

    const body = (await readJsonBody(request)) as Record<string, unknown>;

    if (!body.subscriptions || !Array.isArray(body.subscriptions)) {
      return invalidReport();
    }
    if (body.subscriptions.length > 10) return invalidReport();

    const rows: Record<string, unknown>[] = [];
    const seenSources = new Set<string>();
    const now = new Date().toISOString();

    for (const raw of body.subscriptions) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return invalidReport();
      }
      const record = raw as Record<string, unknown>;
      const source =
        typeof record.source === "string"
          ? record.source.trim().toLowerCase()
          : "";

      if (!source || source.length > 100 || seenSources.has(source)) {
        return invalidReport();
      }
      const plan = optionalString(record.plan, 100);

      if (isRejected(plan)) return invalidReport();
      const pools = normalizePools(record.pools);

      if (pools === undefined) return invalidReport();
      const windows = normalizeWindows(record.windows);

      if (windows === undefined) return invalidReport();
      seenSources.add(source);
      rows.push({
        user_id: tokenRow.user_id,
        source,
        plan,
        pools,
        windows,
        captured_at: now,
        updated_at: now,
      });
    }

    if (rows.length > 0) {
      await upsert(
        "token_subscription_snapshots",
        rows as never,
        "user_id,source",
        { returning: false },
      );
    }

    return jsonResponse(200, { ok: true, upserted: rows.length });
  } catch (error) {
    return errorResponse(error);
  }
}
