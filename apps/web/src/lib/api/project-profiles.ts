// Project profiles for /api/app/project-profiles (docs/ui-spec.md
// 「项目（`/projects`）」节; contract v3 read side, docs/cli-contract.md §2.4).
//
// Two writers, merged per project_key at read time:
// - token_project_repos: per-device GitHub / Gitee detection from ingest
//   `projects`. The newest non-null value among non-revoked devices wins, so a
//   revoked machine drops out the same way it drops out of every aggregate.
// - token_project_profiles: the manual profile edited in the dashboard.

import type { ProjectProfile } from "@/lib/projects/profile";

import { selectAll } from "./account-data";
import { storagePublicUrl, type RestRow } from "./supabase-rest";

import { normalizeProjectKey } from "@/lib/ingest/normalize";

/** The optional public bucket the avatar flow already uses. */
export const LOGO_BUCKET = "avatars";
export const MAX_LOGO_BYTES = 512 * 1024;

type Filter = [string, string, unknown];

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function newestDetections(
  repos: RestRow[],
  devices: RestRow[],
): Map<string, string> {
  const active = new Set(
    devices
      .filter((device) => !device.revoked_at)
      .map((device) => String(device.id)),
  );
  const newest = new Map<string, { url: string; at: number }>();

  for (const row of repos) {
    const url = text(row.repo_url);

    // A null row is a device saying "no remote any more" — it only clears
    // that device, so it never hides another device's detection.
    if (!url || !active.has(String(row.device_id))) continue;
    const key = String(row.project_key);
    const at = Date.parse(String(row.updated_at ?? "")) || 0;
    const previous = newest.get(key);

    if (!previous || at > previous.at) newest.set(key, { url, at });
  }

  return new Map([...newest].map(([key, value]) => [key, value.url]));
}

export function toProfile(
  projectKey: string,
  manual: RestRow | undefined,
  detected: string | null,
): ProjectProfile {
  const manualRepo = text(manual?.repo_url);
  const hidden = manual?.repo_hidden === true;
  const repoUrl = manualRepo ?? (hidden ? null : detected);
  const logoObject = text(manual?.logo_object);

  return {
    project_key: projectKey,
    display_name: text(manual?.display_name),
    repo_url: repoUrl,
    repo_source: manualRepo ? "manual" : repoUrl ? "detected" : null,
    detected_repo_url: detected,
    manual_repo_url: manualRepo,
    repo_hidden: hidden,
    logo_url: text(manual?.logo_url),
    logo_upload_url: logoObject
      ? storagePublicUrl(LOGO_BUCKET, logoObject)
      : null,
  };
}

/** Merged profiles for the user (or one project), ordered by project_key. */
export async function loadProjectProfiles(
  userId: string,
  projectKey?: string,
): Promise<ProjectProfile[]> {
  const scope: Filter[] = [["user_id", "eq", userId]];

  if (projectKey) scope.push(["project_key", "eq", projectKey]);
  const [manualRows, repoRows, devices] = await Promise.all([
    selectAll("token_project_profiles", {
      columns:
        "project_key,display_name,repo_url,repo_hidden,logo_url,logo_object",
      filters: scope,
      order: "project_key.asc",
    }),
    selectAll("token_project_repos", {
      columns: "device_id,project_key,repo_url,updated_at",
      filters: scope,
      order: "project_key.asc,device_id.asc",
    }),
    selectAll("token_devices", {
      columns: "id,revoked_at",
      filters: [["user_id", "eq", userId]],
      order: "id.asc",
    }),
  ]);
  const detected = newestDetections(repoRows, devices);
  const manualByKey = new Map(
    manualRows.map((row) => [String(row.project_key), row]),
  );
  const keys = [...new Set([...manualByKey.keys(), ...detected.keys()])].sort();

  return keys.map((key) =>
    toProfile(key, manualByKey.get(key), detected.get(key) ?? null),
  );
}

/** Same cleanup as every other project_key surface; null when unusable. */
export function parseProjectKey(value: unknown): string | null {
  return typeof value === "string" ? normalizeProjectKey(value) : null;
}

/** Logo bytes are trusted by signature, never by the declared type. */
export function sniffLogoType(
  bytes: Uint8Array,
): { contentType: string; ext: string } | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));

  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { contentType: "image/webp", ext: "webp" };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) {
    return { contentType: "image/png", ext: "png" };
  }

  return null;
}
