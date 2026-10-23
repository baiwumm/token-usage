// In-memory PostgREST + Supabase Auth emulator for contract tests.
//
// Implements exactly the surface the route handlers use — select filters
// (eq/is/gt), order/limit/offset, insert with unique-constraint 409s, upsert
// (resolution=merge-duplicates), update with returning, and /auth/v1/user —
// so golden tests exercise the real handlers against realistic DB semantics
// (including last-wins upserts) without a live Supabase project.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;

type UniqueConstraint = {
  name: string;
  columns: string[];
  partial?: (row: Row) => boolean;
};

type TableDef = {
  rows: Row[];
  unique: UniqueConstraint[];
  generate?: string[]; // columns filled with defaults when missing
};

const now = () => new Date().toISOString();

function defaultTables(): Record<string, TableDef> {
  return {
    token_devices: {
      rows: [],
      generate: ["id", "created_at", "updated_at"],
      unique: [
        { name: "token_devices_machine_unique", columns: ["user_id", "machine_id"], partial: (r) => r.revoked_at == null },
        {
          name: "token_devices_active_unique",
          columns: ["user_id", "platform", "device_name"],
          partial: (r) => r.revoked_at == null,
        },
      ],
    },
    token_device_tokens: {
      rows: [],
      generate: ["id", "created_at"],
      unique: [{ name: "token_device_tokens_token_hash_key", columns: ["token_hash"] }],
    },
    token_device_codes: {
      rows: [],
      generate: ["created_at"],
      unique: [
        { name: "token_device_codes_pkey", columns: ["device_code"] },
        { name: "token_device_codes_user_code_key", columns: ["user_code"] },
      ],
    },
    token_usage_hourly: {
      rows: [],
      generate: ["created_at", "updated_at"],
      unique: [
        {
          name: "token_usage_hourly_pkey",
          columns: ["user_id", "device_id", "hour_start", "source", "model"],
        },
      ],
    },
    token_account_session_states: {
      rows: [],
      generate: ["created_at", "updated_at"],
      unique: [{ name: "token_account_session_states_pkey", columns: ["user_id", "source", "session_id"] }],
    },
    token_allowed_emails: { rows: [], generate: ["created_at"], unique: [{ name: "token_allowed_emails_email_key", columns: ["email"] }] },
  };
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function matchesFilter(row: Row, column: string, operator: string, value: string): boolean {
  const cell = row[column];
  switch (operator) {
    case "eq":
      return cell != null && String(cell) === value;
    case "neq":
      return cell == null || String(cell) !== value;
    case "gt":
      return cell != null && compareValues(cell, value) > 0;
    case "gte":
      return cell != null && compareValues(cell, value) >= 0;
    case "lt":
      return cell != null && compareValues(cell, value) < 0;
    case "is":
      if (value === "null") return cell == null;
      if (value === "not.null") return cell != null;
      return String(cell) === value;
    default:
      return false;
  }
}

export class FakeSupabase {
  private server: Server | null = null;
  private port = 0;
  tables = defaultTables();
  // device token → auth user accepted by /auth/v1/user
  authUsers = new Map<string, { id: string; email: string | null }>();
  // Test hook: force N inserts into a table to fail with 409 (unique violation).
  conflictInjection: { table: string; times: number } | null = null;

  async listen(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch((error) => {
        res.statusCode = 500;
        res.end(JSON.stringify({ message: String(error) }));
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    this.port = typeof address === "object" && address ? address.port : 0;
    return `http://127.0.0.1:${this.port}`;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  reset(): void {
    this.tables = defaultTables();
    this.conflictInjection = null;
  }

  table(name: string): Row[] {
    return this.tables[name]?.rows ?? [];
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  }

  private applyDefaults(table: TableDef, row: Row): Row {
    const out = { ...row };
    for (const column of table.generate ?? []) {
      if (out[column] == null) {
        if (column === "id") out[column] = randomUUID();
        else out[column] = now();
      }
    }
    return out;
  }

  private findUniqueViolation(table: TableDef, candidate: Row, skipIndex = -1): UniqueConstraint | null {
    for (let c = 0; c < table.unique.length; c++) {
      const constraint = table.unique[c];
      const offending = table.rows.some((existing, index) => {
        if (index === skipIndex) return false;
        if (constraint.partial && !constraint.partial(existing)) return false;
        if (constraint.partial && !constraint.partial(candidate)) return false;
        return constraint.columns.every((col) => existing[col] === candidate[col]);
      });
      if (offending) return constraint;
    }
    return null;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(String(req.url), "http://localhost");
    const path = url.pathname;

    if (path === "/auth/v1/user" && req.method === "GET") {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const user = this.authUsers.get(token);
      if (!user) return this.json(res, 401, { message: "Invalid token" });
      return this.json(res, 200, { id: user.id, email: user.email, aud: "authenticated" });
    }

    const restMatch = path.match(/^\/rest\/v1\/([^/]+)$/);
    if (!restMatch) return this.json(res, 404, { message: `Not found: ${path}` });
    const table = decodeURIComponent(restMatch[1]);

    if (table === "rpc") return this.json(res, 200, {});

    const def = this.tables[table];
    if (!def) return this.json(res, 404, { message: `Unknown table ${table}` });

    if (req.method === "GET") return this.handleSelect(def, url, res);
    if (req.method === "POST") return this.handleInsert(def, table, url, req, res);
    if (req.method === "PATCH") return this.handleUpdate(def, url, req, res);
    return this.json(res, 405, { message: "Method not allowed" });
  }

  private parseFilters(url: URL): Array<[string, string, string]> {
    // PostgREST filter syntax: ?column=operator.value (operator lives in the
    // value, dot-separated once).
    const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);
    const filters: Array<[string, string, string]> = [];
    for (const [column, rawValue] of url.searchParams.entries()) {
      if (reserved.has(column)) continue;
      const dot = rawValue.indexOf(".");
      if (dot < 0) continue;
      filters.push([column, rawValue.slice(0, dot), rawValue.slice(dot + 1)]);
    }
    return filters;
  }

  private handleSelect(def: TableDef, url: URL, res: ServerResponse): void {
    const filters = this.parseFilters(url);
    let rows = def.rows.filter((row) =>
      filters.every(([col, op, value]) => matchesFilter(row, col, op, value)),
    );

    const order = url.searchParams.get("order");
    if (order) {
      const keys = order.split(",").map((part) => {
        const [col, dir] = part.split(".");
        return { col, dir: dir === "desc" ? -1 : 1 };
      });
      rows = [...rows].sort((a, b) => {
        for (const { col, dir } of keys) {
          const cmp = compareValues(a[col], b[col]);
          if (cmp !== 0) return cmp * dir;
        }
        return 0;
      });
    }

    const offset = url.searchParams.get("offset");
    const limit = url.searchParams.get("limit");
    if (offset != null) rows = rows.slice(Number(offset));
    if (limit != null) rows = rows.slice(0, Number(limit));

    this.json(res, 200, rows);
  }

  private async handleInsert(
    def: TableDef,
    table: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const prefer = String(req.headers.prefer || "");
    const returning = prefer.includes("return=representation");
    const mergeDuplicates = prefer.includes("resolution=merge-duplicates");
    const conflictColumns = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);

    let payload: Row[];
    try {
      payload = JSON.parse(await this.readBody(req));
    } catch {
      return this.json(res, 400, { message: "Invalid JSON body" });
    }
    if (!Array.isArray(payload)) payload = [payload];

    if (this.conflictInjection && this.conflictInjection.table === table && this.conflictInjection.times > 0) {
      this.conflictInjection.times -= 1;
      return this.json(res, 409, {
        message: 'duplicate key value violates unique constraint "injected"',
        code: "23505",
      });
    }

    const affected: Row[] = [];
    for (const raw of payload) {
      const candidate = this.applyDefaults(def, raw);
      if (mergeDuplicates && conflictColumns.length > 0) {
        const existing = def.rows.find((row) =>
          conflictColumns.every((col) => row[col] === candidate[col]),
        );
        if (existing) {
          Object.assign(existing, candidate);
          affected.push(existing);
          continue;
        }
      }
      const violation = this.findUniqueViolation(def, candidate);
      if (violation) {
        return this.json(res, 409, {
          message: `duplicate key value violates unique constraint "${violation.name}"`,
          code: "23505",
        });
      }
      def.rows.push(candidate);
      affected.push(candidate);
    }

    this.json(res, mergeDuplicates ? 200 : 201, returning ? affected : null);
  }

  private async handleUpdate(
    def: TableDef,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const prefer = String(req.headers.prefer || "");
    const returning = prefer.includes("return=representation");
    const filters = this.parseFilters(url);
    let patch: Row;
    try {
      patch = JSON.parse(await this.readBody(req));
    } catch {
      return this.json(res, 400, { message: "Invalid JSON body" });
    }

    const updated: Row[] = [];
    for (const row of def.rows) {
      if (!filters.every(([col, op, value]) => matchesFilter(row, col, op, value))) continue;
      Object.assign(row, patch);
      updated.push(row);
    }
    this.json(res, 200, returning ? updated : null);
  }
}
