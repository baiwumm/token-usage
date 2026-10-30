// In-memory PostgREST + Supabase Auth emulator for contract tests.
//
// Implements exactly the surface the route handlers use — select filters
// (eq/is/gt), order/limit/offset, insert with unique-constraint 409s, upsert
// (resolution=merge-duplicates), update with returning, and /auth/v1/user —
// so golden tests exercise the real handlers against realistic DB semantics
// (including last-wins upserts) without a live Supabase project.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;

export interface AuthUserRecord {
	id: string;
	email: string;
}

export interface IssuedSession {
	accessToken: string;
	refreshToken: string;
	userId: string;
	grant: string;
}

export interface OtpChallenge {
	authCode: string;
	email: string;
	challenge: string;
}

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
    token_sessions: {
      rows: [],
      generate: ["id", "created_at", "updated_at"],
      unique: [
        {
          name: "token_sessions_user_id_device_id_source_session_id_key",
          columns: ["user_id", "device_id", "source", "session_id"],
        },
      ],
    },
    token_sync_runs: {
      rows: [],
      generate: ["id", "created_at", "updated_at"],
      unique: [
        {
          name: "token_sync_runs_user_id_device_id_run_id_key",
          columns: ["user_id", "device_id", "run_id"],
        },
      ],
    },
    token_achievement_seen: {
      rows: [],
      generate: ["created_at", "updated_at"],
      unique: [{ name: "token_achievement_seen_pkey", columns: ["user_id"] }],
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
  // Supabase Auth surface (M2): email+password accounts, refresh tokens,
  // pending PKCE magic-link challenges, and every session minted so far.
  authPasswordUsers = new Map<string, AuthUserRecord & { password: string }>();
  usersByEmail = new Map<string, AuthUserRecord>();
  refreshTokens = new Map<string, AuthUserRecord>();
  otpChallenges = new Map<string, OtpChallenge>();
  issuedSessions: IssuedSession[] = [];
  // Most recent magic-link request, exposed so tests can play the role of the
  // email body (the auth code the user would click).
  lastOtp: OtpChallenge | null = null;
  // Test hook: force N inserts into a table to fail with 409 (unique violation).
  conflictInjection: { table: string; times: number } | null = null;

  reset(): void {
    this.tables = defaultTables();
    this.conflictInjection = null;
    this.authUsers.clear();
    this.authPasswordUsers.clear();
    this.usersByEmail.clear();
    this.refreshTokens.clear();
    this.otpChallenges.clear();
    this.issuedSessions = [];
    this.lastOtp = null;
  }

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

  table(name: string): Row[] {
    return this.tables[name]?.rows ?? [];
  }

  // ---- Supabase Auth surface (M2) -------------------------------------

  /** Register an email+password account (and make the user resolvable). */
  registerPasswordUser(email: string, password: string, id = randomUUID()): AuthUserRecord {
    const record = { id, email, password };

    this.authPasswordUsers.set(email, record);
    this.usersByEmail.set(email, { id, email });

    return record;
  }

  private base64url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  /** Mint a 3-part JWT access token bound to the user (GoTrue-shaped). */
  private mintAccessToken(user: AuthUserRecord): string {
    const header = this.base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = this.base64url(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    return `${header}.${payload}.fakesig`;
  }

  /**
   * Issue a full session for the user: access token resolvable by
   * /auth/v1/user, refresh token accepted by grant_type=refresh_token.
   */
  mintSession(user: AuthUserRecord, grant: string): IssuedSession {
    const accessToken = this.mintAccessToken(user);
    const refreshToken = `fake-refresh-${randomUUID()}`;

    this.authUsers.set(accessToken, { id: user.id, email: user.email });
    this.refreshTokens.set(refreshToken, user);
    const session = { accessToken, refreshToken, userId: user.id, grant };

    this.issuedSessions.push(session);

    return session;
  }

  private goTrueUser(user: AuthUserRecord): Row {
    return {
      id: user.id,
      aud: "authenticated",
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private sessionPayload(session: IssuedSession, user: AuthUserRecord): Row {
    return {
      access_token: session.accessToken,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: session.refreshToken,
      user: this.goTrueUser(user),
    };
  }

  private async readJsonBody(req: IncomingMessage): Promise<Row> {
    const raw = await this.readBody(req);

    try {
      return JSON.parse(raw) as Row;
    } catch {
      return {};
    }
  }

  private invalidGrant(res: ServerResponse, description: string): void {
    this.json(res, 400, { error: "invalid_grant", error_description: description });
  }

  private async handleOtp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readJsonBody(req);
    const email = String(body.email || "").trim();

    if (!email) return this.invalidGrant(res, "Email is required");

    // GoTrue magic-link PKCE: the email carries the S256 challenge; the
    // returned auth code is what the user would click in the email body.
    const authCode = randomUUID().replace(/-/g, "");
    const otp: OtpChallenge = {
      authCode,
      email,
      challenge: String(body.code_challenge || ""),
    };

    this.otpChallenges.set(authCode, otp);
    this.lastOtp = otp;

    return this.json(res, 200, {});
  }

  private async handleTokenGrant(
    grantType: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.readJsonBody(req);

    if (grantType === "password") {
      const email = String(body.email || "").trim();
      const account = this.authPasswordUsers.get(email);

      if (!account || account.password !== String(body.password || "")) {
        return this.invalidGrant(res, "Invalid login credentials");
      }

      return this.json(res, 200, this.sessionPayload(this.mintSession(account, grantType), account));
    }

    if (grantType === "pkce") {
      const authCode = String(body.auth_code || "");
      const otp = this.otpChallenges.get(authCode);

      if (!otp) return this.invalidGrant(res, "Invalid flow state, no valid flow found");

      const expected = createHash("sha256").update(String(body.code_verifier || "")).digest("base64url");

      if (expected !== otp.challenge) {
        return this.invalidGrant(res, "PKCE code verifier does not match");
      }
      this.otpChallenges.delete(authCode);

      const user = this.usersByEmail.get(otp.email) ?? { id: randomUUID(), email: otp.email };

      this.usersByEmail.set(user.email, user);

      return this.json(res, 200, this.sessionPayload(this.mintSession(user, grantType), user));
    }

    if (grantType === "refresh_token") {
      const refreshToken = String(body.refresh_token || "");
      const user = this.refreshTokens.get(refreshToken);

      if (!user) return this.invalidGrant(res, "Invalid Refresh Token");
      this.refreshTokens.delete(refreshToken);

      return this.json(res, 200, this.sessionPayload(this.mintSession(user, grantType), user));
    }

    return this.invalidGrant(res, `Unsupported grant type: ${grantType || "(none)"}`);
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

    if (path === "/auth/v1/logout" && req.method === "POST") {
      return this.json(res, 204, null);
    }

    if (path === "/auth/v1/otp" && req.method === "POST") {
      return this.handleOtp(req, res);
    }

    if (path === "/auth/v1/token" && req.method === "POST") {
      return this.handleTokenGrant(url.searchParams.get("grant_type") || "", req, res);
    }

    const restMatch = path.match(/^\/rest\/v1\/([^/]+)$/);
    const rpcMatch = path.match(/^\/rest\/v1\/rpc\/([^/]+)$/);

    if (rpcMatch) {
      if (req.method !== "POST") return this.json(res, 405, { message: "Method not allowed" });
      return this.handleRpc(decodeURIComponent(rpcMatch[1]), req, res);
    }

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

  // token_upsert_sessions: strict ended_at last-wins, mirroring the migration's
  // conditional upsert and its {upserted, skipped} return value.
  private async handleRpc(
    name: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (name !== "token_upsert_sessions") {
      return this.json(res, 404, { message: `Unknown function ${name}` });
    }

    const body = await this.readJsonBody(req);
    const userId = String(body.p_user_id ?? "");
    const deviceId = String(body.p_device_id ?? "");
    const sessions = Array.isArray(body.p_sessions) ? (body.p_sessions as Row[]) : [];
    const def = this.tables.token_sessions;
    let upserted = 0;

    for (const entry of sessions) {
      const candidate = this.applyDefaults(def, {
        user_id: userId,
        device_id: deviceId,
        source: entry.source,
        session_id: entry.session_id,
        project_key: entry.project_key ?? null,
        started_at: entry.started_at,
        ended_at: entry.ended_at,
        input_tokens: entry.input_tokens,
        cached_input_tokens: entry.cached_input_tokens,
        cache_creation_input_tokens: entry.cache_creation_input_tokens,
        output_tokens: entry.output_tokens,
        reasoning_output_tokens: entry.reasoning_output_tokens,
        total_tokens: entry.total_tokens,
        billable_total_tokens: entry.billable_total_tokens ?? null,
        models: entry.models ?? [],
      });
      const existing = def.rows.find(
        (row) =>
          row.user_id === candidate.user_id &&
          row.device_id === candidate.device_id &&
          row.source === candidate.source &&
          row.session_id === candidate.session_id,
      );

      if (!existing) {
        def.rows.push(candidate);
        upserted += 1;
        continue;
      }
      if (String(candidate.ended_at) > String(existing.ended_at)) {
        const createdAt = existing.created_at;

        Object.assign(existing, candidate, { created_at: createdAt });
        upserted += 1;
      }
    }

    this.json(res, 200, { upserted, skipped: sessions.length - upserted });
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
