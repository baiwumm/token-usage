// Token Usage desktop companion (docs/desktop-plan.md).
//
// The Rust side owns only the system face: tray, window show/hide, quit, and
// a tightly scoped bridge to the CLI's local data. No business logic lives
// here — capture and upload stay in tokenusage-cli (D2 boundary 1); local
// files are read-only; the device token and anon key never leave this file's
// parsing (only whitelisted config fields are returned to the webview).
//
// Command surface (all invokable only by the `main` webview):
//   tracker_paths       — home / tracker dir / hostname for labels
//   read_tracker_file   — scoped read of ~/.tokenusage/tracker/<rel> (None if
//                         missing, 8 MiB cap, canonicalized prefix check)
//   read_tracker_tail   — append-order tail for the queue.jsonl capacity wall
//                         (≤2 MiB, whole rows only, carries the file size so
//                         pending-byte math stays whole-file accurate)
//   read_tracker_head   — newest-first sidecar head (≤512 KiB, whole rows
//                         only)
//   read_instance_config— config.json filtered to baseUrl / dashboardUrl /
//                         machineId (never deviceToken / anonKey)
//   cli_info            — `tokenusage --version` presence probe
//   run_cli             — allowlisted CLI subcommand runner (cmd /C)
//   open_in_browser     — http(s)-validated default-browser open
//   open_tracker_dir    — reveal the tracker data / logs folder in Explorer
//                         (whitelisted to those two, never an arbitrary path)
//   update_tray         — JS pushes tray label texts + pause state
//   device_login_start / _poll / _cancel — managed `device-login --json`
//                         child for the pairing wizard (D3); the CLI owns the
//                         whole flow, the bridge only shepherds the process

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, ErrorKind, Read};
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const TRAY_ID: &str = "main-tray";
// `device-login` is deliberately absent: the wizard drives it through the
// managed device_login_* commands below — a plain run_cli call would block
// on `.output()` for the whole 16-minute pairing window and a stray second
// spawn would race the first one for config.json.
const CLI_COMMANDS: [&str; 7] = [
    "sync",
    "status",
    "doctor",
    "reconcile",
    "pause",
    "resume",
    // Read-only project profiles (docs/cli-contract.md §2.13).
    "project-profiles",
];
const MAX_TRACKER_FILE_BYTES: u64 = 8 * 1024 * 1024;
const DEFAULT_DASHBOARD_URL: &str = "https://app.token-usage.cc";

fn tracker_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(home.join(".tokenusage").join("tracker"))
}

/// Console-less child process on Windows: a GUI process spawning `cmd` would
/// otherwise flash a console window (the same conhost issue the CLI's
/// scheduled task had to hide).
fn gui_command(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = Command::new(program);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

/// `tokenusage` launcher: on Windows the npm global binary is a `.cmd` shim,
/// so it goes through `cmd /C`; other platforms exec the binary directly.
fn build_cli_command(args: &[String]) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = gui_command("cmd");
        command.arg("/C").arg("tokenusage");
        command.args(args);
        command
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut command = Command::new("tokenusage");
        command.args(args);
        command
    }
}

