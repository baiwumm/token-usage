import { describe, expect, it } from "vitest";

import {
  parseProjectProfiles,
  profileDisplayName,
  profileLogoUrl,
  profileLogoUrls,
} from "@/lib/project-profiles";

// Fabricated contract payloads (docs/cli-contract.md §2.13) — never real data.
const PAYLOAD = JSON.stringify({
  profiles: [
    {
      project_key: "token-usage",
      display_name: "Token Usage",
      repo_url: "https://github.com/baiwumm/token-usage",
      repo_source: "manual",
      detected_repo_url: "https://github.com/baiwumm/token-usage",
      manual_repo_url: "https://github.com/baiwumm/token-usage",
      repo_hidden: false,
      logo_url: "https://example.test/logo.png",
      logo_upload_url: "https://example.test/storage/logo.png",
    },
    {
      project_key: "bare-key",
      display_name: null,
      repo_url: null,
      repo_source: null,
      detected_repo_url: null,
      manual_repo_url: null,
      repo_hidden: false,
      logo_url: null,
      logo_upload_url: null,
    },
  ],
});

describe("parseProjectProfiles (§2.13 payload)", () => {
  it("parses the single-line CLI payload into a keyed map", () => {
    const map = parseProjectProfiles(PAYLOAD);

    expect(map.size).toBe(2);
    expect(map.get("token-usage")?.display_name).toBe("Token Usage");
    expect(map.get("bare-key")?.display_name).toBeNull();
  });

  it("degrades to an empty map on malformed stdout", () => {
    expect(parseProjectProfiles("not json").size).toBe(0);
    expect(parseProjectProfiles("").size).toBe(0);
    expect(parseProjectProfiles('{"profiles": "nope"}').size).toBe(0);
  });

  it("skips entries without a project_key", () => {
    const map = parseProjectProfiles(
      JSON.stringify({ profiles: [{ display_name: "x" }] }),
    );

    expect(map.size).toBe(0);
  });

  it("orders logo candidates like the web: typed URL first, then the upload", () => {
    const map = parseProjectProfiles(PAYLOAD);
    const profile = map.get("token-usage") ?? null;

    expect(profileLogoUrls(profile)).toEqual([
      "https://example.test/logo.png",
      "https://example.test/storage/logo.png",
    ]);
    expect(profileLogoUrl(profile)).toBe("https://example.test/logo.png");
    expect(profileLogoUrl(map.get("bare-key") ?? null)).toBeNull();
    expect(profileLogoUrls(map.get("bare-key") ?? null)).toEqual([]);
    expect(profileLogoUrl(null)).toBeNull();
    expect(profileDisplayName(map.get("bare-key") ?? null)).toBeNull();
  });
});
