// Project profiles for the signed-in owner (docs/ui-spec.md「项目（`/projects`）」节):
// the browser session authenticates via @supabase/ssr cookies like
// /api/app/badge, then every read and write goes through service-role.
//
// GET    → { upload_enabled, profiles[] }: the manual profile merged with the
//          newest CLI-detected repo per project_key (contract v3).
// PUT    → replace one project's manual fields (display name, https repo
//          link, repo_hidden, https logo URL; optionally drop the uploaded
//          logo). Returns { profile }.
// POST   → ?project_key= with the cropped logo as the raw body: WebP / PNG
//          by signature, ≤512 KB, stored in the public avatars bucket under
//          <user_id>/projects/<uuid>.<ext> (no project name in the public
//          URL); the previous upload is deleted. Returns { profile }.
// DELETE → ?project_key= resets the manual profile and deletes the uploaded
//          logo; CLI detections stay. Returns { profile }.

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAppSession } from "@/lib/api/app-session";
import { jsonResponse } from "@/lib/api/http";
import {
  LOGO_BUCKET,
  MAX_LOGO_BYTES,
  loadProjectProfiles,
  parseProjectKey,
  sniffLogoType,
  toProfile,
} from "@/lib/api/project-profiles";
import {
  remove,
  select,
  storageBucketExists,
  storageRemove,
  storageUpload,
  upsert,
  type RestRow,
} from "@/lib/api/supabase-rest";
import { parseDisplayName, parseHttpsUrl } from "@/lib/projects/profile";

const TABLE = "token_project_profiles";

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// Storage failures answer one generic envelope; details stay server-side.
function logError(error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(error);
}

function unavailable(error: unknown): NextResponse {
  logError(error);

  return jsonError(503, "Project profiles unavailable");
}

function ownRow(
  userId: string,
  projectKey: string,
): Array<[string, string, unknown]> {
  return [
    ["user_id", "eq", userId],
    ["project_key", "eq", projectKey],
  ];
}

async function loadManualRow(
  userId: string,
  projectKey: string,
): Promise<RestRow | undefined> {
  const rows = await select(TABLE, {
    select: "logo_object",
    filters: ownRow(userId, projectKey),
    limit: 1,
  });

  return rows[0];
}

function storedObject(row: RestRow | undefined): string | null {
  return typeof row?.logo_object === "string" && row.logo_object
    ? row.logo_object
    : null;
}

// A stray object is harmless; failing an already-saved profile is not.
async function dropObject(path: string | null): Promise<void> {
  if (!path) return;
  try {
    await storageRemove(LOGO_BUCKET, [path]);
  } catch (error) {
    logError(error);
  }
}

async function profileResponse(
  userId: string,
  projectKey: string,
): Promise<Response> {
  const [profile] = await loadProjectProfiles(userId, projectKey);

  return jsonResponse(200, {
    profile: profile ?? toProfile(projectKey, undefined, null),
  });
}

export async function GET() {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  try {
    const [profiles, uploadEnabled] = await Promise.all([
      loadProjectProfiles(session.userId),
      // The avatars bucket is optional: without it the page hides upload.
      storageBucketExists(LOGO_BUCKET).catch(() => false),
    ]);

    return jsonResponse(200, { upload_enabled: uploadEnabled, profiles });
  } catch (error) {
    return unavailable(error);
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  const body = await readJson(request);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Invalid body");
  }
  const input = body as Record<string, unknown>;
  const projectKey = parseProjectKey(input.project_key);

  if (!projectKey) return jsonError(400, "Invalid project_key");
  const displayName = parseDisplayName(input.display_name);

  if (!displayName.ok) return jsonError(400, "Invalid display_name");
  const repoUrl = parseHttpsUrl(input.repo_url);

  if (!repoUrl.ok) return jsonError(400, "Invalid repo_url");
  const logoUrl = parseHttpsUrl(input.logo_url);

  if (!logoUrl.ok) return jsonError(400, "Invalid logo_url");
  const repoHidden = input.repo_hidden ?? false;

  if (typeof repoHidden !== "boolean") {
    return jsonError(400, "Invalid repo_hidden");
  }
  const clearUpload = input.clear_logo_upload ?? false;

  if (typeof clearUpload !== "boolean") {
    return jsonError(400, "Invalid clear_logo_upload");
  }

  try {
    const existing = await loadManualRow(session.userId, projectKey);
    const previousObject = storedObject(existing);
    const logoObject = clearUpload ? null : previousObject;
    const empty =
      !displayName.value &&
      !repoUrl.value &&
      !repoHidden &&
      !logoUrl.value &&
      !logoObject;

    // A profile with nothing left in it is the same as no profile.
    if (empty) {
      if (existing) await remove(TABLE, ownRow(session.userId, projectKey));
    } else {
      await upsert(
        TABLE,
        {
          user_id: session.userId,
          project_key: projectKey,
          display_name: displayName.value,
          repo_url: repoUrl.value,
          repo_hidden: repoHidden,
          logo_url: logoUrl.value,
          logo_object: logoObject,
          updated_at: new Date().toISOString(),
        },
        "user_id,project_key",
        { returning: false },
      );
    }
    if (clearUpload) await dropObject(previousObject);

    return await profileResponse(session.userId, projectKey);
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  const projectKey = parseProjectKey(
    request.nextUrl.searchParams.get("project_key"),
  );

  if (!projectKey) return jsonError(400, "Invalid project_key");
  const declared = Number(request.headers.get("content-length") || 0);

  if (declared > MAX_LOGO_BYTES) return jsonError(413, "Logo too large");
  const bytes = new Uint8Array(await request.arrayBuffer());

  if (bytes.length === 0) return jsonError(400, "Empty logo");
  if (bytes.length > MAX_LOGO_BYTES) return jsonError(413, "Logo too large");
  const kind = sniffLogoType(bytes);

  if (!kind) return jsonError(415, "Unsupported image type");

  try {
    if (!(await storageBucketExists(LOGO_BUCKET))) {
      return jsonError(503, "Logo upload unavailable");
    }
    const existing = await loadManualRow(session.userId, projectKey);
    const path = `${session.userId}/projects/${randomUUID()}.${kind.ext}`;

    await storageUpload(LOGO_BUCKET, path, bytes, kind.contentType);
    try {
      // Only the logo column is named, so the rest of an existing profile
      // survives the upload.
      await upsert(
        TABLE,
        {
          user_id: session.userId,
          project_key: projectKey,
          logo_object: path,
          updated_at: new Date().toISOString(),
        },
        "user_id,project_key",
        { returning: false },
      );
    } catch (error) {
      await dropObject(path);
      throw error;
    }
    await dropObject(storedObject(existing));

    return await profileResponse(session.userId, projectKey);
  } catch (error) {
    return unavailable(error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  const projectKey = parseProjectKey(
    request.nextUrl.searchParams.get("project_key"),
  );

  if (!projectKey) return jsonError(400, "Invalid project_key");

  try {
    const existing = await loadManualRow(session.userId, projectKey);

    if (existing) await remove(TABLE, ownRow(session.userId, projectKey));
    await dropObject(storedObject(existing));

    return await profileResponse(session.userId, projectKey);
  } catch (error) {
    return unavailable(error);
  }
}
