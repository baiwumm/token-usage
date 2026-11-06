// Contract tests for /api/app/project-profiles (docs/ui-spec.md
// 「项目（`/projects`）」节; contract v3 read side, docs/cli-contract.md §2.4):
// the merged read (manual first, newest detection among non-revoked devices),
// field validation, logo upload by signature, reset, and the optional avatars
// bucket. Fabricated values only.

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
  }),
}));

vi.mock("@/lib/auth/config", () => ({
  authConfig: () => ({
    url: "http://fake-auth.test",
    publishableKey: "fake-publishable-key",
  }),
}));

import { DELETE, GET, POST, PUT } from "@/app/api/app/project-profiles/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_REVOKED,
  USER_ID,
  initContractEnv,
  seedScenario,
} from "./helpers";

const fake = new FakeSupabase();
const APP_URL = "http://localhost/api/app/project-profiles";
const OTHER_USER = "99999999-9999-4999-8999-999999999999";

const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0x1a, 0, 0, 0, ...Buffer.from("WEBPVP8 "), 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const SVG = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
const UPLOAD_PATH = new RegExp(`^${USER_ID}/projects/[0-9a-f-]{36}\\.(webp|png)$`);

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  seedScenario(fake);
  auth.user = { id: USER_ID };
});

function put(body: unknown) {
  return PUT(
    new NextRequest(APP_URL, {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function upload(projectKey: string | null, bytes: Uint8Array<ArrayBuffer>, type = "image/webp") {
  const url = projectKey == null ? APP_URL : `${APP_URL}?project_key=${encodeURIComponent(projectKey)}`;

  return POST(new NextRequest(url, { method: "POST", body: bytes, headers: { "Content-Type": type } }));
}

function reset(projectKey: string | null) {
  const url = projectKey == null ? APP_URL : `${APP_URL}?project_key=${encodeURIComponent(projectKey)}`;

  return DELETE(new NextRequest(url, { method: "DELETE" }));
}

function repoRow(deviceId: string, projectKey: string, repoUrl: string | null, at: string, userId = USER_ID) {
  return { user_id: userId, device_id: deviceId, project_key: projectKey, repo_url: repoUrl, created_at: at, updated_at: at };
}

const publicUrl = (path: string) => `${fake.url}/storage/v1/object/public/avatars/${path}`;

describe("project profiles auth", () => {
  it("rejects every method without a session and writes nothing", async () => {
    auth.user = null;

    for (const res of [
      await GET(),
      await put({ project_key: "alpha", display_name: "Alpha" }),
      await upload("alpha", WEBP),
      await reset("alpha"),
    ]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
    expect(fake.table("token_project_profiles")).toHaveLength(0);
    expect(fake.storageObjects.size).toBe(0);
  });
});

describe("GET merged profiles", () => {
  it("prefers the manual profile, else the newest detection among non-revoked devices", async () => {
    fake.table("token_project_repos").push(
      repoRow(DEVICE_A, "alpha", "https://github.com/acme/alpha-old", "2026-11-01T00:00:00.000Z"),
      repoRow(DEVICE_B, "alpha", "https://github.com/acme/alpha", "2026-11-02T00:00:00.000Z"),
      // Newest, but the device is revoked: it drops out like every aggregate.
      repoRow(DEVICE_REVOKED, "alpha", "https://github.com/acme/alpha-revoked", "2026-11-05T00:00:00.000Z"),
      // A device's null only clears that device; the other detection stands.
      repoRow(DEVICE_A, "beta", "https://gitee.com/acme/beta", "2026-11-01T00:00:00.000Z"),
      repoRow(DEVICE_B, "beta", null, "2026-11-03T00:00:00.000Z"),
      repoRow(DEVICE_A, "gamma", "https://github.com/acme/gamma", "2026-11-01T00:00:00.000Z"),
      repoRow(DEVICE_A, "delta", "https://github.com/acme/delta", "2026-11-01T00:00:00.000Z"),
      // Another account's rows never leak.
      repoRow(DEVICE_A, "zeta", "https://github.com/other/zeta", "2026-11-01T00:00:00.000Z", OTHER_USER),
    );
    fake.table("token_project_profiles").push(
      { user_id: USER_ID, project_key: "gamma", display_name: null, repo_url: "https://git.example.test/team/gamma", repo_hidden: false, logo_url: null, logo_object: null },
      { user_id: USER_ID, project_key: "delta", display_name: null, repo_url: null, repo_hidden: true, logo_url: null, logo_object: null },
      { user_id: USER_ID, project_key: "epsilon", display_name: "Epsilon", repo_url: null, repo_hidden: false, logo_url: "https://cdn.example.test/e.png", logo_object: `${USER_ID}/projects/e.webp` },
      { user_id: OTHER_USER, project_key: "theta", display_name: "Not mine", repo_url: null, repo_hidden: false, logo_url: null, logo_object: null },
    );

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      upload_enabled: true,
      profiles: [
        { project_key: "alpha", display_name: null, repo_url: "https://github.com/acme/alpha", repo_source: "detected", detected_repo_url: "https://github.com/acme/alpha", manual_repo_url: null, repo_hidden: false, logo_url: null, logo_upload_url: null },
        { project_key: "beta", display_name: null, repo_url: "https://gitee.com/acme/beta", repo_source: "detected", detected_repo_url: "https://gitee.com/acme/beta", manual_repo_url: null, repo_hidden: false, logo_url: null, logo_upload_url: null },
        { project_key: "delta", display_name: null, repo_url: null, repo_source: null, detected_repo_url: "https://github.com/acme/delta", manual_repo_url: null, repo_hidden: true, logo_url: null, logo_upload_url: null },
        { project_key: "epsilon", display_name: "Epsilon", repo_url: null, repo_source: null, detected_repo_url: null, manual_repo_url: null, repo_hidden: false, logo_url: "https://cdn.example.test/e.png", logo_upload_url: publicUrl(`${USER_ID}/projects/e.webp`) },
        { project_key: "gamma", display_name: null, repo_url: "https://git.example.test/team/gamma", repo_source: "manual", detected_repo_url: "https://github.com/acme/gamma", manual_repo_url: "https://git.example.test/team/gamma", repo_hidden: false, logo_url: null, logo_upload_url: null },
      ],
    });
  });

  it("returns an empty list for an account without profiles", async () => {
    const res = await GET();
    expect(await res.json()).toEqual({ upload_enabled: true, profiles: [] });
  });

  it("reports upload_enabled false when the optional avatars bucket is missing", async () => {
    fake.buckets.delete("avatars");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ upload_enabled: false });
  });
});

describe("PUT manual fields", () => {
  it("validates every field before writing anything", async () => {
    const cases: Array<[unknown, string]> = [
      ["not json", "Invalid body"],
      [[], "Invalid body"],
      [{}, "Invalid project_key"],
      [{ project_key: 42 }, "Invalid project_key"],
      [{ project_key: "." }, "Invalid project_key"],
      [{ project_key: "alpha", display_name: "n".repeat(61) }, "Invalid display_name"],
      [{ project_key: "alpha", display_name: "a\u0007b" }, "Invalid display_name"],
      [{ project_key: "alpha", display_name: 5 }, "Invalid display_name"],
      [{ project_key: "alpha", repo_url: "http://example.test/a" }, "Invalid repo_url"],
      [{ project_key: "alpha", repo_url: "javascript:alert(1)" }, "Invalid repo_url"],
      [{ project_key: "alpha", repo_url: "https://exa mple.test/a" }, "Invalid repo_url"],
      [{ project_key: "alpha", repo_url: "https://fake-user:fake-pass@example.test/a" }, "Invalid repo_url"],
      [{ project_key: "alpha", repo_url: `https://example.test/${"a".repeat(500)}` }, "Invalid repo_url"],
      [{ project_key: "alpha", logo_url: "data:image/png;base64,AAAA" }, "Invalid logo_url"],
      [{ project_key: "alpha", logo_url: "ftp://example.test/logo.png" }, "Invalid logo_url"],
      [{ project_key: "alpha", repo_hidden: "yes" }, "Invalid repo_hidden"],
      [{ project_key: "alpha", clear_logo_upload: 1 }, "Invalid clear_logo_upload"],
    ];

    for (const [body, error] of cases) {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
    expect(fake.table("token_project_profiles")).toHaveLength(0);
  });

  it("saves trimmed fields, normalizes URLs and returns the merged profile", async () => {
    fake.table("token_project_repos").push(
      repoRow(DEVICE_A, "alpha", "https://github.com/acme/alpha", "2026-11-01T00:00:00.000Z"),
    );

    const res = await put({
      project_key: "alpha",
      display_name: "  Alpha 应用  ",
      repo_url: "https://Git.Example.test/team/alpha",
      logo_url: "https://cdn.example.test/alpha.png",
      repo_hidden: false,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      profile: {
        project_key: "alpha",
        display_name: "Alpha 应用",
        repo_url: "https://git.example.test/team/alpha",
        repo_source: "manual",
        detected_repo_url: "https://github.com/acme/alpha",
        manual_repo_url: "https://git.example.test/team/alpha",
        repo_hidden: false,
        logo_url: "https://cdn.example.test/alpha.png",
        logo_upload_url: null,
      },
    });
    expect(fake.table("token_project_profiles")).toHaveLength(1);
    expect(fake.table("token_project_profiles")[0]).toMatchObject({
      user_id: USER_ID,
      project_key: "alpha",
      display_name: "Alpha 应用",
      repo_url: "https://git.example.test/team/alpha",
      repo_hidden: false,
      logo_url: "https://cdn.example.test/alpha.png",
      logo_object: null,
    });

    // PUT replaces the manual fields: hiding the repo drops the detected link.
    const hidden = await put({ project_key: "alpha", display_name: "Alpha", repo_hidden: true });
    expect(await hidden.json()).toMatchObject({
      profile: { display_name: "Alpha", repo_url: null, repo_source: null, manual_repo_url: null, repo_hidden: true, logo_url: null, detected_repo_url: "https://github.com/acme/alpha" },
    });
    expect(fake.table("token_project_repos")).toHaveLength(1);
  });

  it("deletes a profile left empty, handing the link back to the detection", async () => {
    fake.table("token_project_repos").push(
      repoRow(DEVICE_A, "alpha", "https://github.com/acme/alpha", "2026-11-01T00:00:00.000Z"),
    );
    await put({ project_key: "alpha", display_name: "Alpha" });
    expect(fake.table("token_project_profiles")).toHaveLength(1);

    const res = await put({ project_key: "alpha", display_name: "   " });
    expect(res.status).toBe(200);
    expect(fake.table("token_project_profiles")).toHaveLength(0);
    expect(await res.json()).toMatchObject({
      profile: { display_name: null, repo_url: "https://github.com/acme/alpha", repo_source: "detected" },
    });
  });
});

describe("POST logo upload", () => {
  it("stores the image by signature under the owner's prefix and keeps the other fields", async () => {
    await put({ project_key: "alpha", display_name: "Alpha" });

    // The declared type is ignored: the bytes say WebP.
    const res = await upload("alpha", WEBP, "image/png");
    expect(res.status).toBe(200);
    expect([...fake.storageObjects.keys()]).toHaveLength(1);
    const [path, object] = [...fake.storageObjects.entries()][0];
    expect(path).toMatch(UPLOAD_PATH);
    expect(path.endsWith(".webp")).toBe(true);
    expect(object.type).toBe("image/webp");
    expect(new Uint8Array(object.body)).toEqual(WEBP);
    expect(await res.json()).toMatchObject({
      profile: { project_key: "alpha", display_name: "Alpha", logo_upload_url: publicUrl(path) },
    });
    expect(fake.table("token_project_profiles")[0]).toMatchObject({ display_name: "Alpha", logo_object: path });
  });

  it("replaces the previous upload and deletes the old object", async () => {
    await upload("alpha", WEBP);
    const first = [...fake.storageObjects.keys()][0];
    const res = await upload("alpha", PNG);
    expect(res.status).toBe(200);
    const keys = [...fake.storageObjects.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe(first);
    expect(keys[0]).toMatch(UPLOAD_PATH);
    expect(keys[0].endsWith(".png")).toBe(true);
    expect(fake.table("token_project_profiles")[0].logo_object).toBe(keys[0]);
  });

  it("rejects bad uploads without storing anything", async () => {
    const oversize = new Uint8Array(512 * 1024 + 1);
    oversize.set(WEBP);
    const cases: Array<[Response, number, string]> = [
      [await upload(null, WEBP), 400, "Invalid project_key"],
      [await upload("alpha", new Uint8Array(0)), 400, "Empty logo"],
      [await upload("alpha", JPEG, "image/jpeg"), 415, "Unsupported image type"],
      [await upload("alpha", SVG, "image/svg+xml"), 415, "Unsupported image type"],
      [await upload("alpha", oversize), 413, "Logo too large"],
    ];

    for (const [res, status, error] of cases) {
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error });
    }
    expect(fake.storageObjects.size).toBe(0);
    expect(fake.table("token_project_profiles")).toHaveLength(0);
  });

  it("answers 503 when the avatars bucket is missing", async () => {
    fake.buckets.delete("avatars");
    const res = await upload("alpha", WEBP);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Logo upload unavailable" });
    expect(fake.table("token_project_profiles")).toHaveLength(0);
  });

  it("PUT clear_logo_upload drops the uploaded object", async () => {
    await upload("alpha", WEBP);
    expect(fake.storageObjects.size).toBe(1);

    const res = await put({ project_key: "alpha", display_name: "Alpha", clear_logo_upload: true });
    expect(res.status).toBe(200);
    expect(fake.storageObjects.size).toBe(0);
    expect(await res.json()).toMatchObject({ profile: { display_name: "Alpha", logo_upload_url: null } });
    expect(fake.table("token_project_profiles")[0].logo_object).toBeNull();
  });
});

describe("DELETE reset", () => {
  it("removes the manual profile and its upload but keeps the CLI detection", async () => {
    fake.table("token_project_repos").push(
      repoRow(DEVICE_A, "alpha", "https://github.com/acme/alpha", "2026-11-01T00:00:00.000Z"),
    );
    await put({ project_key: "alpha", display_name: "Alpha", repo_url: "https://git.example.test/team/alpha" });
    await upload("alpha", WEBP);

    const res = await reset("alpha");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      profile: {
        project_key: "alpha",
        display_name: null,
        repo_url: "https://github.com/acme/alpha",
        repo_source: "detected",
        detected_repo_url: "https://github.com/acme/alpha",
        manual_repo_url: null,
        repo_hidden: false,
        logo_url: null,
        logo_upload_url: null,
      },
    });
    expect(fake.table("token_project_profiles")).toHaveLength(0);
    expect(fake.storageObjects.size).toBe(0);
    expect(fake.table("token_project_repos")).toHaveLength(1);
  });

  it("rejects a missing project_key", async () => {
    const res = await reset(null);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid project_key" });
  });
});
