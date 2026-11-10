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
//   read_instance_config— config.json filtered to baseUrl / dashboardUrl /
//                         machineId (never deviceToken / anonKey)
//   cli_info            — `tokenusage --version` presence probe
//   run_cli             — allowlisted CLI subcommand runner (cmd /C)
//   open_in_browser     — http(s)-validated default-browser open
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
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};

const TRAY_ID: &str = "main-tray";
// `device-login` is deliberately absent: the wizard drives it through the
// managed device_login_* commands below — a plain run_cli call would block
// on `.output()` for the whole 16-minute pairing window and a stray second
// spawn would race the first one for config.json.
const CLI_COMMANDS: [&str; 6] = ["sync", "status", "doctor", "reconcile", "pause", "resume"];
const MAX_TRACKER_FILE_BYTES: u64 = 8 * 1024 * 1024;
const DEFAULT_DASHBOARD_URL: &str = "https://token-usage.baiwumm.com";

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

fn spawn_cli_detached(args: &[String]) -> Result<(), String> {
    build_cli_command(args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
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
        gui_command("cmd")
            .args(["/C", "start", "", url])
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
        base_url: non_empty(&parsed.base_url),
        dashboard_url: non_empty(&parsed.dashboard_url),
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
        if matches!(active.child.try_wait(), Ok(None)) {
            return Err("device login is already running".into());
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
    today: MenuItem<tauri::Wry>,
    status: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    paused: Mutex<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayLabels {
    today: String,
    status: String,
    pause_action: String,
    paused: bool,
}

#[tauri::command]
fn update_tray(handles: State<TrayHandles>, labels: TrayLabels) -> Result<(), String> {
    handles
        .today
        .set_text(&labels.today)
        .map_err(|e| e.to_string())?;
    handles
        .status
        .set_text(&labels.status)
        .map_err(|e| e.to_string())?;
    handles
        .pause
        .set_text(&labels.pause_action)
        .map_err(|e| e.to_string())?;
    *handles.paused.lock().map_err(|e| e.to_string())? = labels.paused;
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
    let today = MenuItem::with_id(app, "tray-today", "今日 tokens：…", false, None::<&str>)?;
    let status = MenuItem::with_id(app, "tray-status", "采集：正常", false, None::<&str>)?;
    let sync_now = MenuItem::with_id(app, "sync-now", "立即同步", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause-toggle", "暂停采集", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let dashboard =
        MenuItem::with_id(app, "open-dashboard", "打开 Web 仪表盘", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &today, &status, &sep1, &sync_now, &pause, &sep2, &show, &dashboard, &quit,
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
            "sync-now" => {
                let args = vec!["sync".to_string(), "--auto".to_string()];
                if let Err(err) = spawn_cli_detached(&args) {
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
                if let Err(err) = spawn_cli_detached(&[command.to_string()]) {
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
        today,
        status,
        pause,
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
            read_instance_config,
            cli_info,
            run_cli,
            open_in_browser,
            update_tray,
            tray_status,
            device_login_start,
            device_login_poll,
            device_login_cancel,
        ])
        .setup(|app| {
            create_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: the monitor keeps watching from the tray; a real
            // quit goes through the tray menu so the process stays intentional.
            // When the shell never registered the icon (window lower integrity
            // than the taskbar, e.g. an elevated/UAC-off session) hiding would
            // strand the app with no way back — minimize to the taskbar instead.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    if tray_registered(window.app_handle()) {
                        let _ = window.hide();
                    } else {
                        let _ = window.minimize();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
