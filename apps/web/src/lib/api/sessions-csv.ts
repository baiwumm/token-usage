// CSV export for account-sessions (docs/cli-contract.md §2.7). The builder is
// pure so the row/byte caps, RFC4180 escaping and header order are unit-tested
// without going through HTTP.

export const SESSIONS_CSV_MAX_ROWS = 10_000;
export const SESSIONS_CSV_MAX_BYTES = 4 * 1024 * 1024;
export const SESSIONS_CSV_BOM = "\uFEFF";

export interface SessionsCsvModel {
  model: string;
  total_tokens: number;
  total_cost_usd: string;
}

export interface SessionsCsvItem {
  device_name: string;
  source: string;
  project_key: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  input_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
  billable_total_tokens: number | null;
  credits: number;
  total_cost_usd: string;
  models: SessionsCsvModel[];
}

export const SESSIONS_CSV_HEADER = [
  "ended_at",
  "started_at",
  "source",
  "project_key",
  "device_name",
  "duration_ms",
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
  "billable_total_tokens",
  "credits",
  "total_cost_usd",
  "models",
] as const;

const encoder = new TextEncoder();

// Excel treats these leading characters as formulas. A leading apostrophe keeps
// the cell literal; the value itself is otherwise unchanged for CSV consumers.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(raw: string): string {
  const text = FORMULA_START.test(raw) ? `'${raw}` : raw;

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function row(item: SessionsCsvItem): string {
  const models = JSON.stringify(
    item.models.map((model) => ({
      model: model.model,
      total_tokens: model.total_tokens,
      total_cost_usd: model.total_cost_usd,
    })),
  );

  return [
    item.ended_at,
    item.started_at,
    item.source,
    item.project_key ?? "",
    item.device_name,
    String(item.duration_ms),
    String(item.input_tokens),
    String(item.cached_input_tokens),
    String(item.cache_creation_input_tokens),
    String(item.output_tokens),
    String(item.reasoning_output_tokens),
    String(item.total_tokens),
    item.billable_total_tokens == null
      ? ""
      : String(item.billable_total_tokens),
    String(item.credits),
    item.total_cost_usd,
    models,
  ]
    .map(cell)
    .join(",");
}

/**
 * Serialises the filtered sessions in their existing order (ended_at desc).
 * `limit`/`offset` are deliberately not part of the export: the CSV always
 * covers the full filtered set, cut only by the row and byte caps.
 */
export function buildSessionsCsv(
  items: readonly SessionsCsvItem[],
  limits: { rows?: number; bytes?: number } = {},
): { csv: string; total: number; exported: number; truncated: boolean } {
  const maxRows = limits.rows ?? SESSIONS_CSV_MAX_ROWS;
  const maxBytes = limits.bytes ?? SESSIONS_CSV_MAX_BYTES;
  const header = `${SESSIONS_CSV_BOM}${SESSIONS_CSV_HEADER.join(",")}\r\n`;

  let csv = header;
  let bytes = encoder.encode(header).byteLength;
  let exported = 0;

  for (const item of items) {
    if (exported >= maxRows) break;

    const line = `${row(item)}\r\n`;
    const lineBytes = encoder.encode(line).byteLength;

    if (bytes + lineBytes > maxBytes) break;

    csv += line;
    bytes += lineBytes;
    exported += 1;
  }

  return {
    csv,
    total: items.length,
    exported,
    truncated: exported < items.length,
  };
}