/// Tray menu run: the CLI is detached (a 4-minute manual sync must not block
/// the menu), so the window learns about it through two events — a start
/// bracket flips the action card's pending state, the done bracket re-reads
/// the tracker files (the pause flag included) once the child exits.
fn spawn_cli_watched(app: &AppHandle, args: Vec<String>) -> Result<(), String> {
    let command = args.first().cloned().unwrap_or_default();

    if let Err(err) = app.emit(
        "tray-cli-start",
        TrayCliEvent {
            command: command.clone(),
            exit_code: None,
        },
    ) {
        eprintln!("tray cli event failed: {err}");
    }

    let mut child = build_cli_command(&args)
        .spawn()
        .map_err(|e| e.to_string())?;
    let handle = app.clone();

    std::thread::spawn(move || {
        let exit_code = child.wait().ok().and_then(|status| status.code());
        if let Err(err) = handle.emit("tray-cli-done", TrayCliEvent { command, exit_code }) {
            eprintln!("tray cli event failed: {err}");
        }
    });

    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrayCliEvent {
    command: String,
    exit_code: Option<i32>,
}

fn open_url(url: &str) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return Err("only http(s) URLs are allowed".into());
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("invalid URL".into());
    }
    #[cfg(target_os = "windows")]
    {
        // explorer.exe hands the URL to ShellExecute directly, so `&` / `^` /
        // `%` inside a query string cannot re-enter cmd's parser the way they
        // could behind `cmd /C start` (the URL check above never allowed
        // whitespace, but cmd metacharacters were not excluded).
        Command::new("explorer")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn read_instance_config_inner(app: &AppHandle) -> Result<InstanceConfig, String> {
    // The CLI writes config.json keys in camelCase (baseUrl / dashboardUrl /
    // machineId — see runtime-config.js); before 2026-11-09 this struct read
    // snake_case, so every whitelisted field silently read as None and the
    // tray's dashboard link fell back to the default instance.
    //
    // init deliberately keeps dead InsForge URLs persisted as migration
    // markers; the CLI's own resolver drops them at read time
    // (LEGACY_INSFORGE_HOSTS in runtime-config.js) but this raw parse would not.
    // Mirror that here: the desktop must never open a URL the CLI itself
    // refuses to upload to. Values are always absolute https URLs written by
    // the CLI, so extracting the authority segment is enough to identify the
    // host.
    const RETIRED_CONFIG_HOSTS: [&str; 3] = [
        "example.invalid", // CLI test-isolation placeholder
        "b46ug8xu.us-east.insforge.app",
        "srctyff5.us-east.insforge.app",
    ];
    fn live_url(value: Option<String>) -> Option<String> {
        let value = value?;
        let host = value
            .trim()
            .split("://")
            .nth(1)?
            .split(['/', ':'])
            .next()?
            .to_lowercase();
        if RETIRED_CONFIG_HOSTS.contains(&host.as_str()) {
            None
        } else {
            Some(value)
        }
    }
    #[derive(Deserialize, Default)]
    #[serde(default, rename_all = "camelCase")]
    struct CliConfigFields {
        base_url: Option<String>,
        dashboard_url: Option<String>,
        machine_id: Option<String>,
    }

    let path = tracker_dir(app)?.join("config.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == ErrorKind::NotFound => {
            return Ok(InstanceConfig {
                base_url: None,
                dashboard_url: None,
                machine_id: None,
            })
        }
        Err(err) => return Err(err.to_string()),
    };
    let parsed: CliConfigFields = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let non_empty = |value: &Option<String>| -> Option<String> {
        value
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .map(|v| v.trim().to_string())
    };
    Ok(InstanceConfig {
        base_url: live_url(non_empty(&parsed.base_url)),
        dashboard_url: live_url(non_empty(&parsed.dashboard_url)),
        machine_id: non_empty(&parsed.machine_id),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstanceConfig {
    base_url: Option<String>,
    dashboard_url: Option<String>,
    machine_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackerPaths {
    tracker_dir: String,
    hostname: Option<String>,
}

#[tauri::command]
fn tracker_paths(app: AppHandle) -> Result<TrackerPaths, String> {
    let dir = tracker_dir(&app)?;
    let hostname = std::env::var("COMPUTERNAME").ok().filter(|v| !v.is_empty());
    Ok(TrackerPaths {
        tracker_dir: dir.to_string_lossy().into_owned(),
        hostname,
    })
}

#[tauri::command]
fn read_tracker_file(app: AppHandle, rel_path: String) -> Result<Option<String>, String> {
    let tracker = tracker_dir(&app)?;
    let tracker_canonical = match tracker.canonicalize() {
        Ok(path) => path,
        // No CLI data dir at all → every file reads as missing.
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    let target = tracker.join(&rel_path);
    let canonical = match target.canonicalize() {
        Ok(path) => path,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    if !canonical.starts_with(&tracker_canonical) {
        return Err("path outside tracker dir".into());
    }
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if meta.len() > MAX_TRACKER_FILE_BYTES {
        return Err("tracker file too large".into());
    }
    std::fs::read_to_string(&canonical)
        .map(Some)
        .map_err(|e| e.to_string())
}

/// Read only the tail of a tracker file, with the file's total size. The
/// capacity-wall fallback for `queue.jsonl`: the queue is the append-only
/// last-wins reconcile baseline and grows forever, so once it passes the 8 MiB
/// whole-read cap the monitor switches to the newest window (rows are
/// newest-LAST, exactly the append order). Same canonical guard as
/// `read_tracker_file`; the partial first line inside the tail window is
/// dropped, so the caller only ever receives whole JSONL rows. Cap: 2 MiB
/// (~ several months of hourly buckets). `file_size` lets the webview keep
/// `queue.state.json`'s whole-file offset meaningful (pending bytes stay
/// correct on the partial view).
#[tauri::command]
fn read_tracker_tail(
    app: AppHandle,
    rel_path: String,
    max_bytes: Option<u64>,
) -> Result<Option<TailRead>, String> {
    use std::io::{Read, Seek, SeekFrom};

    const MAX_TAIL_BYTES: u64 = 2 * 1024 * 1024;
    let tracker = tracker_dir(&app)?;
    let tracker_canonical = match tracker.canonicalize() {
        Ok(path) => path,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    let target = tracker.join(&rel_path);
    let canonical = match target.canonicalize() {
        Ok(path) => path,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    if !canonical.starts_with(&tracker_canonical) {
        return Err("path outside tracker dir".into());
    }
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let cap = max_bytes.unwrap_or(MAX_TAIL_BYTES).min(MAX_TAIL_BYTES);
    let start = meta.len().saturating_sub(cap);
    let mut file = std::fs::File::open(&canonical).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    let file_size = meta.len();
    let text = tail_whole_rows(buffer, start > 0);

    Ok(Some(TailRead { text, file_size }))
}

#[derive(Serialize)]
struct TailRead {
    text: Option<String>,
    file_size: u64,
}

/// Whole JSONL rows from a tail window: when the window starts mid-file the
/// partial first line is dropped (up to and including its newline); no
/// complete line inside the window yields None. Pure — unit-tested.
fn tail_whole_rows(mut buffer: Vec<u8>, had_prefix: bool) -> Option<String> {
    if had_prefix {
        let position = buffer.iter().position(|byte| *byte == b'\n')?;
        buffer.drain(..=position);
    }
    let text = String::from_utf8_lossy(&buffer).into_owned();

    (!text.is_empty()).then_some(text)
}

/// Whole JSONL rows from a head read. A window ending exactly on a newline
/// keeps that complete row (strip the trailing terminator); anything else
/// drops the partial tail after the last newline. A full-file read returns the
/// text verbatim — an empty file reads as an empty string, matching the whole
/// file's own parse. Pure — unit-tested (the old rfind-on-raw-text logic lost
/// the final complete row whenever the window landed exactly on a line
/// boundary, which is what these tests pin).
fn head_whole_rows(text: String, whole_file: bool) -> Option<String> {
    if whole_file {
        return Some(text);
    }
    if let Some(stripped) = text.strip_suffix('\n') {
        return Some(stripped.to_string());
    }
    text.rfind('\n')
        .and_then(|position| (position > 0).then(|| text[..position].to_string()))
}

/// Read only the head of a tracker file. `session.queue.jsonl` is rewritten in
/// descending `ended_at` order (newest rows FIRST), so the tail read used for
/// append-only logs would return the OLDEST sessions. Same canonical guard and
/// 512 KiB cap; a cut in the middle of the final line is dropped so the parser
/// only sees whole JSONL rows (0.4.2).
#[tauri::command]
fn read_tracker_head(
    app: AppHandle,
    rel_path: String,
    max_bytes: Option<u64>,
) -> Result<Option<String>, String> {
    use std::io::Read;

    const MAX_HEAD_BYTES: u64 = 512 * 1024;
    let tracker = tracker_dir(&app)?;
    let tracker_canonical = match tracker.canonicalize() {
        Ok(path) => path,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    let target = tracker.join(&rel_path);
    let canonical = match target.canonicalize() {
        Ok(path) => path,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    if !canonical.starts_with(&tracker_canonical) {
        return Err("path outside tracker dir".into());
    }
    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    let limit = max_bytes.unwrap_or(MAX_HEAD_BYTES).min(MAX_HEAD_BYTES);
    let to_read = limit.min(meta.len());
    let mut file = std::fs::File::open(&canonical).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; to_read as usize];
    file.read_exact(&mut buffer).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buffer).into_owned();

    Ok(head_whole_rows(text, to_read == meta.len()))
}

#[tauri::command]
fn read_instance_config(app: AppHandle) -> Result<InstanceConfig, String> {
    read_instance_config_inner(&app)
}

#[derive(Serialize)]
struct CliInfo {
    available: bool,
    version: Option<String>,
}

fn probe_cli_version() -> CliInfo {
    let output = build_cli_command(&["--version".to_string()]).output();
    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            CliInfo {
                available: true,
                version: (!text.is_empty()).then_some(text),
            }
        }
        _ => CliInfo {
            available: false,
            version: None,
        },
    }
}

#[tauri::command]
async fn cli_info() -> CliInfo {
    tauri::async_runtime::spawn_blocking(probe_cli_version)
        .await
        .unwrap_or(CliInfo {
            available: false,
            version: None,
        })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CliRunResult {
    resolved: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[tauri::command]
async fn run_cli(args: Vec<String>) -> Result<CliRunResult, String> {
    let first = match args.first() {
        Some(value) => value.clone(),
        None => return Err("missing command".into()),
    };
    if !CLI_COMMANDS.contains(&first.as_str()) {
        return Err(format!("command not allowed: {first}"));
    }
    let owned: Vec<String> = args;
    tauri::async_runtime::spawn_blocking(move || match build_cli_command(&owned).output() {
        Ok(out) => Ok(CliRunResult {
            resolved: true,
            exit_code: out.status.code(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        }),
        Err(err) => Ok(CliRunResult {
            resolved: false,
            exit_code: None,
            stdout: String::new(),
            stderr: err.to_string(),
        }),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_in_browser(url: String) -> Result<(), String> {
    open_url(&url)
}

/// Reveal one of the tracker's own folders in the OS file manager (settings
/// "数据目录 / 日志目录"). The whitelist keeps this from becoming an arbitrary
/// path opener exposed to the webview, and a missing folder is reported rather
/// than silently doing nothing (a fresh machine has no `logs/` until the CLI
/// runs once).
#[tauri::command]
fn open_tracker_dir(app: AppHandle, which: String) -> Result<(), String> {
    let base = tracker_dir(&app)?;
    let target = match which.as_str() {
        "tracker" => base,
        "logs" => base.join("logs"),
        other => return Err(format!("unknown directory: {other}")),
    };
    if !target.is_dir() {
        return Err(format!("directory missing: {}", target.display()));
    }
    open_path(&target)
}

#[cfg(windows)]
fn open_path(path: &std::path::Path) -> Result<(), String> {
    Command::new("explorer")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("open failed: {e}"))
}

#[cfg(target_os = "macos")]
fn open_path(path: &std::path::Path) -> Result<(), String> {
    Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("open failed: {e}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_path(path: &std::path::Path) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("open failed: {e}"))
}

/// Filename guard shared by the export commands: a strict whitelist (our call
/// sites emit `token-usage-<digits>.png` / `token-usage-sessions-<dates>.csv`),
/// so no path component can escape the target folder.
fn validate_export_filename(filename: &str) -> Result<(&str, &str), String> {
    if filename.len() > 120 {
        return Err("filename too long".into());
    }
    if !filename
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("filename not allowed".into());
    }
    match filename.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() => Ok((stem, ext)),
        _ => Err("filename must have an extension".into()),
    }
}

/// Save user-initiated exports (share-card PNG) to the OS Downloads folder —
/// the desktop counterpart of the web's `<a download>` (desktop-2026-11.md 附录（原 desktop-plan）§12.13).
/// A name collision suffixes `-2`, `-3`, … instead of overwriting.
#[tauri::command]
fn save_to_downloads(
    app: AppHandle,
    filename: String,
    contents: Vec<u8>,
) -> Result<String, String> {
    let (stem, ext) = validate_export_filename(&filename)?;
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("download dir unavailable: {e}"))?;
    let mut candidate = dir.join(&filename);
    let mut counter = 2;

    while candidate.exists() {
        candidate = dir.join(format!("{stem}-{counter}.{ext}"));
        counter += 1;
    }
    std::fs::write(&candidate, contents).map_err(|e| format!("write failed: {e}"))?;

    Ok(candidate.to_string_lossy().into_owned())
}

/// Save an export through the native save dialog, defaulting to the Desktop
/// folder (operator request 2026-11-12: the CSV export must let the user pick
/// the landing spot instead of always writing to Downloads). Returns the
/// chosen path, or `None` when the dialog was cancelled. The dialog is driven
/// here rather than from the webview, so no arbitrary-path write command is
/// ever exposed to JS.
#[tauri::command]
async fn save_file_as(
    app: AppHandle,
    filename: String,
    contents: Vec<u8>,
) -> Result<Option<String>, String> {
    let (_, ext) = validate_export_filename(&filename)?;
    let default_dir = app
        .path()
        .desktop_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| format!("default save dir unavailable: {e}"))?;
    let ext = ext.to_ascii_lowercase();
    let mut builder = app
        .dialog()
        .file()
        .set_title("保存导出文件")
        .set_file_name(&filename)
        .set_directory(default_dir);

    builder = builder.add_filter(ext.to_ascii_uppercase(), &[ext.as_str()]);

    // Non-blocking callback API (safe off the main thread); a blocking thread
    // parks on the channel until the user confirms or cancels.
    let (tx, rx) = std::sync::mpsc::channel();
    builder.save_file(move |path| {
        let _ = tx.send(path);
    });
    let picked = tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| e.to_string())?;
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|e| format!("unsupported save target: {e}"))?;

    std::fs::write(&path, contents).map_err(|e| format!("write failed: {e}"))?;

    Ok(Some(path.to_string_lossy().into_owned()))
}

// --- D3 device login: managed `device-login --json` child process ---
//
// The CLI owns the entire pairing flow (authorize → browser approval → poll
// → token write); the bridge only keeps the process alive between polls and
// relays display fields. The authorize blob's `device_code` never leaves the
// reader thread: whoever holds it could poll the server for the freshly
// minted device token after approval, so it is dropped like a secret and the
// webview only ever sees user_code + verification URLs (docs/desktop-plan.md
// §3 boundary 3).

const DEVICE_LOGIN_TAIL_LINES: usize = 50;
const MAX_AUTH_BLOB_BYTES: usize = 64 * 1024;
const DEVICE_LOGIN_DRAIN_WAIT: Duration = Duration::from_millis(500);

/// Poison-tolerant lock: release builds abort on panic, so a poisoned mutex
/// must never take the whole tray down.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AuthCode {
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    /// Serialized as `expiresInSec` — the webview's `AuthCode` field name.
    expires_in_sec: Option<u64>,
}

/// Picks the display fields out of the authorize response; everything else
/// (device_code first of all) is dropped with the parsed value.
fn whitelist_auth(value: &serde_json::Value) -> Option<AuthCode> {
    let text = |key: &str| -> Option<String> {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    };
    let expires_in = value.get("expires_in").and_then(|v| {
        v.as_u64().or_else(|| {
            v.as_f64()
                .filter(|f| f.is_finite() && *f >= 0.0)
                .map(|f| f as u64)
        })
    });
    Some(AuthCode {
        user_code: text("user_code")?,
        verification_uri: text("verification_uri")?,
        verification_uri_complete: text("verification_uri_complete"),
        expires_in_sec: expires_in,
    })
}

/// Line reader that never stops on invalid UTF-8: `cmd`'s own errors come in
/// the console codepage (GBK on zh-CN Windows), and a reader that bailed on
/// them would leave the child blocked on a full pipe.
fn for_each_lossy_line(stream: impl Read, mut on_line: impl FnMut(String)) {
    let mut reader = BufReader::new(stream);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let text = String::from_utf8_lossy(&buf);
                on_line(text.trim_end_matches(['\r', '\n']).to_string());
            }
        }
    }
}

fn push_tail(tail: &Mutex<VecDeque<String>>, line: String) {
    let mut guard = lock(tail);
    if guard.len() >= DEVICE_LOGIN_TAIL_LINES {
        guard.pop_front();
    }
    guard.push_back(line);
}

fn spawn_stdout_reader(
    stdout: ChildStdout,
    code: Arc<Mutex<Option<AuthCode>>>,
    tail: Arc<Mutex<VecDeque<String>>>,
    done: Arc<AtomicUsize>,
) {
    std::thread::spawn(move || {
        // `device-login --json` prints a status line, then the pretty-printed
        // authorize JSON (one top-level object), then the approval line. The
        // blob goes through the brace-anchored accumulator and never reaches
        // the tail buffer.
        let mut candidate = String::new();
        for_each_lossy_line(stdout, |line| {
            if candidate.is_empty() && !line.trim_start().starts_with('{') {
                push_tail(&tail, line);
                return;
            }
            if !candidate.is_empty() {
                candidate.push('\n');
            }
            candidate.push_str(&line);
            match serde_json::from_str::<serde_json::Value>(&candidate) {
                Ok(value) => {
                    if let Some(auth) = whitelist_auth(&value) {
                        *lock(&code) = Some(auth);
                    }
                    candidate.clear();
                }
                // Incomplete blob: keep accumulating up to a sane bound.
                Err(err) if err.is_eof() && candidate.len() < MAX_AUTH_BLOB_BYTES => {}
                // Not JSON after all (or runaway): drop it — it may hold the
                // device_code, so it never falls through to the tail.
                Err(_) => candidate.clear(),
            }
        });
        done.fetch_add(1, Ordering::Release);
    });
}

fn spawn_stderr_reader(
    stderr: ChildStderr,
    tail: Arc<Mutex<VecDeque<String>>>,
    done: Arc<AtomicUsize>,
) {
    std::thread::spawn(move || {
        for_each_lossy_line(stderr, |line| push_tail(&tail, line));
        done.fetch_add(1, Ordering::Release);
    });
}

struct ActiveDeviceLogin {
    child: Child,
    code: Arc<Mutex<Option<AuthCode>>>,
    stdout_tail: Arc<Mutex<VecDeque<String>>>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
    readers: usize,
    readers_done: Arc<AtomicUsize>,
}

impl ActiveDeviceLogin {
    fn output_tail(&self) -> String {
        let stdout = lock(&self.stdout_tail)
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        let stderr = lock(&self.stderr_tail)
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        [stdout, stderr]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Bounded wait for both pipes to hit EOF after the child exited, so the
    /// final error line is in the tail before the webview reads it.
    fn wait_for_readers(&self) {
        let deadline = Instant::now() + DEVICE_LOGIN_DRAIN_WAIT;
        while self.readers_done.load(Ordering::Acquire) < self.readers && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

#[derive(Default)]
struct DeviceLoginState(Mutex<Option<ActiveDeviceLogin>>);

/// `cmd /C tokenusage` → npm/Volta shim → node: killing `cmd` alone would
/// orphan node, which keeps polling the server for the whole pairing window.
fn kill_process_tree(child: &mut Child) {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let pid = child.id().to_string();
        let _ = gui_command("taskkill")
            .args(["/PID", pid.as_str(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn stop_device_login(state: &DeviceLoginState) {
    let taken = lock(&state.0).take();
    if let Some(mut active) = taken {
        kill_process_tree(&mut active.child);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceLoginPoll {
    running: bool,
    exit_code: Option<i32>,
    code: Option<AuthCode>,
    output_tail: String,
}

#[tauri::command]
async fn device_login_start(state: State<'_, DeviceLoginState>) -> Result<(), String> {
    let mut guard = lock(&state.0);
    if let Some(active) = guard.as_mut() {
        match active.child.try_wait() {
            // Confirmed alive: refuse the second spawn (a stray child would
            // race the first one for config.json).
            Ok(None) => return Err("device login is already running".into()),
            // Exited, or the pipe state is unreadable — either way the slot
            // must not leak the old child, so the replacement below takes it.
            Ok(Some(_)) | Err(_) => kill_process_tree(&mut active.child),
        }
    }
    let mut command = build_cli_command(&["device-login".to_string(), "--json".to_string()]);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let code = Arc::new(Mutex::new(None));
    let stdout_tail = Arc::new(Mutex::new(VecDeque::new()));
    let stderr_tail = Arc::new(Mutex::new(VecDeque::new()));
    let readers_done = Arc::new(AtomicUsize::new(0));
    let mut readers = 0;
    if let Some(out) = child.stdout.take() {
        spawn_stdout_reader(out, code.clone(), stdout_tail.clone(), readers_done.clone());
        readers += 1;
    }
    if let Some(err) = child.stderr.take() {
        spawn_stderr_reader(err, stderr_tail.clone(), readers_done.clone());
        readers += 1;
    }
    *guard = Some(ActiveDeviceLogin {
        child,
        code,
        stdout_tail,
        stderr_tail,
        readers,
        readers_done,
    });
    Ok(())
}

#[tauri::command]
async fn device_login_poll(state: State<'_, DeviceLoginState>) -> Result<DeviceLoginPoll, String> {
    let mut guard = lock(&state.0);
    let Some(active) = guard.as_mut() else {
        return Ok(DeviceLoginPoll {
            running: false,
            exit_code: None,
            code: None,
            output_tail: String::new(),
        });
    };
    match active.child.try_wait() {
        Ok(None) => Ok(DeviceLoginPoll {
            running: true,
            exit_code: None,
            code: lock(&active.code).clone(),
            output_tail: active.output_tail(),
        }),
        Ok(Some(status)) => {
            active.wait_for_readers();
            Ok(DeviceLoginPoll {
                running: false,
                exit_code: status.code(),
                code: lock(&active.code).clone(),
                output_tail: active.output_tail(),
            })
        }
        Err(err) => Ok(DeviceLoginPoll {
            running: false,
            exit_code: None,
            code: None,
            output_tail: err.to_string(),
        }),
    }
}

#[tauri::command]
async fn device_login_cancel(state: State<'_, DeviceLoginState>) -> Result<(), String> {
    stop_device_login(&state);
    Ok(())
}

/// Menu-item handles + pause mirror so the webview can push tray label
/// updates; the tray's pause action reads the mirrored flag to decide
/// between `pause` and `resume`.
struct TrayHandles {
    metric: MenuItem<tauri::Wry>,
    status: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    /// Period radio group: exactly one is checked, driven by the webview.
    period_today: CheckMenuItem<tauri::Wry>,
    period_week: CheckMenuItem<tauri::Wry>,
    period_month: CheckMenuItem<tauri::Wry>,
    period_all: CheckMenuItem<tauri::Wry>,
    paused: Mutex<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayLabels {
    /// Period-aware usage line ("近 7 天 tokens：…"), set from the webview.
    metric: String,
    status: String,
    pause_action: String,
    /// Active period (`today` / `7d` / `30d` / `all`) for the check marks.
    period: String,
    paused: bool,
}

#[tauri::command]
fn update_tray(handles: State<TrayHandles>, labels: TrayLabels) -> Result<(), String> {
    handles
        .metric
        .set_text(&labels.metric)
        .map_err(|e| e.to_string())?;
    handles
        .status
        .set_text(&labels.status)
        .map_err(|e| e.to_string())?;
    handles
        .pause
        .set_text(&labels.pause_action)
        .map_err(|e| e.to_string())?;
    for (item, key) in [
        (&handles.period_today, "today"),
        (&handles.period_week, "7d"),
        (&handles.period_month, "30d"),
        (&handles.period_all, "all"),
    ] {
        item.set_checked(labels.period == key)
            .map_err(|e| e.to_string())?;
    }
    // Same poison-tolerant lock as the tray menu reads: a poisoned mutex must
    // never wedge a label push.
    *lock(&handles.paused) = labels.paused;
    Ok(())
}

fn dashboard_url_for_tray(app: &AppHandle) -> String {
    let config = read_instance_config_inner(app).ok();
    config
        .and_then(|c| c.dashboard_url.or(c.base_url))
        .unwrap_or_else(|| DEFAULT_DASHBOARD_URL.to_string())
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Whether the shell actually accepted the tray icon.
///
/// `TrayIconBuilder::build` only fails when the hidden window cannot be
/// created: `tray-icon` deliberately ignores a rejected `Shell_NotifyIcon`
/// (it waits for `TaskbarCreated` and retries). A lower-integrity process
/// cannot post to an elevated taskbar at all, so on a UAC-off session the
/// icon never registers while `build` still returns `Ok` — `rect()` is the
/// only honest answer.
fn tray_registered<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    app.tray_by_id(TRAY_ID)
        .map(|tray| matches!(tray.rect(), Ok(Some(_))))
        .unwrap_or(false)
}

/// Tray visibility for the webview, so a machine where the shell rejected the
/// icon gets an explanation instead of silently losing the tray. Polled a few
/// times after the window loads: registration can land just after the query.
#[tauri::command]
fn tray_status(app: AppHandle) -> bool {
    tray_registered(&app)
}

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let metric = MenuItem::with_id(app, "tray-metric", "今日 tokens：…", false, None::<&str>)?;
    let status = MenuItem::with_id(app, "tray-status", "采集：正常", false, None::<&str>)?;
    // Period switch (desktop-2026-11.md 附录（原 desktop-plan）§12.14): the menu mirrors the header's
    // 今日 / 7D / 30D / 总计 filter and writes the same preference.
    // Check items instead of plain entries: the menu must say which period is
    // active (operator 2026-11-12 round 2). Default follows the preference
    // default (今日); the webview re-syncs all four on every label push.
    let period_today =
        CheckMenuItem::with_id(app, "period-today", "今日", true, true, None::<&str>)?;
    let period_week = CheckMenuItem::with_id(app, "period-7d", "7D", true, false, None::<&str>)?;
    let period_month = CheckMenuItem::with_id(app, "period-30d", "30D", true, false, None::<&str>)?;
    let period_all = CheckMenuItem::with_id(app, "period-all", "总计", true, false, None::<&str>)?;
    let sync_now = MenuItem::with_id(app, "sync-now", "立即同步", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause-toggle", "暂停采集", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let dashboard =
        MenuItem::with_id(app, "open-dashboard", "打开 Web 仪表盘", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &metric,
            &status,
            &sep1,
            &period_today,
            &period_week,
            &period_month,
            &period_all,
            &sep2,
            &sync_now,
            &pause,
            &sep3,
            &show,
            &dashboard,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .cloned()
                .expect("app icon missing"),
        )
        .tooltip("Token Usage")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            // Period switch: the webview owns the preference and the labels,
            // so the menu only forwards the choice.
            "period-today" | "period-7d" | "period-30d" | "period-all" => {
                let period = event.id.as_ref().trim_start_matches("period-");
                if let Err(err) = app.emit("tray-period", period) {
                    eprintln!("tray period emit failed: {err}");
                }
            }
            "sync-now" => {
                let args = vec!["sync".to_string(), "--auto".to_string()];
                if let Err(err) = spawn_cli_watched(app, args) {
                    eprintln!("tray sync spawn failed: {err}");
                }
            }
            "pause-toggle" => {
                let paused = app
                    .state::<TrayHandles>()
                    .paused
                    .lock()
                    .map(|flag| *flag)
                    .unwrap_or(false);
                let command = if paused { "resume" } else { "pause" };
                if let Err(err) = spawn_cli_watched(app, vec![command.to_string()]) {
                    eprintln!("tray {command} spawn failed: {err}");
                }
            }
            "open-dashboard" => {
                let url = dashboard_url_for_tray(app);
                if let Err(err) = open_url(&url) {
                    eprintln!("tray dashboard open failed: {err}");
                }
            }
            "show" => show_main_window(app),
            "quit" => {
                // A pending pairing must not outlive the app as an orphan
                // node process polling the server.
                if let Some(state) = app.try_state::<DeviceLoginState>() {
                    stop_device_login(&state);
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left click surfaces the monitor window; the menu stays on the
            // right button for the classic tray interaction.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(TrayHandles {
        metric,
        status,
        pause,
        period_today,
        period_week,
        period_month,
        period_all,
        paused: Mutex::new(false),
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Registered first (the plugin documents this): a second launch hands
        // its argv to the running instance and exits, so the tray/monitor is
        // never duplicated.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        // Native save dialog for the sessions CSV export (default Desktop).
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // D5 updater: the webview checks the GitHub Releases manifest and
        // relaunches through the process plugin after an in-place install.
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DeviceLoginState::default())
        .invoke_handler(tauri::generate_handler![
            tracker_paths,
            read_tracker_file,
            read_tracker_tail,
            read_tracker_head,
            read_instance_config,
            cli_info,
            run_cli,
            open_in_browser,
            open_tracker_dir,
            save_to_downloads,
            save_file_as,
            update_tray,
            tray_status,
            device_login_start,
            device_login_poll,
            device_login_cancel,
        ])
        .setup(|app| {
            create_tray(app)?;
            // D11 geometry restore watchdog: the window config starts hidden
            // so the webview can apply the saved geometry before show() (no
            // startup jump). If the webview never gets there, this shows the
            // default-centered window instead of stranding the app.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    if let Ok(false) = window.is_visible() {
                        let _ = window.show();
                    }
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: the monitor keeps watching from the tray; a real
            // quit goes through the tray menu so the process stays intentional.
            // When the shell never registered the icon (the app's integrity
            // level is lower than the taskbar's — typically a low-integrity
            // parent, NOT UAC being off; see 0.3.1) there is no tray menu to
            // quit from. Let the close go through in that case instead of
            // minimizing forever with no exit path; TrayNote explains it.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && tray_registered(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- head_whole_rows: the cut rules read_tracker_head (0.4.2) serves the
    // newest-first session sidecar with. The boundary case here is exactly the
    // bug the 2026-11-15 audit fixed: a window landing on a newline used to
    // lose that final complete row on every read. ---

    #[test]
    fn head_keeps_the_last_complete_row_when_the_window_lands_on_a_newline() {
        let text = "row1\nrow2\nrow3\n".to_string();

        assert_eq!(
            head_whole_rows(text, false),
            Some("row1\nrow2\nrow3".into())
        );
    }

    #[test]
    fn head_drops_a_partial_final_line() {
        let text = "row1\nrow2\nrow3_par".to_string();

        assert_eq!(head_whole_rows(text, false), Some("row1\nrow2".into()));
    }

    #[test]
    fn head_returns_none_when_the_first_line_is_cut_with_no_newline() {
        assert_eq!(head_whole_rows("row1_par".to_string(), false), None);
    }

    #[test]
    fn head_full_file_read_returns_the_text_verbatim() {
        assert_eq!(
            head_whole_rows("row1\nrow2\n".to_string(), true),
            Some("row1\nrow2\n".into())
        );
        // An empty file reads as an empty string, matching the whole file.
        assert_eq!(head_whole_rows(String::new(), true), Some(String::new()));
    }

    // --- tail_whole_rows: the capacity-wall window over the append-order
    // queue baseline. The window starts mid-file whenever the queue passed
    // the whole-read cap, so the first (partial) line must go. ---

    #[test]
    fn tail_drops_the_partial_first_line() {
        let buffer = b"..older\nrow1\nrow2\nrow3_par".to_vec();

        assert_eq!(
            tail_whole_rows(buffer, true),
            Some("row1\nrow2\nrow3_par".into())
        );
    }

    #[test]
    fn tail_drops_the_partial_first_line_even_when_it_is_the_only_content() {
        assert_eq!(tail_whole_rows(b"row1_par".to_vec(), true), None);
        // The partial first line ends the window: draining it leaves nothing.
        assert_eq!(
            tail_whole_rows(b"older\nrow1\n".to_vec(), true),
            Some("row1\n".into())
        );
    }

    #[test]
    fn tail_window_starting_at_zero_keeps_everything() {
        assert_eq!(
            tail_whole_rows(b"row1\nrow2\n".to_vec(), false),
            Some("row1\nrow2\n".into())
        );
        assert_eq!(tail_whole_rows(Vec::new(), false), None);
    }

    // --- validate_export_filename: the save_to_downloads / save_file_as
    // guard. No separator, no traversal, no metacharacters may pass. ---

    #[test]
    fn export_filename_accepts_the_shapes_we_emit() {
        assert_eq!(
            validate_export_filename("token-usage-20261115.png"),
            Ok(("token-usage-20261115", "png"))
        );
        assert_eq!(
            validate_export_filename("token-usage-sessions-20261101-20261115.csv"),
            Ok(("token-usage-sessions-20261101-20261115", "csv"))
        );
    }

    #[test]
    fn export_filename_rejects_separators_and_metacharacters() {
        assert!(validate_export_filename("../evil.png").is_err());
        assert!(validate_export_filename("a/b.png").is_err());
        assert!(validate_export_filename("a b.png").is_err());
        assert!(validate_export_filename("a&b.png").is_err());
        assert!(validate_export_filename(".png").is_err());
        assert!(validate_export_filename("noext").is_err());
        let long = format!("{}.png", "a".repeat(118));
        assert!(validate_export_filename(&long).is_err());
    }

    // --- whitelist_auth: the device-login bridge drops everything outside the
    // display fields; the device_code in the authorize blob must never reach
    // the webview (whoever holds it could mint the device token). ---

    #[test]
    fn whitelist_auth_keeps_display_fields_only() {
        let value = serde_json::json!({
            "device_code": "SECRET",
            "user_code": "ABCD-1234",
            "verification_uri": "https://dashboard.test/device",
            "verification_uri_complete": "https://dashboard.test/device?user_code=ABCD-1234",
            "expires_in": 900,
            "interval": 5
        });
        let auth = whitelist_auth(&value).expect("authorize blob should pass");

        assert_eq!(auth.user_code, "ABCD-1234");
        assert_eq!(auth.verification_uri, "https://dashboard.test/device");
        assert_eq!(
            auth.verification_uri_complete.as_deref(),
            Some("https://dashboard.test/device?user_code=ABCD-1234")
        );
        assert_eq!(auth.expires_in_sec, Some(900));
    }

    #[test]
    fn whitelist_auth_tolerates_fractional_expires_in_but_not_garbage() {
        let value =
            serde_json::json!({ "user_code": "A", "verification_uri": "u", "expires_in": 899.9 });

        assert_eq!(whitelist_auth(&value).unwrap().expires_in_sec, Some(899));
        let value =
            serde_json::json!({ "user_code": "A", "verification_uri": "u", "expires_in": -1.0 });

        assert_eq!(whitelist_auth(&value).unwrap().expires_in_sec, None);
    }

    #[test]
    fn whitelist_auth_requires_user_code_and_uri() {
        let value = serde_json::json!({ "verification_uri": "u" });
        assert!(whitelist_auth(&value).is_none());
        let value = serde_json::json!({ "user_code": "A" });
        assert!(whitelist_auth(&value).is_none());
        let value = serde_json::json!({ "user_code": "  ", "verification_uri": "u" });
        assert!(whitelist_auth(&value).is_none());
    }
}
