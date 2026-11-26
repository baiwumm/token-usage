"use strict";

// Freebuff CLI (codebuff successor) account-level usage reader.
//
// Freebuff keeps no local token-consumption records — its session files under
// `~/.config/manicode/` are client-side projections and every local token
// field is a context-window counter, not spend (2026-11-15 audit, re-verified
// 2026-11-25). The authoritative usage lives server-side and the web console
// exposes it at `GET /api/web/usage-summary`, which accepts the CLI's own
// keychain token as a Bearer credential (verified 2026-11-25: the token is
// stored by Bun.secrets under service "freebuff-cli", name = the
// credentials.json path, and the console API answers 200 to exactly that
// token with no cookie).
//
// Credential layout (secrets never leave this module; callers only see a
// token string or null):
//   `<configDir>/credentials.json` — plaintext metadata: `{default: {
//   tokenStore: "keychain", fingerprintId, email, ...}}`. The auth token
//   itself is NOT in this file; it lives in the OS keychain (Windows
//   Credential Manager on this platform).
//
// The keychain read is Windows-only in v1 (PowerShell CredRead via advapi32).
// Other platforms return null — a silent skip, same policy as an unsigned-in
// install — rather than a hard error, because an absent credential is a
// normal state, not a sync failure.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FREEBUFF_HOME_ENV = "TOKENUSAGE_FREEBUFF_HOME";
// The usage read transmits the account's CLI keychain token to
// freebuff.com — its issuing origin, so it is not a cross-origin leak — but
// the account-level totals are device-independent and day-granular, so v1
// ships strictly opt-in (mirrors TOKENUSAGE_TRAE_CN_USAGE) until
// cross-device dedup has field mileage. Any value other than 1/true keeps
// it off.
const FREEBUFF_USAGE_ENV = "TOKENUSAGE_FREEBUFF_USAGE";

const FREEBUFF_CONFIG_DIRNAME = path.join(".config", "manicode");
const FREEBUFF_CREDENTIALS_FILENAME = "credentials.json";
// Bun.secrets keychain service used by the Freebuff CLI; the entry name is
// the credentials.json path. The joined string is the Credential Manager
// target observed on a real install (2026-11-25).
const FREEBUFF_KEYCHAIN_SERVICE = "freebuff-cli";

const FREEBUFF_USAGE_URL = "https://freebuff.com/api/web/usage-summary";
const FREEBUFF_USAGE_TIMEOUT_MS = 30 * 1000;

function isFreebuffUsageEnabled(env = process.env) {
  const value = env ? env[FREEBUFF_USAGE_ENV] : undefined;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "1" || normalized === "true";
}

function resolveFreebuffConfigDir({
  env = process.env,
  home = os.homedir(),
} = {}) {
  // Both branches point at the PARENT of `.config/manicode` (a home dir),
  // so the override swaps the whole home, not the config folder itself.
  const override = env[FREEBUFF_HOME_ENV];
  if (typeof override === "string" && override.trim()) {
    return path.join(path.resolve(override.trim()), FREEBUFF_CONFIG_DIRNAME);
  }
  return path.join(home, FREEBUFF_CONFIG_DIRNAME);
}

function resolveFreebuffCredentialsPath(options = {}) {
  return path.join(resolveFreebuffConfigDir(options), FREEBUFF_CREDENTIALS_FILENAME);
}

// Absent file, unparsable JSON, or a non-keychain tokenStore all mean "this
// install cannot serve account-level usage" — null, not an error.
function readFreebuffCredentials({ env, home, fsModule = fs } = {}) {
  const credentialsPath = resolveFreebuffCredentialsPath({ env, home });
  let raw;
  try {
    raw = fsModule.readFileSync(credentialsPath, "utf8");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const profile = parsed && typeof parsed === "object" ? parsed.default : null;
  if (!profile || typeof profile !== "object") return null;
  if (profile.tokenStore !== "keychain") return null;
  if (typeof profile.fingerprintId !== "string" || !profile.fingerprintId) return null;
  return {
    credentialsPath,
    fingerprintId: profile.fingerprintId,
    email: typeof profile.email === "string" ? profile.email : null,
  };
}

// The keychain value is the raw auth token stored by Bun.secrets as UTF-8
// (36-char opaque string on observed installs — not a JWT, not JSON).
// PowerShell's CredRead is used because Node has no native Credential
// Manager binding and the CLI deliberately runs zero native dependencies.
// The token is printed as base64 on stdout and decoded here; it is never
// logged, echoed into an error, or written to disk.
const CRED_READ_SCRIPT_TEMPLATE = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "public class CredFreebuffRead {",
  "  [DllImport(\"advapi32.dll\", EntryPoint = \"CredReadW\", CharSet = CharSet.Unicode, SetLastError = true)]",
  "  public static extern bool CredRead(string target, int type, int flags, out IntPtr credPtr);",
  "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
  "  public struct CREDENTIAL {",
  "    public int Flags; public int Type; public string TargetName; public string Comment;",
  "    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;",
  "    public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;",
  "    public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;",
  "  }",
  "  public static byte[] ReadBlob(string target) {",
  "    IntPtr ptr;",
  "    if (!CredRead(target, 1, 0, out ptr)) return null;",
  "    CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));",
  "    byte[] blob = new byte[cred.CredentialBlobSize];",
  "    Marshal.Copy(cred.CredentialBlob, blob, 0, cred.CredentialBlobSize);",
  "    return blob;",
  "  }",
  "}",
  "'@",
  "$blob = [CredFreebuffRead]::ReadBlob('TARGET_PLACEHOLDER')",
  "if ($null -eq $blob -or $blob.Length -eq 0) { exit 3 }",
  "[Console]::Out.Write([Convert]::ToBase64String($blob))",
].join("\r\n");

