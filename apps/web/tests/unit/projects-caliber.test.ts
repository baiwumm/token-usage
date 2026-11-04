// Guards for the projects caliber switch (docs/projects-page-plan.md §5):
// which endpoint the UI reads, and the caliber-specific copy that must not
// describe the wrong data source.

import { afterEach, describe, expect, it, vi } from "vitest";

import { PROJECTS_COPY } from "@/lib/copy/projects";
import { SESSIONS_COPY } from "@/lib/copy/sessions";
import { projectsCaliber } from "@/lib/dashboard/api";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("projectsCaliber", () => {
  it("defaults to sessions and flips only on the exact hourly value", () => {
    expect(projectsCaliber()).toBe("sessions");

    vi.stubEnv("NEXT_PUBLIC_PROJECTS_CALIBER", "hourly");
    expect(projectsCaliber()).toBe("hourly");

    vi.stubEnv("NEXT_PUBLIC_PROJECTS_CALIBER", "Hourly");
    expect(projectsCaliber()).toBe("sessions");
  });
});

describe("projects copy per caliber", () => {
  it("keeps a distinct scope note for each caliber", () => {
    for (const locale of ["zh", "en"] as const) {
      expect(PROJECTS_COPY[locale].scopeNote.sessions).not.toBe(
        PROJECTS_COPY[locale].scopeNote.hourly,
      );
    }

    expect(PROJECTS_COPY.zh.scopeNote.hourly).toContain("用量桶");
    expect(PROJECTS_COPY.zh.scopeNote.hourly).toContain("未归因");
    expect(PROJECTS_COPY.zh.scopeNote.sessions).toContain("session sidecar");
  });

  it("explains credits-only sources on both calibers and on sessions", () => {
    for (const locale of ["zh", "en"] as const) {
      for (const caliber of ["sessions", "hourly"] as const) {
        expect(PROJECTS_COPY[locale].scopeNote[caliber]).toMatch(/credits-only/i);
        expect(PROJECTS_COPY[locale].scopeNote[caliber]).toContain("qoder-cn");
      }
      expect(SESSIONS_COPY[locale].list.hint).toMatch(/credits-only/i);
      expect(SESSIONS_COPY[locale].list.hint).toContain("qoder-cn");
    }
  });

  it("labels the hourly session count as non-deduplicated bucket entries", () => {
    expect(PROJECTS_COPY.zh.list.sessions).toBe("会话数");
    expect(PROJECTS_COPY.zh.list.sessionsHourly).toBe("会话条目");
    expect(PROJECTS_COPY.zh.list.hintHourly).toContain("并非去重");
    expect(PROJECTS_COPY.en.list.sessionsHourly).toBe("Session entries");
  });
});
