const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { openTraeSnapshot } = require("./trae-snapshot");
const { withTraeSqlite } = require("./trae-sqlite");

const TOKEN_FIELDS = [
  "prompt_tokens", "prompt_tokens_total", "input_tokens",
  "completion_tokens", "completion_tokens_total", "output_tokens",
  "total_tokens", "cache_read_input_tokens", "cache_creation_input_tokens",
  "reasoning_tokens", "reasoning_output_tokens",
];

function resolveTraeDbPaths(env = process.env, { platform = process.platform, home = os.homedir() } = {}) {
  const explicit = String(env.TOKENUSAGE_TRAE_DB || "").trim();
  if (explicit) return [path.resolve(explicit)];
  const customHome = String(env.TOKENUSAGE_TRAE_HOME || "").trim();
  const parent = platform === "win32"
    ? env.APPDATA || path.join(home, "AppData", "Roaming")
    : platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : env.XDG_CONFIG_HOME || path.join(home, ".config");
  // The CN IDE build installs as "Trae CN" with the same ModularData schema;
  // its database joins the same source ledger as a separate store (per-store
  // turn identity in parseTraeIncremental), so no separate source id is needed.
  const roots = customHome
    ? [customHome]
    : [path.join(parent, "Trae"), path.join(parent, "TRAE SOLO"), path.join(parent, "Trae CN")];
  const result = [];
  for (const root of roots) {
    // A decrypted sibling may be an old export. Only an explicit DB override
    // opts into one; normal discovery always reads the current application DB.
    for (const module of ["ai-agent", "ai-chat"]) {
      const candidate = path.resolve(root, "ModularData", module, "database.db");
      let present;
      try { present = fs.statSync(candidate).isFile(); }
      catch (err) {
        // Permission failures must reach the reader's diagnostics, not masquerade
        // as an absent installation and silently drop an entire usage history.
        present = err.code !== "ENOENT" && err.code !== "ENOTDIR";
      }
      if (present) {
        result.push(candidate);
        break;
      }
    }
  }
  return [...new Set(result)];
}

function error(message) {
  return new Error(`Cannot read TRAE usage: ${message}`);
}

async function projectTurnUsage(queryRows) {
  const tables = await queryRows("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_turn'");
  // history_v2.token_usage can be a context-size snapshot rather than billed
  // usage. Do not synthesize input tokens from those scalar values.
  if (!tables.length) return null;
  const columns = new Set((await queryRows("PRAGMA table_info(chat_turn)")).map((row) => row.name));
  if (!columns.has("context") || (!columns.has("created_at") && !columns.has("updated_at"))) {
    throw error("unsupported chat_turn schema.");
  }
  const column = (name, fallback = "NULL") => columns.has(name) ? `"${name}"` : fallback;
  const date = columns.has("created_at") && columns.has("updated_at")
    ? 'COALESCE("created_at", "updated_at")' : column("created_at", column("updated_at"));
  const modelPaths = [
    "persist_user_message_context.model_info.display_model_name",
    "persist_user_message_context.model_info.model_name",
    "persist_user_message_context.model_info.config_name", "model_name", "model",
    "agent_model", "selected_model.name", "selectedModel.name",
  ];
  const model = modelPaths.map((field) => `CASE WHEN json_type(context, '$.${field}') = 'text'
    THEN NULLIF(NULLIF(TRIM(json_extract(context, '$.${field}')), ''), '-') END`);
  const fields = TOKEN_FIELDS.map((field) => `CASE
    WHEN json_type(context, '$.token_usage.${field}') IN ('integer', 'real')
    THEN json_extract(context, '$.token_usage.${field}') END AS "${field}"`);
  const invalidFields = TOKEN_FIELDS.map((field) =>
    `COALESCE(json_type(context, '$.token_usage.${field}') NOT IN ('integer', 'real', 'null'), 0)`);
  // Project inside SQLite: prompts, messages, session titles, fee/account data,
  // and the rest of the context never cross into JS results or cursor state.
  const query = `SELECT CAST(${column("id", "rowid")} AS TEXT) AS id,
    ${column("session_id")} AS session_id, ${column("turn_id")} AS turn_id,
    ${date} AS created_at, ${column("updated_at")} AS updated_at,
    COALESCE(${model.join(", ")}, 'trae-unknown') AS model,
    ${fields.join(", ")}, (${invalidFields.join(" OR ")}) AS invalid_usage
    FROM chat_turn WHERE CASE WHEN json_valid(context)
      THEN json_type(context, '$.token_usage') = 'object' ELSE 0 END`;
  return (await queryRows(query)).map((row) => {
    const usage = {};
    let invalid = Boolean(row.invalid_usage);
    for (const field of TOKEN_FIELDS) {
      const value = row[field];
      if (value == null) continue;
      if (!Number.isSafeInteger(value) || value < 0) invalid = true;
      else usage[field] = value;
    }
    return {
      id: row.id, session_id: row.session_id, turn_id: row.turn_id,
      created_at: row.created_at, updated_at: row.updated_at,
      model: row.model, usage: invalid ? null : usage,
    };
  });
}

