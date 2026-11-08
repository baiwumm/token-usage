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

use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, State, WindowEvent,
};

const TRAY_ID: &str = "main-tray";
const CLI_COMMANDS: [&str; 7] = [
    "sync", "status", "doctor", "reconcile", "pause", "resume", "device-login",
];
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
    #[derive(Deserialize, Default)]
    #[serde(default)]
    struct CliConfigFields {
        base_url: Option<String>,
        dashboard_url: Option<String>,
        machine_id: Option<String>,
    }

    let path = tracker_dir(app)?.join("config.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(InstanceConfig {
            base_url: None,
            dashboard_url: None,
            machine_id: None,
        }),
        Err(err) => return Err(err.to_string()),
    };
    let parsed: CliConfigFields =
        serde_json::from_str(&text).map_err(|e| e.to_string())?;
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
    tauri::async_runtime::spawn_blocking(move || {
        match build_cli_command(&owned).output() {
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
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_in_browser(url: String) -> Result<(), String> {
    open_url(&url)
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

fn create_tray(app: &tauri::App) -> tauri::Result<()> {
    let today = MenuItem::with_id(app, "tray-today", "今日 tokens：…", false, None::<&str>)?;
    let status = MenuItem::with_id(app, "tray-status", "采集：正常", false, None::<&str>)?;
    let sync_now = MenuItem::with_id(app, "sync-now", "立即同步", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause-toggle", "暂停采集", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
    let dashboard = MenuItem::with_id(app, "open-dashboard", "打开 Web 仪表盘", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&today, &status, &sep1, &sync_now, &pause, &sep2, &show, &dashboard, &quit],
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
            "quit" => app.exit(0),
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
        .invoke_handler(tauri::generate_handler![
            tracker_paths,
            read_tracker_file,
            read_instance_config,
            cli_info,
            run_cli,
            open_in_browser,
            update_tray,
        ])
        .setup(|app| {
            create_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: the monitor keeps watching from the tray; a real
            // quit goes through the tray menu so the process stays intentional.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
