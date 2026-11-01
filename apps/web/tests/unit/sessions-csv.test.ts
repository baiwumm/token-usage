import { describe, expect, it } from "vitest";

import {
  buildSessionsCsv,
  SESSIONS_CSV_BOM,
  SESSIONS_CSV_HEADER,
  SESSIONS_CSV_MAX_BYTES,
  SESSIONS_CSV_MAX_ROWS,
  type SessionsCsvItem,
} from "@/lib/api/sessions-csv";

function item(over: Partial<SessionsCsvItem> = {}): SessionsCsvItem {
  return {
    device_name: "PC One",
    source: "codex",
    project_key: "proj-a",
    started_at: "2026-10-21T10:00:00.000Z",
    ended_at: "2026-10-21T10:30:00.000Z",
    duration_ms: 1_800_000,
    input_tokens: 100,
    cached_input_tokens: 20,
    cache_creation_input_tokens: 5,
    output_tokens: 30,
    reasoning_output_tokens: 10,
    total_tokens: 165,
    billable_total_tokens: null,
    credits: 0,
    total_cost_usd: "0.001000",
    models: [
      { model: "gpt-5", total_tokens: 165, total_cost_usd: "0.001000" },
    ],
    ...over,
  };
}

function bodyOf(csv: string): string[] {
  return csv.slice(SESSIONS_CSV_BOM.length).trimEnd().split("\r\n");
}

describe("sessions CSV builder", () => {
  it("writes a BOM, the frozen header and CRLF rows", () => {
    const result = buildSessionsCsv([item()]);
    const lines = bodyOf(result.csv);

    expect(result.csv.startsWith(SESSIONS_CSV_BOM)).toBe(true);
    expect(lines[0]).toBe(SESSIONS_CSV_HEADER.join(","));
    expect(lines).toHaveLength(2);
    expect(result.csv.endsWith("\r\n")).toBe(true);
    expect(result.exported).toBe(1);
    expect(result.total).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("keeps a null billable cell empty and serialises models as JSON", () => {
    const line = bodyOf(buildSessionsCsv([item()]).csv)[1];

    expect(line).toContain(",165,,0,0.001000,");
    expect(line).toContain('""model"":""gpt-5""');
    expect(line).toContain('""total_tokens"":165');
  });

  it("quotes commas/quotes/newlines and defuses formula prefixes", () => {
    const line = bodyOf(
      buildSessionsCsv([
        item({
          project_key: "=SUM(1,2)",
          device_name: 'PC "One"',
        }),
      ]).csv,
    )[1];

    expect(line).toContain(`"'=SUM(1,2)"`);
    expect(line).toContain(`"PC ""One"""`);
  });

  it("caps the row count and reports the truncation", () => {
    const items = [item(), item(), item(), item()];
    const result = buildSessionsCsv(items, { rows: 3 });

    expect(result.exported).toBe(3);
    expect(result.total).toBe(4);
    expect(result.truncated).toBe(true);
    expect(bodyOf(result.csv)).toHaveLength(4);
  });

  it("caps the byte budget and never exceeds it", () => {
    const items = Array.from({ length: 5 }, (_, index) =>
      item({ project_key: `${index}${"x".repeat(300)}` }),
    );
    const result = buildSessionsCsv(items, { bytes: 1_024 });
    const bytes = new TextEncoder().encode(result.csv).byteLength;

    expect(result.truncated).toBe(true);
    expect(result.exported).toBeLessThan(items.length);
    expect(bytes).toBeLessThanOrEqual(1_024);
  });

  it("publishes the documented default caps", () => {
    expect(SESSIONS_CSV_MAX_ROWS).toBe(10_000);
    expect(SESSIONS_CSV_MAX_BYTES).toBe(4 * 1024 * 1024);
  });
});