// One row per model request. TRAE's chat_turn snapshot keeps only the last
// request of a turn, while an agent turn can issue dozens of requests, so this
// table is the primary usage source. exact_* counters live in extra_info and
// use the same semantics as chat_turn (completion includes reasoning).
async function projectRequestUsage(queryRows) {
  const tables = await queryRows("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'server_history_info'");
  if (!tables.length) return null;
  const columns = new Set((await queryRows("PRAGMA table_info(server_history_info)")).map((row) => row.name));
  const required = ["history_id", "extra_info", "source", "created_at"];
  if (!required.every((name) => columns.has(name))) return null;
  const column = (name, fallback = "NULL") => columns.has(name) ? `"${name}"` : fallback;
  const expired = columns.has("expired_at")
    ? `AND ("expired_at" IS NULL OR "expired_at" = '' OR "expired_at" = 0)` : "";
  const deleted = columns.has("is_deleted")
    ? `AND COALESCE("is_deleted", 0) = 0` : "";
  // Only the four exact counters and the model key cross into JS results; the
  // message body, summary, and workspace metadata stay inside SQLite.
  const query = `SELECT CAST(${column("history_id", "rowid")} AS TEXT) AS id,
    ${column("conversation_id")} AS session_id,
    ${column("created_at")} AS created_at, ${column("updated_at", column("created_at"))} AS updated_at,
    json_extract(extra_info, '$.config_name') AS model,
    json_extract(extra_info, '$.exact_prompt_tokens_v1') AS prompt_tokens,
    json_extract(extra_info, '$.exact_output_tokens_v1') AS completion_tokens,
    json_extract(extra_info, '$.exact_reasoning_tokens_v1') AS reasoning_tokens,
    json_extract(extra_info, '$.exact_total_tokens_v1') AS total_tokens,
    json_extract(extra_info, '$.exact_token_semantics_v1') AS semantics,
    json_extract(extra_info, '$.exact_usage_v1') AS usage_kind
    FROM server_history_info WHERE source = 'llm_default' ${deleted} ${expired}
      AND CASE WHEN json_valid(extra_info)
        THEN json_type(extra_info, '$') = 'object' ELSE 0 END
      -- Older builds only wrote the request total without the exact counters.
      -- Those conversations fall back to chat_turn; selecting them here would
      -- only add skips without a usable split.
      AND json_extract(extra_info, '$.exact_total_tokens_v1') IS NOT NULL`;
  return (await queryRows(query)).map((row) => ({
    id: row.id,
    session_id: row.session_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    model: row.model,
    usage: {
      prompt_tokens: row.prompt_tokens,
      completion_tokens: row.completion_tokens,
      reasoning_tokens: row.reasoning_tokens,
      total_tokens: row.total_tokens,
      semantics: row.semantics,
      usage_kind: row.usage_kind,
    },
  }));
}

async function readTraeUsageRows(dbPath, { env = process.env } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let snapshot;
    try { snapshot = openTraeSnapshot(dbPath, env); }
    catch (err) {
      // A writer can also change the files while the snapshot opens. Retry
      // that too, and report the specific failure once attempts run out.
      if (err?.transient && attempt < 2) continue;
      throw err;
    }
    try {
      let result;
      try {
        result = await withTraeSqlite(snapshot, async (queryRows) => {
          const turns = await projectTurnUsage(queryRows);
          const requests = await projectRequestUsage(queryRows);
          if (turns == null && requests == null) {
            throw error("unsupported database schema: chat_turn and server_history_info tables are missing.");
          }
          return { turns: turns || [], requests: requests || [], requestsAvailable: requests != null };
        });
      }
      catch (err) {
        // A writer may have changed pages while SQLite was reading. Discard
        // every projected row and retry; never publish a mixed snapshot.
        if (snapshot.isStable()) throw err;
        continue;
      }
      if (snapshot.isStable()) return result;
    } finally { snapshot.close(); }
  }
  throw error("database changed during the read; retry after TRAE finishes its current turn.");
}

module.exports = { resolveTraeDbPaths, readTraeUsageRows };