function credReadTarget(credentialsPath) {
  return `${FREEBUFF_KEYCHAIN_SERVICE}/${credentialsPath}`;
}

// Returns the token string, or null when the entry is absent (exit 3) or the
// keychain read fails for any reason (missing PowerShell, timeout, ACL).
// Failures are indistinguishable to callers by design: both are "no usable
// credential this run".
function readFreebuffKeychainToken({ credentialsPath, spawnImpl = spawnSync } = {}) {
  if (process.platform !== "win32") return null;
  if (typeof credentialsPath !== "string" || !credentialsPath) return null;
  const script = CRED_READ_SCRIPT_TEMPLATE.replace(
    "TARGET_PLACEHOLDER",
    credentialsPath.replace(/'/g, "''"),
  );
  let result;
  try {
    result = spawnImpl("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ], { timeout: 15 * 1000, windowsHide: true });
  } catch {
    return null;
  }
  if (!result || result.status !== 0) return null;
  const stdout = typeof result.stdout === "string"
    ? result.stdout
    : Buffer.from(result.stdout || "").toString("utf8");
  const token = stdout.trim();
  if (!token || /\s/.test(token)) return null;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    return decoded.trim() || null;
  } catch {
    return null;
  }
}

async function fetchFreebuffUsageSummary({
  token,
  fetchImpl = fetch,
  url = FREEBUFF_USAGE_URL,
  timeoutMs = FREEBUFF_USAGE_TIMEOUT_MS,
} = {}) {
  if (typeof token !== "string" || !token) {
    throw new Error("Freebuff credentials are not configured.");
  }
  let response;
  try {
    // redirect: "error" — the token must never reach another origin (same
    // policy as the Devin and Trae CN readers).
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error && (error.name === "AbortError" || error.code === "ABORT_ERR")) {
      throw new Error(`Freebuff usage request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  }
  if (response.status === 401 || response.status === 403) {
    const error = new Error(`Freebuff usage request rejected (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    throw new Error(`Freebuff usage request failed with status ${response.status}.`);
  }
  let summary;
  try {
    summary = await response.json();
  } catch {
    throw new Error("Freebuff usage response is not valid JSON.");
  }
  // Minimal shape gate: lifetime.days is the only surface consumed today.
  // Anything else (streak, sessionCharges, ...) is ignored so console-side
  // redesigns cannot break collection.
  const days = summary && typeof summary === "object" ? summary.lifetime?.days : null;
  if (!Array.isArray(days)) {
    throw new Error("Freebuff usage response is missing lifetime.days.");
  }
  return summary;
}

// Mirrors fetchTraeCnUsageWithAuth: read the keychain once, retry the exact
// same fetch a single time with a fresh read when the token was rejected —
// the CLI may have rotated the entry mid-run. A second rejection propagates.
async function fetchFreebuffUsageWithAuth({
  fetchImpl = fetch,
  readCredentials = readFreebuffCredentials,
  readKeychainToken = readFreebuffKeychainToken,
  env,
  home,
} = {}) {
  const readToken = () => {
    const credentials = readCredentials({ env, home });
    if (!credentials) return null;
    return readKeychainToken({ credentialsPath: credentials.credentialsPath });
  };
  let token = readToken();
  if (!token) {
    throw new Error("Freebuff credentials are not configured.");
  }
  try {
    return await fetchFreebuffUsageSummary({ token, fetchImpl });
  } catch (error) {
    const authFailure = error?.status === 401 || error?.status === 403;
    if (!authFailure) throw error;
    // Entry may have rotated since the first read; re-read the keychain once.
    token = readToken();
    if (!token) throw error;
    return await fetchFreebuffUsageSummary({ token, fetchImpl });
  }
}

module.exports = {
  FREEBUFF_HOME_ENV,
  FREEBUFF_USAGE_ENV,
  FREEBUFF_CONFIG_DIRNAME,
  FREEBUFF_KEYCHAIN_SERVICE,
  FREEBUFF_USAGE_URL,
  isFreebuffUsageEnabled,
  resolveFreebuffConfigDir,
  resolveFreebuffCredentialsPath,
  readFreebuffCredentials,
  readFreebuffKeychainToken,
  fetchFreebuffUsageSummary,
  fetchFreebuffUsageWithAuth,
};
