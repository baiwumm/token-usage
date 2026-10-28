const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const cp = require("node:child_process");
const crypto = require("node:crypto");

const {
  ensureDir,
  writeFileAtomic,
  readJson,
  writeJson,
  chmod600IfPossible,
} = require("../lib/fs");
const { resolveMimoNativeDbPath } = require("../lib/install-resolver");
const { resolveDumateDbPaths } = require("../lib/dumate");
const { expandHome } = require("../lib/scan-roots");
const { prompt, promptHidden } = require("../lib/prompt");
const {
  upsertCodexNotify,
  upsertAcodeNotify,
  upsertEveryCodeNotify,
  readCodexNotify,
  readAcodeNotify,
  readEveryCodeNotify,
  buildCodexNotifyCmd,
  buildAcodeNotifyCmd,
  buildEveryCodeNotifyCmd,
  isManagedNotifyCmd,
} = require("../lib/codex-config");
const {
  upsertClaudeHook,
  upsertClaudeUsageHooks,
  buildClaudeHookCommand,
  buildHookCommand,
  isClaudeHookConfigured,
  areClaudeUsageHooksConfigured,
} = require("../lib/claude-config");
const {
  resolveGeminiConfigDir,
  resolveGeminiSettingsPath,
  buildGeminiHookCommand,
  upsertGeminiHook,
  isGeminiHookConfigured,
} = require("../lib/gemini-config");
const {
  resolveOpencodeConfigDir,
  upsertOpencodePlugin,
  isOpencodePluginInstalled,
} = require("../lib/opencode-config");
const { isCursorInstalled, extractCursorSessionToken } = require("../lib/cursor-config");
const { removeOpenclawHookConfig, probeOpenclawHookState } = require("../lib/openclaw-hook");
const {
  installOpenclawSessionPlugin,
  probeOpenclawSessionPluginState,
} = require("../lib/openclaw-session-plugin");
const {
  resolveGrokHome,
  resolveGrokHooksDir,
  upsertGrokHook,
  probeGrokHookState,
  removeGrokHook,
  GROK_HOOK_FILENAME
} = require("../lib/grok-hook");
const {
  upsertOmpHook,
  probeOmpHookState,
} = require("../lib/omp-hook");
const { resolveTrackerPaths } = require("../lib/tracker-paths");
const {
  resolveOmpAgentDir,
  resolvePiAgentDir,
  piAgentDirCollidesWithOmp,
  resolvePrimeAgentDir,
  resolveMinimaxCodeSessionsDir,
  resolveCommandCodeHome,
  resolveLmstudioLogFiles,
  resolveUnslothDbPath,
  resolveAnythingllmDbPath,
  resolveDevinDbPath,
  resolveReasonixHome,
  resolveMuseHome,
  resolveTraeStoragePath,
} = require("../lib/rollout");
const { resolveRuntimeConfig, DEFAULT_BASE_URL, DEFAULT_DASHBOARD_URL, normalizeInstanceBaseUrl, assertInsforgeRuntime,
  clearDeviceIdentity, resetInstanceState } = require("../lib/runtime-config");
const { registerWindowsScheduledTask, TASK_NAME, cliEntryPath } = require("../lib/scheduled-task");
const { runtimeReadyMarkerPath } = require("../lib/runtime-entry");
const {
  BOLD,
  DIM,
  CYAN,
  RESET,
  color,
  isInteractive,
  promptMenu,
  createSpinner,
} = require("../lib/cli-ui");
const { renderLocalReport, renderAuthTransition, renderSuccessBox } = require("../lib/init-flow");
const { maybeShowStarCta } = require("../lib/star-cta");

const ASCII_LOGO = [
  "████████╗ ██████╗ ██╗  ██╗███████╗███╗   ██╗",
  "╚══██╔══╝██╔═══██╗██║ ██╔╝██╔════╝████╗  ██║",
  "   ██║   ██║   ██║█████╔╝ █████╗  ██╔██╗ ██║",
  "   ██║   ██║   ██║██╔═██╗ ██╔══╝  ██║╚██╗██║",
  "   ██║   ╚██████╔╝██║  ██╗███████╗██║ ╚████║",
  "   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝",
  " ██╗   ██╗███████╗ █████╗  ██████╗ ███████╗",
  " ██║   ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝",
  " ██║   ██║███████╗███████║██║  ███╗█████╗",
  " ██║   ██║╚════██║██╔══██║██║   ██║██╔══╝",
  " ╚██████╔╝███████║██║  ██║╚██████╔╝███████╗",
  "  ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝",
].join("\n");

const DIVIDER = "----------------------------------------------";
// NOTE: the effective default dashboard/base URL lives in lib/runtime-config
// (DEFAULT_DASHBOARD_URL = the production deployment). A local copy here went
// stale when the deployment moved (audit fix: the dead hardcoded landing
// domain was removed and guarded against by test/audit-fixes.test.js) —
// resolve it through runtime-config, never re-declare it.

// Single source of truth for the welcome screen's provider count + sample list.
// test/discovery-metadata.test.js keeps this aligned with public tool copy.
const SUPPORTED_PROVIDERS = [
  "Claude Code",
  "Codex CLI",
  "AStudio",
  "Cursor",
  "Gemini CLI",
  "Antigravity",
  "Kiro",
  "OpenCode",
  "OpenClaw",
  "Every Code",
  "Hermes Agent",
  "GitHub Copilot",
  "Kimi Code",
  "CodeBuddy",
  "WorkBuddy",
  "WorkBuddy AI",
  "Grok Build",
  "oh-my-pi",
  "OmO",
  "pi",
  "Dots",
  "Prime Agent",
  "Craft Agents",
  "Reasonix",
  "Muse Code",
  "Kilo CLI",
  "Kilo Code",
  "Roo Code",
  "Zed Agent",
  "Goose",
  "Droid",
  "Mimo",
  "DuMate",
  "ZCode",
  "Qoder",
  "AnythingLLM Desktop",
  "Claude Science",
  "DeepSeek Harness",
  "TRAE Work CN",
  "TRAE",
  "LM Studio",
  "Unsloth Studio",
  "Devin CLI",
  "Cline",
  "MiniMax Code",
  "Command Code",
];

async function cmdInit(argv, options = {}) {
  const opts = parseArgs(argv);
  const home = options.home || os.homedir();
  if (opts.anonKeyFile) opts.anonKey = (await fs.readFile(opts.anonKeyFile, "utf8")).trim();

  const { rootDir, trackerDir, binDir } = await resolveTrackerPaths({ home });

  const configPath = path.join(trackerDir, "config.json");
  const notifyOriginalPath = path.join(trackerDir, "codex_notify_original.json");
  const linkCodeStatePath = path.join(trackerDir, "link_code_state.json");

  const existingConfig = await readJson(configPath);
  const runtime = resolveRuntimeConfig({
    cli: { baseUrl: opts.baseUrl, dashboardUrl: opts.dashboardUrl, anonKey: opts.anonKey },
    config: existingConfig || {},
    env: process.env,
  });
  assertInsforgeRuntime(runtime);
  const notifyPath = path.join(binDir, "notify.cjs");
  const appDir = path.join(trackerDir, "app");
  const trackerBinPath = path.join(appDir, "bin", "tracker.js");

  renderWelcome(runtime.dashboardUrl || DEFAULT_DASHBOARD_URL);

  if (opts.dryRun) {
    process.stdout.write(`${color("Dry run: preview only (no changes applied).", DIM)}\n\n`);
  }

  if (isInteractive() && !opts.yes && !opts.dryRun) {
    const choice = await promptMenu({
      message: "? Proceed with installation?",
      options: ["Yes, configure my environment", "No, exit"],
      defaultIndex: 0,
    });
    const normalizedChoice = String(choice || "")
      .trim()
      .toLowerCase();
    if (normalizedChoice.startsWith("no") || normalizedChoice.includes("exit")) {
      process.stdout.write("Setup cancelled.\n");
      return;
    }
  }

  if (opts.dryRun) {
    const preview = await buildDryRunSummary({
      opts,
      home,
      trackerDir,
      notifyPath,
      runtime,
    });
    renderLocalReport({ summary: preview.summary, isDryRun: true });
    renderAccountNotLinked({ context: "dry-run" });
    return;
  }

  const spinner = createSpinner({ text: "Analyzing and configuring local environment..." });
  spinner.start();
  let setup;
  try {
    setup = await runSetup({
      opts,
      home,
      trackerDir,
      binDir,
      configPath,
      notifyOriginalPath,
      linkCodeStatePath,
      notifyPath,
      appDir,
      trackerBinPath,
      runtime,
      existingConfig,
    });
  } catch (err) {
    spinner.stop();
    throw err;
  }
  spinner.stop();

  renderLocalReport({ summary: setup.summary, isDryRun: false });

  // Run first sync inline (with a generous timeout) so we can render the
  // *actual* token total in the success message — the aha moment. If the
  // sync exceeds the timeout we surrender the wait but leave it running, so
  // the dashboard still picks up data shortly after.
  const ahaSpinner = createSpinner({ text: "Running first sync..." });
  ahaSpinner.start();
  let firstSync = null;
  try {
    firstSync = await runFirstSyncAndRead({
      trackerBinPath,
      trackerDir,
      packageName: "tokenusage",
    });
  } catch (err) {
    const msg = err && err.message ? err.message : "unknown error";
    process.stderr.write(`Initial sync issue: ${msg}\n`);
  } finally {
    ahaSpinner.stop();
  }

  renderLocalSuccess({ firstSync, dashboardUrl: runtime.dashboardUrl || DEFAULT_DASHBOARD_URL });
  await maybeShowStarCta({ trackerDir });
}

function renderWelcome(dashboardUrl = DEFAULT_DASHBOARD_URL) {
  const providerCount = SUPPORTED_PROVIDERS.length;
  // Show first 5 by name for grounding, then "+N more" so the line stays one row.
  const previewNames = SUPPORTED_PROVIDERS.slice(0, 5).join(", ");
  const remaining = providerCount - 5;
  const providerLine =
    remaining > 0
      ? `${previewNames} +${remaining} more`
      : previewNames;
  process.stdout.write(
    [
      ASCII_LOGO,
      "",
      `${BOLD}Token Usage${RESET}  ${color("Local-first usage across " + providerCount + " AI CLIs", DIM)}`,
      DIVIDER,
      `${CYAN}Nothing leaves your machine — token counts only, never prompts or responses.${RESET}`,
      DIVIDER,
      "",
      `  Tracks: ${providerLine}`,
      `  Dashboard: ${dashboardUrl}`,
      "",
    ].join("\n"),
  );
}

function renderLocalSuccess({ firstSync, dashboardUrl = DEFAULT_DASHBOARD_URL } = {}) {
  const lines = ["", `${BOLD}Setup complete!${RESET}`, ""];

  if (firstSync && firstSync.totalTokens > 0) {
    const tokens = firstSync.totalTokens.toLocaleString("en-US");
    const sourceCount = firstSync.sources.length;
    const sourceWord = sourceCount === 1 ? "provider" : "providers";
    lines.push(
      `  ${BOLD}${tokens}${RESET} tokens tracked across ${sourceCount} ${sourceWord}.`,
    );
  } else {
    lines.push(
      "  No usage history yet — run any AI CLI and tokens appear within a minute.",
    );
  }

  lines.push(
    "",
    `  Dashboard: ${CYAN}${dashboardUrl}${RESET}`,
    "",
  );
  process.stdout.write(lines.join("\n"));
}

function renderAccountNotLinked({ context } = {}) {
  if (context === "dry-run") {
    process.stdout.write(
      [
        "",
        "Dry run complete. Run init without --dry-run to apply changes.",
        "",
      ].join("\n"),
    );
    return;
  }
  renderLocalSuccess();
}

function shouldUseBrowserAuth({ deviceToken, opts }) {
  if (deviceToken) return false;
  if (opts.noAuth) return false;
  if (opts.linkCode) return false;
  if (opts.email || opts.password) return false;
  return true;
}

async function buildDryRunSummary({ opts, home, trackerDir, notifyPath, runtime }) {
  const deviceToken = runtime?.deviceToken || null;
  const pendingBrowserAuth = shouldUseBrowserAuth({ deviceToken, opts });
  if (opts.noIntegrations) {
    return {
      summary: [{
        label: "Integrations",
        status: "skipped",
        detail: "Skipped (--no-integrations); tool configs stay untouched",
      }],
      pendingBrowserAuth,
      deviceToken,
    };
  }
  const context = buildIntegrationTargets({ home, trackerDir, notifyPath });
  const summary = await previewIntegrations({ context });
  return { summary, pendingBrowserAuth, deviceToken };
}

async function runSetup({
  opts,
  home,
  trackerDir,
  binDir,
  configPath,
  notifyOriginalPath,
  linkCodeStatePath,
  notifyPath,
  appDir,
  trackerBinPath,
  runtime,
  existingConfig,
}) {
  await ensureDir(trackerDir);
  await ensureDir(binDir);
  let deviceToken = runtime?.deviceToken || null;
  let deviceId = existingConfig?.deviceId || null;
  const installedAt = existingConfig?.installedAt || new Date().toISOString();
  let pendingBrowserAuth = false;

  const runtimeCopy = await installLocalTrackerApp({ appDir });

  const existingPlainConfig =
    existingConfig && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? existingConfig
      : {};
  const previousRuntime = resolveRuntimeConfig({ config: existingPlainConfig, env: {} });
  const changedInstance = normalizeInstanceBaseUrl(previousRuntime.baseUrl) !== runtime.baseUrl ||
    previousRuntime.anonKey !== runtime.anonKey;
  if (changedInstance) {
    resetInstanceState(trackerDir);
    deviceToken = null; deviceId = null;
  }
  const config = {
    ...(changedInstance ? clearDeviceIdentity(existingPlainConfig) : existingPlainConfig),
    installedAt,
    // Keep a persisted legacy URL until the first sync. sync owns the migration
    // lock and must reset the upload offset/backoff before removing this marker;
    // rewriting it here would skip the historical replay permanently.
    baseUrl: opts.baseUrl || existingPlainConfig.baseUrl || DEFAULT_BASE_URL,
  };
  if (changedInstance || opts.dashboardUrl) {
    config.dashboardUrl = runtime.dashboardUrl;
  }
  if (changedInstance || opts.anonKey || runtime.sources.anonKey === "env") config.anonKey = runtime.anonKey;
  if (runtime.baseUrl !== DEFAULT_BASE_URL) {
    config.baseUrl = runtime.baseUrl;
    config.dashboardUrl = runtime.dashboardUrl;
  }
  // §2.11 run-report persistence (default on; --run-report=off disables the
  // per-run telemetry POST).
  if (opts.runReport != null) config.runReport = opts.runReport;

  await writeJson(configPath, config);
  await chmod600IfPossible(configPath);

  await writeNotifyHandler({ trackerDir, notifyPath });

  // --no-integrations (0.2.2): machines that only want scheduled scanning can
  // take over the task without the CLI touching any tool's config — hooks,
  // notify entries and the opencode plugin all stay exactly as they are.
  const summary = opts.noIntegrations
    ? [{
        label: "Integrations",
        status: "skipped",
        detail: "Skipped (--no-integrations); tool configs stay untouched",
      }]
    : await applyIntegrationSetup({
        home,
        trackerDir,
        notifyPath,
        notifyOriginalPath,
        dryRun: Boolean(opts.dryRun),
      });

  if (runtimeCopy.ok === false) {
    // Never silent: a missing runtime copy degrades collection to the installed
    // package/npx, so it must show up in the report (and on stderr, since the
    // report line is dimmed as "skipped").
    const detail = describeRuntimeCopyFailure(runtimeCopy);
    process.stderr.write(
      `Runtime copy skipped (${detail}); notify and the scheduled task will use the installed CLI.\n`,
    );
    summary.push({ label: "Runtime copy", status: "skipped", detail });
  }

  // Windows scheduled task takeover (0.2.0): hourly auto sync behind a hidden
  // VBS runner — no conhost flash, no shell redirect (sync self-logs to the
  // rolling logs/sync.log). Best-effort; pause/resume toggle this task.
  if (opts.noTask) {
    summary.push({
      label: "Scheduled task",
      status: "skipped",
      detail: "Skipped (--no-task); auto syncs stay manual",
    });
  } else {
    // The VBS targets the package's bin entry (scheduled-task.js owns that
    // path): pointing it at src/cli.js makes the hidden task a no-op. The
    // runtime copy refresh below is also the task's fallback, so an nvm switch
    // (which drops the version-specific npm prefix) does not kill collection —
    // but only a copy with its readiness marker counts as usable.
    const fallbackCliJs =
      runtimeCopy.ok === true && fssync.existsSync(runtimeReadyMarkerPath(appDir))
        ? trackerBinPath
        : undefined;
    const taskOutcome = registerWindowsScheduledTask({ binDir, fallbackCliJs });
    summary.push({
      label: "Scheduled task",
      status: taskOutcome.registered ? "installed" : "skipped",
      detail: taskOutcome.registered
        ? `${TASK_NAME}: hourly, hidden window (pause/resume toggles it)`
        : taskOutcome.reason === "not_windows"
          ? "Windows-only; use cron/launchd + `tokenusage pause` elsewhere"
          : `Not registered: ${taskOutcome.reason}`,
    });
  }

  return {
    summary,
    pendingBrowserAuth,
    deviceToken,
    deviceId,
    installedAt,
  };
}

async function writeNotifyHandler({ trackerDir, binDir, notifyPath, packageName = "tokenusage-cli" }) {
  const resolvedNotifyPath =
    notifyPath || path.join(binDir || path.join(path.dirname(trackerDir), "bin"), "notify.cjs");
  await ensureDir(path.dirname(resolvedNotifyPath));
  await writeFileAtomic(
    resolvedNotifyPath,
    buildNotifyHandler({ trackerDir, packageName }),
  );
  await fs.chmod(resolvedNotifyPath, 0o755).catch(() => {});
  return resolvedNotifyPath;
}

async function repairCodexNotifyIntegration({ home = os.homedir(), trackerDir, binDir, safeMode = true } = {}) {
  const paths = trackerDir && binDir ? { trackerDir, binDir } : await resolveTrackerPaths({ home });
  const resolvedTrackerDir = trackerDir || paths.trackerDir;
  const resolvedBinDir = binDir || paths.binDir;
  const notifyPath = await writeNotifyHandler({
    trackerDir: resolvedTrackerDir,
    binDir: resolvedBinDir,
  });
  const context = buildIntegrationTargets({
    home,
    trackerDir: resolvedTrackerDir,
    notifyPath,
  });
  const codexProbe = await probeFile(context.codexConfigPath);
  if (!codexProbe.exists) {
    return { changed: false, skippedReason: "config-missing", notifyPath };
  }

  const currentNotify = await readCodexNotify(context.codexConfigPath);
  if (arraysEqual(currentNotify, context.notifyCmd)) {
    return { changed: false, skippedReason: null, notifyPath };
  }

  const repairDecision = safeMode
    ? await shouldRepairCodexNotify({
        currentNotify,
        expectedNotify: context.notifyCmd,
        notifyOriginalPath: context.notifyOriginalPath,
      })
    : { repair: true, captureOriginal: true, replaceOriginal: false };
  if (!repairDecision.repair) {
    return { changed: false, skippedReason: repairDecision.reason || "external-notify", notifyPath };
  }

  const result = await upsertCodexNotify({
    codexConfigPath: context.codexConfigPath,
    notifyCmd: context.notifyCmd,
    notifyOriginalPath: context.notifyOriginalPath,
    captureOriginal: repairDecision.captureOriginal,
    replaceOriginal: repairDecision.replaceOriginal,
  });
  return { ...result, skippedReason: null, notifyPath };
}

async function repairAcodeNotifyIntegration({ home = os.homedir(), trackerDir, binDir, safeMode = true } = {}) {
  const paths = trackerDir && binDir ? { trackerDir, binDir } : await resolveTrackerPaths({ home });
  const resolvedTrackerDir = trackerDir || paths.trackerDir;
  const resolvedBinDir = binDir || paths.binDir;
  const notifyPath = await writeNotifyHandler({
    trackerDir: resolvedTrackerDir,
    binDir: resolvedBinDir,
  });
  const context = buildIntegrationTargets({
    home,
    trackerDir: resolvedTrackerDir,
    notifyPath,
  });
  const acodeProbe = await probeFile(context.acodeConfigPath);
  if (!acodeProbe.exists) {
    return { changed: false, skippedReason: "config-missing", notifyPath };
  }

  const currentNotify = await readAcodeNotify(context.acodeConfigPath);
  if (arraysEqual(currentNotify, context.acodeNotifyCmd)) {
    return { changed: false, skippedReason: null, notifyPath };
  }

  const repairDecision = safeMode
    ? await shouldRepairCodexNotify({
        currentNotify,
        expectedNotify: context.acodeNotifyCmd,
        notifyOriginalPath: context.acodeNotifyOriginalPath,
      })
    : { repair: true, captureOriginal: true, replaceOriginal: false };
  if (!repairDecision.repair) {
    return { changed: false, skippedReason: repairDecision.reason || "external-notify", notifyPath };
  }

  const result = await upsertAcodeNotify({
    acodeConfigPath: context.acodeConfigPath,
    notifyCmd: context.acodeNotifyCmd,
    notifyOriginalPath: context.acodeNotifyOriginalPath,
    captureOriginal: repairDecision.captureOriginal,
    replaceOriginal: repairDecision.replaceOriginal,
  });
  return { ...result, skippedReason: null, notifyPath };
}

async function repairRuntimeIntegrations({
  home = os.homedir(),
  trackerDir,
  binDir,
  safeMode = true,
} = {}) {
  const paths = trackerDir && binDir ? { trackerDir, binDir } : await resolveTrackerPaths({ home });
  const resolvedTrackerDir = trackerDir || paths.trackerDir;
  const resolvedBinDir = binDir || paths.binDir;
  const notifyPath = await writeNotifyHandler({
    trackerDir: resolvedTrackerDir,
    binDir: resolvedBinDir,
  });
  const context = buildIntegrationTargets({
    home,
    trackerDir: resolvedTrackerDir,
    notifyPath,
  });
  const integrations = {};
  const warnings = [];

  const attempt = async (key, work) => {
    try {
      integrations[key] = await work();
    } catch (error) {
      integrations[key] = { changed: false, skippedReason: "repair-failed" };
      warnings.push({ integration: key, error: error?.message || String(error) });
    }
  };

  await attempt("codex", () => repairCodexNotifyIntegration({
    home,
    trackerDir: resolvedTrackerDir,
    binDir: resolvedBinDir,
    safeMode,
  }));
  await attempt("acode", () => repairAcodeNotifyIntegration({
    home,
    trackerDir: resolvedTrackerDir,
    binDir: resolvedBinDir,
    safeMode,
  }));

  const hookRepairs = [
    ["claude", context.claudeDir, () => upsertClaudeUsageHooks({
      settingsPath: context.claudeSettingsPath,
      hookCommand: context.claudeHookCommand,
    })],
    ["gemini", context.geminiConfigDir, () => upsertGeminiHook({
      settingsPath: context.geminiSettingsPath,
      hookCommand: context.geminiHookCommand,
    })],
    ["codebuddy", context.codebuddyDir, () => upsertClaudeHook({
      settingsPath: context.codebuddySettingsPath,
      hookCommand: context.codebuddyHookCommand,
    })],
    ["workbuddy", context.workbuddyDir, () => upsertClaudeHook({
      settingsPath: context.workbuddySettingsPath,
      hookCommand: context.workbuddyHookCommand,
    })],
    ["workbuddy-ai", context.workbuddyAiDir, () => upsertClaudeHook({
      settingsPath: context.workbuddyAiSettingsPath,
      hookCommand: context.workbuddyAiHookCommand,
    })],
  ];
  for (const [key, configDir, repair] of hookRepairs) {
    if (await isDir(configDir)) await attempt(key, repair);
    else integrations[key] = { changed: false, skippedReason: "config-missing" };
  }

  if (await isDir(context.opencodeConfigDir)) {
    await attempt("opencode", () => upsertOpencodePlugin({
      configDir: context.opencodeConfigDir,
      notifyPath,
    }));
  } else {
    integrations.opencode = { changed: false, skippedReason: "config-missing" };
  }

  return { notifyPath, integrations, warnings };
}

function buildIntegrationTargets({ home, trackerDir, notifyPath }) {
  const codexHome = process.env.CODEX_HOME || path.join(home, ".codex");
  const codexConfigPath = path.join(codexHome, "config.toml");
  const acodeHome = process.env.TOKENUSAGE_ACODE_HOME || path.join(home, ".acode");
  const acodeConfigPath = path.join(acodeHome, "config.toml");
  const codeHome = process.env.CODE_HOME || path.join(home, ".code");
  const codeConfigPath = path.join(codeHome, "config.toml");
  const notifyOriginalPath = path.join(trackerDir, "codex_notify_original.json");
  const acodeNotifyOriginalPath = path.join(trackerDir, "acode_notify_original.json");
  const codeNotifyOriginalPath = path.join(trackerDir, "code_notify_original.json");
  const notifyCmd = buildCodexNotifyCmd(notifyPath);
  const acodeNotifyCmd = buildAcodeNotifyCmd(notifyPath);
  const codeNotifyCmd = buildEveryCodeNotifyCmd(notifyPath);
  const claudeDir = path.join(home, ".claude");
  const claudeSettingsPath = path.join(claudeDir, "settings.json");
  const claudeHookCommand = buildClaudeHookCommand(notifyPath);
  // CodeBuddy CLI (Tencent) is a Claude-Code fork — same settings.json hook
  // schema, same SessionEnd event. We install the same hook with a different
  // --source token so notify.cjs / sync know which provider triggered.
  const codebuddyDir = process.env.CODEBUDDY_HOME || path.join(home, ".codebuddy");
  const codebuddySettingsPath = path.join(codebuddyDir, "settings.json");
  const codebuddyHookCommand = buildHookCommand(notifyPath, "codebuddy");
  // WorkBuddy CLI (Tencent) is the same Claude-Code-fork hook schema as CodeBuddy.
  const workbuddyDir = process.env.WORKBUDDY_HOME || path.join(home, ".workbuddy");
  const workbuddySettingsPath = path.join(workbuddyDir, "settings.json");
  const workbuddyHookCommand = buildHookCommand(notifyPath, "workbuddy");
  // WorkBuddy AI is the international build of the very same CLI. It keeps its
  // data in a sibling home (~/.workbuddy-ai), so it needs its own hook install
  // and its own --source token to be attributed separately from the CN build.
  const workbuddyAiDir = expandHome(process.env.WORKBUDDY_AI_HOME, home) || path.join(home, ".workbuddy-ai");
  const workbuddyAiSettingsPath = path.join(workbuddyAiDir, "settings.json");
  const workbuddyAiHookCommand = buildHookCommand(notifyPath, "workbuddy-ai");
  const geminiConfigDir = resolveGeminiConfigDir({ home, env: process.env });
  const geminiSettingsPath = resolveGeminiSettingsPath({ configDir: geminiConfigDir });
  const geminiHookCommand = buildGeminiHookCommand(notifyPath);
  const opencodeConfigDir = resolveOpencodeConfigDir({ home, env: process.env });

  return {
    trackerDir,
    codexConfigPath,
    acodeConfigPath,
    codeConfigPath,
    notifyOriginalPath,
    acodeNotifyOriginalPath,
    codeNotifyOriginalPath,
    notifyCmd,
    acodeNotifyCmd,
    codeNotifyCmd,
    claudeDir,
    claudeSettingsPath,
    claudeHookCommand,
    codebuddyDir,
    codebuddySettingsPath,
    codebuddyHookCommand,
    workbuddyDir,
    workbuddySettingsPath,
    workbuddyHookCommand,
    workbuddyAiDir,
    workbuddyAiSettingsPath,
    workbuddyAiHookCommand,
    geminiConfigDir,
    geminiSettingsPath,
    geminiHookCommand,
    opencodeConfigDir,
  };
}

async function applyIntegrationSetup({
  home,
  trackerDir,
  notifyPath,
  notifyOriginalPath,
  dryRun = false,
}) {
  const context = buildIntegrationTargets({ home, trackerDir, notifyPath });
  context.notifyOriginalPath = notifyOriginalPath;

  const summary = [];

  const codexProbe = await probeFile(context.codexConfigPath);
  if (codexProbe.exists) {
    const currentNotify = await readCodexNotify(context.codexConfigPath);
    const result = await upsertCodexNotify({
      codexConfigPath: context.codexConfigPath,
      notifyCmd: context.notifyCmd,
      notifyOriginalPath: context.notifyOriginalPath,
      replaceOriginal: shouldReplaceStoredOriginalNotify(currentNotify, context.notifyCmd),
    });
    summary.push({
      label: "Codex CLI",
      status: result.changed ? "updated" : "set",
      detail: result.changed ? "Updated config" : "Config already set",
    });
  } else {
    summary.push({ label: "Codex CLI", status: "skipped", detail: renderSkipDetail(codexProbe) });
  }

  const acodeProbe = await probeFile(context.acodeConfigPath);
  if (acodeProbe.exists) {
    const currentNotify = await readAcodeNotify(context.acodeConfigPath);
    const result = await upsertAcodeNotify({
      acodeConfigPath: context.acodeConfigPath,
      notifyCmd: context.acodeNotifyCmd,
      notifyOriginalPath: context.acodeNotifyOriginalPath,
      replaceOriginal: shouldReplaceStoredOriginalNotify(currentNotify, context.acodeNotifyCmd),
    });
    summary.push({
      label: "AStudio",
      status: result.changed ? "updated" : "set",
      detail: result.changed ? "Updated config" : "Config already set",
    });
  } else {
    summary.push({ label: "AStudio", status: "skipped", detail: renderSkipDetail(acodeProbe) });
  }

  const claudeDirExists = await isDir(context.claudeDir);
  if (claudeDirExists) {
    await upsertClaudeUsageHooks({
      settingsPath: context.claudeSettingsPath,
      hookCommand: context.claudeHookCommand,
    });
    summary.push({ label: "Claude", status: "installed", detail: "Hooks installed" });
  } else {
    summary.push({ label: "Claude", status: "skipped", detail: "Config not found" });
  }

  const geminiConfigExists = await isDir(context.geminiConfigDir);
  if (geminiConfigExists) {
    await upsertGeminiHook({
      settingsPath: context.geminiSettingsPath,
      hookCommand: context.geminiHookCommand,
    });
    summary.push({ label: "Gemini", status: "installed", detail: "Hooks installed" });
  } else {
    summary.push({ label: "Gemini", status: "skipped", detail: "Config not found" });
  }

  const opencodeResult = await upsertOpencodePlugin({
    configDir: context.opencodeConfigDir,
    notifyPath,
  });
  if (opencodeResult?.skippedReason === "config-missing") {
    summary.push({ label: "Opencode Plugin", status: "skipped", detail: "Config not found" });
  } else {
    summary.push({
      label: "Opencode Plugin",
      status: opencodeResult?.changed ? "installed" : "set",
      detail: "Plugin installed",
    });
  }

  // Cursor (API-based, no hooks needed)
  if (isCursorInstalled({ home })) {
    const cursorAuth = extractCursorSessionToken({ home });
    if (cursorAuth) {
      summary.push({
        label: "Cursor",
        status: "detected",
        detail: "Usage synced via Cursor API (no hooks needed)",
      });
    } else {
      summary.push({
        label: "Cursor",
        status: "skipped",
        detail: "Installed but not logged in (login in Cursor to enable)",
      });
    }
  } else {
    summary.push({ label: "Cursor", status: "skipped", detail: "Not installed" });
  }

  // Kimi: passive reader — no hook installation needed.
  // Token Usage reads both legacy ~/.kimi/ and official ~/.kimi-code/ sessions.
  {
    const kimiHome = process.env.KIMI_HOME || path.join(home, ".kimi");
    const kimiCodeHome = process.env.KIMI_CODE_HOME || path.join(home, ".kimi-code");
    const fssync = require("node:fs");
    if (fssync.existsSync(path.join(kimiHome, "sessions")) || fssync.existsSync(path.join(kimiCodeHome, "sessions"))) {
      summary.push({ label: "Kimi Code", status: "detected", detail: "Passive reader (no hook needed)" });
    }
  }

  // oh-my-pi: passive session scan always works; also install an optional
  // notify extension so turn_end triggers sync --source omp near-real-time.
  {
    const fssyncLocal = require("node:fs");
    const ompAgentDir = resolveOmpAgentDir(process.env);
    const ompSessions = ompAgentDir && fssyncLocal.existsSync(path.join(ompAgentDir, "sessions"));
    if (ompAgentDir && (ompSessions || fssyncLocal.existsSync(ompAgentDir))) {
      if (dryRun) {
        const probe = await probeOmpHookState({ home, trackerDir, env: process.env });
        summary.push({
          label: "oh-my-pi",
          status: "detected",
          detail: probe.configured
            ? "Notify extension already installed (passive scan still runs)"
            : "Will install notify extension + keep passive scan",
        });
      } else {
        const result = await upsertOmpHook({ home, trackerDir, env: process.env });
        if (result.written) {
          summary.push({
            label: "oh-my-pi",
            status: "installed",
            detail: `Notify extension → ${result.extensionPath} (passive scan still runs)`,
          });
        } else if (result.skippedReason === "unmanaged-extension-present") {
          summary.push({
            label: "oh-my-pi",
            status: "skipped",
            detail: "Existing unmanaged tokenusage-notify extension left untouched",
          });
        } else {
          summary.push({
            label: "oh-my-pi",
            status: "detected",
            detail: "Passive reader (notify extension not written)",
          });
        }
      }
    }
  }

  // pi (@mariozechner/pi-coding-agent): passive reader — no hook installation needed.
  // Token Usage reads ~/.pi/agent/sessions/**/*.jsonl directly. Skip when its
  // agent dir collides with omp's so the summary matches what sync will scan.
  if (!piAgentDirCollidesWithOmp(process.env)) {
    // Same win32 nullability as oh-my-pi above: resolvePiAgentDir is null when
    // ~/.pi doesn't exist, so guard before joining.
    const piAgentDir = resolvePiAgentDir(process.env);
    if (piAgentDir && fssync.existsSync(path.join(piAgentDir, "sessions"))) {
      summary.push({ label: "pi", status: "detected", detail: "Passive reader (no hook needed)" });
    }
  }

  // Prime Agent: metadata-only passive reader — no hook installation needed.
  {
    const primeAgentDir = resolvePrimeAgentDir(process.env);
    if (primeAgentDir && fssync.existsSync(path.join(primeAgentDir, "sessions"))) {
      summary.push({ label: "Prime Agent", status: "detected", detail: "Passive usage reader (no hook needed)" });
    }
  }

  // MiniMax Code: passive reader of ~/.minimax/v2/sessions — no hook installation needed.
  {
    const minimaxCodeSessionsDir = resolveMinimaxCodeSessionsDir(process.env);
    if (minimaxCodeSessionsDir && fssync.existsSync(minimaxCodeSessionsDir)) {
      summary.push({ label: "MiniMax Code", status: "detected", detail: "Passive usage reader (no hook needed)" });
    }
  }

  // Command Code (`cmd`): passive reader of ~/.commandcode/projects — no hook
  // installation needed, and none exists to install.
  {
    const commandCodeProjectsDir = path.join(resolveCommandCodeHome(process.env), "projects");
    if (fssync.existsSync(commandCodeProjectsDir)) {
      summary.push({ label: "Command Code", status: "detected", detail: "Passive session reader (no hook needed)" });
    }
  }

  // Craft Agents: passive reader — no hook installation needed.
  // Token Usage reads ~/.craft-agent/workspaces/<id>/sessions/**/session.jsonl
  // (and any user-relocated workspace listed in ~/.craft-agent/config.json).
  {
    const craftConfigDir = process.env.CRAFT_CONFIG_DIR || path.join(home, ".craft-agent");
    if (fssync.existsSync(craftConfigDir)) {
      summary.push({ label: "Craft Agents", status: "detected", detail: "Passive reader (no hook needed)" });
    }
  }

  // Reasonix: passive reader of content-free *.jsonl.telemetry.json sidecars.
  {
    const reasonixHome = resolveReasonixHome(process.env);
    if (fssync.existsSync(reasonixHome)) {
      summary.push({ label: "Reasonix", status: "detected", detail: "Passive telemetry reader (no hook needed)" });
    }
  }

  // Muse Code: passive reader of ~/.local/share/muse/sessions/**/session.jsonl.
  {
    if (fssync.existsSync(path.join(resolveMuseHome(process.env), "sessions"))) {
      summary.push({ label: "Muse Code", status: "detected", detail: "Passive session reader (no hook needed)" });
    }
  }

  // International TRAE usage is read locally; no hook or vendor login is needed.
  {
    const { resolveTraeDbPaths } = require("../lib/trae-db");
    const traeDbPaths = resolveTraeDbPaths(process.env);
    const traeStoragePath = resolveTraeStoragePath(process.env);
    if (traeDbPaths.length || traeStoragePath) {
      summary.push({
        label: "TRAE",
        status: "detected",
        detail: traeDbPaths.length
          ? "Local usage reader (shared application key; optional TOKENUSAGE_TRAE_SQLCIPHER_KEY override)"
          : "Plan info only — no local usage database found",
      });
    }
  }

  // Grok Build (xAI): SessionEnd hook in ~/.grok/hooks/ + handler in ~/.tokenusage/bin/
  {
    try {
      const grokState = await probeGrokHookState({ home, trackerDir, env: process.env });
      if (grokState.hasGrokInstall) {
        const grokRes = await upsertGrokHook({ home, trackerDir, env: process.env });
        summary.push({
          label: "Grok Build",
          status: grokRes.configured ? "installed" : "detected",
          detail: grokRes.configured ? "SessionEnd hook installed (99-tokenusage-usage.json)" : "Grok detected"
        });
      }
    } catch (err) {
      summary.push({ label: "Grok Build", status: "error", detail: String(err?.message || err) });
    }
  }

  // Kilo CLI (kilo.ai @kilocode/plugin): passive reader — no hook installation
  // needed. Reuses OpenCode-fork SQLite schema at ~/.local/share/kilo/kilo.db
  // (override via KILO_HOME).
  {
    const xdgDataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
    const kiloHome = process.env.KILO_HOME || path.join(xdgDataHome, "kilo");
    const kiloDbPath = path.join(kiloHome, "kilo.db");
    if (fssync.existsSync(kiloDbPath)) {
      summary.push({ label: "Kilo CLI", status: "detected", detail: "Passive reader (no hook needed)" });
    }
  }

  {
    const dumateDbPaths = resolveDumateDbPaths({ home });
    if (dumateDbPaths.length > 0) {
      summary.push({ label: "DuMate", status: "detected", detail: "Passive reader (no hook needed)" });
    }
  }

  // Mimo (mimocode): passive reader — no hook installation needed. Reuses the
  // OpenCode-fork SQLite schema at ~/.local/share/mimocode/mimocode.db
  // (override via MIMO_HOME).
  {
    const mimoDbPath = resolveMimoNativeDbPath({ home });
    if (fssync.existsSync(mimoDbPath)) {
      summary.push({ label: "Mimo", status: "detected", detail: "Passive reader (no hook needed)" });
    }
  }

  // LM Studio and Unsloth Studio: passive readers — no hooks needed.
  {
    const lmstudioLogFiles = await resolveLmstudioLogFiles(process.env);
    if (lmstudioLogFiles.length > 0) {
      summary.push({
        label: "LM Studio",
        status: "detected",
        detail: `Passive reader · ${lmstudioLogFiles.length} log${lmstudioLogFiles.length !== 1 ? "s" : ""}`,
      });
    }
  }

  {
    const unslothDbPath = resolveUnslothDbPath(process.env);
    if (unslothDbPath && fssync.existsSync(unslothDbPath)) {
      summary.push({
        label: "Unsloth Studio",
        status: "detected",
        detail: "Passive reader (no hook needed)",
      });
    }
  }

  // AnythingLLM Desktop: passive SQLite reader — no hook installation needed.
  {
    const anythingllmDbPath = resolveAnythingllmDbPath(process.env);
    if (anythingllmDbPath && fssync.existsSync(anythingllmDbPath)) {
      summary.push({
        label: "AnythingLLM Desktop",
        status: "detected",
        detail: "Passive reader (no hook needed)",
      });
    }
  }

  // Devin CLI (Cognition): passive SQLite reader — no hook installation needed.
  {
    const devinDbPath = resolveDevinDbPath(process.env);
    if (devinDbPath && fssync.existsSync(devinDbPath)) {
      summary.push({
        label: "Devin CLI",
        status: "detected",
        detail: "Passive reader (no hook needed)",
      });
    }
  }

  // Kilo Code VS Code extension (kilocode.kilo-code): passive reader — no hook
  // installation needed. Scans ui_messages.json under every detected VS Code-
  // family install (Code, Cursor, CodeBuddy, Windsurf, …).
  {
    const { resolveKilocodeTaskFiles } = require("../lib/rollout");
    const taskFiles = resolveKilocodeTaskFiles(process.env);
    if (taskFiles.length > 0) {
      const ides = Array.from(new Set(taskFiles.map((t) => t.ide))).join(", ");
      summary.push({
        label: "Kilo Code (VS Code extension)",
        status: "detected",
        detail: `Passive reader · ${taskFiles.length} task${taskFiles.length !== 1 ? "s" : ""} in ${ides}`,
      });
    }
  }

  // Cline CLI v3 / desktop app: passive reader — no hook installation needed.
  // Cline keeps its own data dir (~/.cline/data/sessions, overridable through
  // CLINE_DIR/CLINE_DATA_DIR/CLINE_SESSION_DATA_DIR); the VS Code extension's
  // globalStorage layout is a separate, older install we do not read.
  {
    const { resolveClineSessionFilesWithStatus } = require("../lib/rollout");
    const clineScan = resolveClineSessionFilesWithStatus(process.env);
    const sessionFiles = clineScan.files;
    if (sessionFiles.length > 0) {
      summary.push({
        label: "Cline",
        status: "detected",
        detail: `Passive reader · ${sessionFiles.length} transcript${sessionFiles.length !== 1 ? "s" : ""}`,
      });
    }
    for (const failure of clineScan.errors) {
      summary.push({
        label: "Cline",
        status: "error",
        detail: `Passive reader discovery failed · ${failure.root}: ${failure.error.code ? `${failure.error.code}: ` : ""}${failure.error.message}`,
      });
    }
  }

  // CodeBuddy: Claude-Code fork. Install the SessionEnd hook so finished
  // sessions trigger notify.cjs → tracker sync; passive scan still runs as a
  // safety net for sessions that don't fire SessionEnd cleanly.
  const codebuddyDirExists = await isDir(context.codebuddyDir);
  if (codebuddyDirExists) {
    await upsertClaudeHook({
      settingsPath: context.codebuddySettingsPath,
      hookCommand: context.codebuddyHookCommand,
    });
    summary.push({ label: "CodeBuddy", status: "installed", detail: "Hooks installed" });
  } else {
    summary.push({ label: "CodeBuddy", status: "skipped", detail: "Config not found" });
  }

  // WorkBuddy: sibling Claude-Code fork. Same SessionEnd hook → notify.cjs →
  // tracker sync; passive scan still runs as a safety net.
  const workbuddyDirExists = await isDir(context.workbuddyDir);
  if (workbuddyDirExists) {
    await upsertClaudeHook({
      settingsPath: context.workbuddySettingsPath,
      hookCommand: context.workbuddyHookCommand,
    });
    summary.push({ label: "WorkBuddy", status: "installed", detail: "Hooks installed" });
  } else {
    summary.push({ label: "WorkBuddy", status: "skipped", detail: "Config not found" });
  }

  // WorkBuddy AI: international build, same hook schema, sibling home.
  const workbuddyAiDirExists = await isDir(context.workbuddyAiDir);
  if (workbuddyAiDirExists) {
    await upsertClaudeHook({
      settingsPath: context.workbuddyAiSettingsPath,
      hookCommand: context.workbuddyAiHookCommand,
    });
    summary.push({ label: "WorkBuddy AI", status: "installed", detail: "Hooks installed" });
  } else {
    summary.push({ label: "WorkBuddy AI", status: "skipped", detail: "Config not found" });
  }

  const openclawBefore = await probeOpenclawSessionPluginState({
    home,
    trackerDir,
    env: process.env,
  });
  const openclawInstall = await installOpenclawSessionPlugin({
    home,
    trackerDir,
    packageName: "tokenusage-cli",
    env: process.env,
  });
  if (openclawInstall?.skippedReason === "openclaw-cli-missing") {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: "skipped",
      detail: "OpenClaw CLI not found",
    });
  } else if (openclawInstall?.skippedReason === "openclaw-plugins-install-failed") {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: "skipped",
      detail: `Install failed${openclawInstall.error ? `: ${openclawInstall.error}` : ""}`,
    });
  } else if (openclawInstall?.skippedReason === "openclaw-config-unreadable") {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: "skipped",
      detail: openclawInstall.error
        ? `OpenClaw config unreadable: ${openclawInstall.error}`
        : "OpenClaw config unreadable",
    });
  } else if (openclawInstall?.configured) {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: openclawBefore?.configured ? "set" : "installed",
      detail: openclawBefore?.configured
        ? "Session plugin already linked"
        : "Session plugin linked (restart OpenClaw gateway to activate)",
    });
  } else {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: "skipped",
      detail: "OpenClaw session plugin unavailable",
    });
  }

  const legacyHookState = await probeOpenclawHookState({ home, trackerDir, env: process.env });
  if (legacyHookState?.configured || legacyHookState?.linked || legacyHookState?.enabled) {
    await removeOpenclawHookConfig({ home, trackerDir, env: process.env });
    summary.push({
      label: "OpenClaw Hook (legacy)",
      status: "updated",
      detail: "Removed legacy command hook (migrated to session plugin)",
    });
  }

  const codeProbe = await probeFile(context.codeConfigPath);
  if (codeProbe.exists) {
    const currentNotify = await readEveryCodeNotify(context.codeConfigPath);
    const result = await upsertEveryCodeNotify({
      codeConfigPath: context.codeConfigPath,
      notifyCmd: context.codeNotifyCmd,
      notifyOriginalPath: context.codeNotifyOriginalPath,
      replaceOriginal: shouldReplaceStoredOriginalNotify(currentNotify, context.codeNotifyCmd),
    });
    summary.push({
      label: "Every Code",
      status: result.changed ? "updated" : "set",
      detail: result.changed ? "Updated config" : "Config already set",
    });
  } else {
    summary.push({ label: "Every Code", status: "skipped", detail: renderSkipDetail(codeProbe) });
  }

  return summary;
}

async function previewIntegrations({ context }) {
  const summary = [];
  const home = os.homedir();

  const codexProbe = await probeFile(context.codexConfigPath);
  if (codexProbe.exists) {
    const existing = await readCodexNotify(context.codexConfigPath);
    const matches = arraysEqual(existing, context.notifyCmd);
    summary.push({
      label: "Codex CLI",
      status: matches ? "set" : "updated",
      detail: matches ? "Already configured" : "Will update config",
    });
  } else {
    summary.push({ label: "Codex CLI", status: "skipped", detail: renderSkipDetail(codexProbe) });
  }

  const acodeProbe = await probeFile(context.acodeConfigPath);
  if (acodeProbe.exists) {
    const existing = await readAcodeNotify(context.acodeConfigPath);
    const matches = arraysEqual(existing, context.acodeNotifyCmd);
    summary.push({
      label: "AStudio",
      status: matches ? "set" : "updated",
      detail: matches ? "Already configured" : "Will update config",
    });
  } else {
    summary.push({ label: "AStudio", status: "skipped", detail: renderSkipDetail(acodeProbe) });
  }

  const claudeDirExists = await isDir(context.claudeDir);
  if (claudeDirExists) {
    const configured = await areClaudeUsageHooksConfigured({
      settingsPath: context.claudeSettingsPath,
      hookCommand: context.claudeHookCommand,
    });
    summary.push({
      label: "Claude",
      status: "installed",
      detail: configured ? "Hooks already installed" : "Will install hooks",
    });
  } else {
    summary.push({ label: "Claude", status: "skipped", detail: "Config not found" });
  }

  const codebuddyDirExists = await isDir(context.codebuddyDir);
  if (codebuddyDirExists) {
    const configured = await isClaudeHookConfigured({
      settingsPath: context.codebuddySettingsPath,
      hookCommand: context.codebuddyHookCommand,
    });
    summary.push({
      label: "CodeBuddy",
      status: "installed",
      detail: configured ? "Hooks already installed" : "Will install hooks",
    });
  } else {
    summary.push({ label: "CodeBuddy", status: "skipped", detail: "Config not found" });
  }

  const workbuddyDirExists = await isDir(context.workbuddyDir);
  if (workbuddyDirExists) {
    const configured = await isClaudeHookConfigured({
      settingsPath: context.workbuddySettingsPath,
      hookCommand: context.workbuddyHookCommand,
    });
    summary.push({
      label: "WorkBuddy",
      status: "installed",
      detail: configured ? "Hooks already installed" : "Will install hooks",
    });
  } else {
    summary.push({ label: "WorkBuddy", status: "skipped", detail: "Config not found" });
  }

  const workbuddyAiDirExists = await isDir(context.workbuddyAiDir);
  if (workbuddyAiDirExists) {
    const configured = await isClaudeHookConfigured({
      settingsPath: context.workbuddyAiSettingsPath,
      hookCommand: context.workbuddyAiHookCommand,
    });
    summary.push({
      label: "WorkBuddy AI",
      status: "installed",
      detail: configured ? "Hooks already installed" : "Will install hooks",
    });
  } else {
    summary.push({ label: "WorkBuddy AI", status: "skipped", detail: "Config not found" });
  }

  const geminiConfigExists = await isDir(context.geminiConfigDir);
  if (geminiConfigExists) {
    const configured = await isGeminiHookConfigured({
      settingsPath: context.geminiSettingsPath,
      hookCommand: context.geminiHookCommand,
    });
    summary.push({
      label: "Gemini",
      status: "installed",
      detail: configured ? "Hooks already installed" : "Will install hooks",
    });
  } else {
    summary.push({ label: "Gemini", status: "skipped", detail: "Config not found" });
  }

  const opencodeDirExists = await isDir(context.opencodeConfigDir);
  const installed = await isOpencodePluginInstalled({ configDir: context.opencodeConfigDir });
  const opencodeDetail = installed
    ? "Plugin already installed"
    : opencodeDirExists
      ? "Will install plugin"
      : "Will create config and install plugin";
  summary.push({
    label: "Opencode Plugin",
    status: "installed",
    detail: opencodeDetail,
  });

  const openclawState = await probeOpenclawSessionPluginState({
    home,
    trackerDir: context.trackerDir,
    env: process.env,
  });
  if (openclawState?.skippedReason === "openclaw-config-missing") {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: "skipped",
      detail: "OpenClaw config not found",
    });
  } else if (openclawState?.skippedReason === "openclaw-config-unreadable") {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: "skipped",
      detail: openclawState.error
        ? `OpenClaw config unreadable: ${openclawState.error}`
        : "OpenClaw config unreadable",
    });
  } else {
    summary.push({
      label: "OpenClaw Session Plugin",
      status: openclawState?.configured ? "set" : "installed",
      detail: openclawState?.configured
        ? "Session plugin already linked"
        : "Will link session plugin (restart OpenClaw gateway to activate)",
    });
  }

  const legacyHookState = await probeOpenclawHookState({
    home,
    trackerDir: context.trackerDir,
    env: process.env,
  });
  if (legacyHookState?.configured || legacyHookState?.linked || legacyHookState?.enabled) {
    summary.push({
      label: "OpenClaw Hook (legacy)",
      status: "updated",
      detail: "Will remove legacy command hook during migration",
    });
  }

  const codeProbe = await probeFile(context.codeConfigPath);
  if (codeProbe.exists) {
    const existing = await readEveryCodeNotify(context.codeConfigPath);
    const matches = arraysEqual(existing, context.codeNotifyCmd);
    summary.push({
      label: "Every Code",
      status: matches ? "set" : "updated",
      detail: matches ? "Already configured" : "Will update config",
    });
  } else {
    summary.push({ label: "Every Code", status: "skipped", detail: renderSkipDetail(codeProbe) });
  }

  return summary;
}

function renderSkipDetail(probe) {
  if (!probe || probe.reason === "missing") return "Config not found";
  if (probe.reason === "permission-denied") return "Permission denied";
  if (probe.reason === "not-file") return "Invalid config";
  return "Unavailable";
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function shouldRepairCodexNotify({ currentNotify, expectedNotify, notifyOriginalPath }) {
  if (!Array.isArray(currentNotify) || currentNotify.length === 0) {
    return { repair: true, captureOriginal: true, replaceOriginal: true };
  }
  if (arraysEqual(currentNotify, expectedNotify)) {
    return { repair: false, reason: "already-set" };
  }
  if (isTokenUsageNotify(currentNotify, expectedNotify)) {
    return { repair: true, captureOriginal: false };
  }
  if (
    isSkyComputerUseNotify(currentNotify)
    && containsNestedTokenUsageNotify(currentNotify, expectedNotify)
  ) {
    return { repair: false, reason: "already-wrapped" };
  }
  if (isSkyComputerUseNotify(currentNotify)) {
    return { repair: true, captureOriginal: true, replaceOriginal: true };
  }

  const original = await readJson(notifyOriginalPath);
  const originalNotify = Array.isArray(original?.notify) ? original.notify : null;
  if (arraysEqual(currentNotify, originalNotify)) {
    return { repair: true, captureOriginal: true, replaceOriginal: false };
  }

  return { repair: false, reason: "external-notify" };
}

function shouldReplaceStoredOriginalNotify(currentNotify, expectedNotify) {
  if (isTokenUsageNotify(currentNotify, expectedNotify)) return false;
  return currentNotify === null || Array.isArray(currentNotify);
}

// Single source of truth for "is this notify command ours?", shared with
// status (configured check) and uninstall (restore gate) so the three cannot
// drift apart. See isManagedNotifyCmd in src/lib/codex-config.js.
function isTokenUsageNotify(cmd, expectedNotify) {
  return isManagedNotifyCmd(cmd, expectedNotify);
}

function isSkyComputerUseNotify(cmd) {
  if (!Array.isArray(cmd)) return false;
  return cmd.some((part) => typeof part === "string" && part.includes("SkyComputerUseClient"));
}

function containsNestedTokenUsageNotify(cmd, expectedNotify) {
  if (!Array.isArray(cmd)) return false;
  for (const part of cmd) {
    if (typeof part !== "string") continue;
    try {
      if (isTokenUsageNotify(JSON.parse(part), expectedNotify)) return true;
    } catch (_) {}
  }
  return false;
}

function parseArgs(argv) {
  const out = {
    baseUrl: null,
    dashboardUrl: null,
    anonKey: null,
    anonKeyFile: null,
    email: null,
    password: null,
    deviceName: null,
    linkCode: null,
    noAuth: false,
    noOpen: false,
    yes: false,
    dryRun: false,
    runReport: null,
    noTask: false,
    noIntegrations: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = argv[++i] || null;
    else if (a === "--dashboard-url") out.dashboardUrl = argv[++i] || null;
    else if (a === "--anon-key") out.anonKey = argv[++i] || null;
    else if (a === "--anon-key-file") out.anonKeyFile = argv[++i] || null;
    else if (a === "--email") out.email = argv[++i] || null;
    else if (a === "--password") out.password = argv[++i] || null;
    else if (a === "--device-name") out.deviceName = argv[++i] || null;
    else if (a === "--link-code") out.linkCode = argv[++i] || null;
    else if (a === "--run-report") out.runReport = normalizeRunReportFlag(argv[++i]);
    else if (a.startsWith("--run-report=")) out.runReport = normalizeRunReportFlag(a.slice("--run-report=".length));
    else if (a === "--no-task") out.noTask = true;
    else if (a === "--no-integrations") out.noIntegrations = true;
    else if (a === "--no-auth") out.noAuth = true;
    else if (a === "--no-open") out.noOpen = true;
    else if (a === "--yes") out.yes = true;
    else if (a === "--dry-run") out.dryRun = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  return out;
}

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// §2.11 run-report persistence: `--run-report=off` writes runReport:false into
// config.json so every later sync skips the POST; absent leaves the default
// (enabled) untouched. Invalid values fail loudly like unknown options.
function normalizeRunReportFlag(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "on" || normalized === "true" || normalized === "1") return true;
  if (normalized === "off" || normalized === "false" || normalized === "0") return false;
  throw new Error(`Unknown value for --run-report: ${value} (use on|off)`);
}

function normalizePlatform(value) {
  if (value === "darwin") return "macos";
  if (value === "win32") return "windows";
  if (value === "linux") return "linux";
  return "unknown";
}

function buildNotifyHandler({ trackerDir, packageName, packageEntry = cliEntryPath() }) {
  // Keep this file dependency-free: Node built-ins only.
  // It must never block Codex; it spawns sync in the background and exits 0.
  const queueSignalPath = path.join(trackerDir, "notify.signal");
  const originalPath = path.join(trackerDir, "codex_notify_original.json");
  const fallbackPkg = packageName || "tokenusage-cli";
  const trackerBinPath = path.join(trackerDir, "app", "bin", "tracker.js");
  const runtimeReadyPath = runtimeReadyMarkerPath(path.join(trackerDir, "app"));

  return `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const rawArgs = process.argv.slice(2);
let source = 'codex';
const payloadArgs = [];
for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === '--source') {
    source = rawArgs[i + 1] || source;
    i += 1;
    continue;
  }
  if (arg.startsWith('--source=')) {
    source = arg.slice('--source='.length) || source;
    continue;
  }
  payloadArgs.push(arg);
}

const trackerDir = ${JSON.stringify(trackerDir)};
const signalPath = ${JSON.stringify(queueSignalPath)};
const codexOriginalPath = ${JSON.stringify(originalPath)};
const acodeOriginalPath = ${JSON.stringify(path.join(trackerDir, "acode_notify_original.json"))};
const codeOriginalPath = ${JSON.stringify(path.join(trackerDir, "code_notify_original.json"))};
const trackerBinPath = ${JSON.stringify(trackerBinPath)};
const runtimeReadyPath = ${JSON.stringify(runtimeReadyPath)};
const packageEntryPath = ${JSON.stringify(packageEntry || null)};
const fallbackPkg = ${JSON.stringify(fallbackPkg)};
const selfPath = path.resolve(__filename);
const home = os.homedir();
const debugLogPath = path.join(trackerDir, 'notify.debug.jsonl');
const debugEnabled = ['1', 'true'].includes((process.env.TOKENUSAGE_NOTIFY_DEBUG || '').toLowerCase());
const debugMaxBytesRaw = Number.parseInt(process.env.TOKENUSAGE_NOTIFY_DEBUG_MAX_BYTES || '', 10);
const debugMaxBytes = Number.isFinite(debugMaxBytesRaw) && debugMaxBytesRaw > 0
  ? debugMaxBytesRaw
  : 1_000_000;

try {
  fs.mkdirSync(trackerDir, { recursive: true });
  fs.writeFileSync(signalPath, new Date().toISOString(), { encoding: 'utf8' });
} catch (_) {}

if (debugEnabled) {
  try {
    let size = 0;
    try {
      size = fs.statSync(debugLogPath).size;
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err;
    }
    if (size < debugMaxBytes) {
      const entry = {
        ts: new Date().toISOString(),
        source,
        cwd: process.cwd()
      };
      fs.appendFileSync(debugLogPath, JSON.stringify(entry) + os.EOL, 'utf8');
    }
  } catch (_) {}
}

// Throttle spawn: at most once per 20 seconds.
try {
    const throttlePath = path.join(trackerDir, 'sync.throttle');
    const now = Date.now();
    let last = 0;
    try { last = Number(fs.readFileSync(throttlePath, 'utf8')) || 0; } catch (_) {}
    if (now - last > 20_000) {
    try { fs.writeFileSync(throttlePath, String(now), 'utf8'); } catch (_) {}
    // Pick the first usable launcher: the init-copied runtime (self-contained,
    // survives an nvm switch — but only with its readiness marker), then the
    // installed package entry, then npx as the last resort. A half-copied
    // runtime must never be spawned: it dies with MODULE_NOT_FOUND in an
    // ignored stdio stream, which looks exactly like a successful sync.
    const hasLocalRuntime = fs.existsSync(runtimeReadyPath) && fs.existsSync(trackerBinPath);
    const hasPackageEntry = Boolean(packageEntryPath) && fs.existsSync(packageEntryPath);
    const syncArgs = ['sync', '--auto', '--from-notify', '--source', source];
    const cmd = hasLocalRuntime
      ? [process.execPath, trackerBinPath, ...syncArgs]
      : hasPackageEntry
        ? [process.execPath, packageEntryPath, ...syncArgs]
        : ['npx', '--yes', fallbackPkg, ...syncArgs];
    spawnDetached(cmd);
  }
} catch (_) {}

// Chain the existing Codex, AStudio, or Every Code notify hook.
try {
  const originalPath =
    source === 'every-code'
      ? codeOriginalPath
      : source === 'acode'
        ? acodeOriginalPath
        : source === 'claude' || source === 'opencode' || source === 'gemini' || source === 'codebuddy' || source === 'workbuddy' || source === 'workbuddy-ai'
          ? null
          : codexOriginalPath;
  if (originalPath) {
    const original = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
    const cmd = Array.isArray(original?.notify) ? original.notify : null;
    if (cmd && cmd.length > 0 && !isSelfNotify(cmd) && shouldChainNotify(cmd)) {
      const args = cmd.slice(1);
      if (payloadArgs.length > 0 && !containsSequence(args, payloadArgs)) {
        args.push(...payloadArgs);
      }
      spawnDetached([cmd[0], ...args]);
    }
  }
} catch (_) {}

process.exit(0);

function spawnDetached(argv) {
  try {
    const child = cp.spawn(argv[0], argv.slice(1), {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: process.env
    });
    child.unref();
  } catch (_) {}
}

function resolveMaybeHome(p, baseDir = null) {
  if (typeof p !== 'string') return null;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  if (p.startsWith('~\\\\')) return path.join(home, p.slice(2));
  if (path.isAbsolute(p)) return p;
  return path.resolve(baseDir || process.cwd(), p);
}

function isSelfNotify(cmd) {
  for (const part of cmd) {
    if (typeof part !== 'string') continue;
    if (!part.includes('notify.cjs')) continue;
    const resolved = resolveMaybeHome(part);
    if (resolved && isSelfNotifyPath(resolved)) return true;
    try {
      const nested = JSON.parse(part);
      if (Array.isArray(nested) && isSelfNotify(nested)) return true;
    } catch (_) {}
  }
  return false;
}

function isSelfNotifyPath(resolved) {
  if (resolved === selfPath) return true;
  // selfPath is realpath-resolved by Node; stored paths may reach the same
  // file through a symlink (e.g. a symlinked home directory).
  try {
    if (fs.realpathSync(resolved) === selfPath) return true;
  } catch (_) {}
  // Any notify.cjs under a .tokenusage dir is ours (matches the repair-time
  // isTokenUsageNotify heuristic), even if that copy no longer exists.
  return resolved.replace(/\\\\/g, '/').includes('/.tokenusage/');
}

function shouldChainNotify(cmd) {
  if (!Array.isArray(cmd) || cmd.length === 0) return false;
  if (!isRunnableCommand(cmd[0])) return false;
  return hasRunnableInterpreterTarget(cmd);
}

function isRunnableCommand(command, baseDir = null) {
  if (typeof command !== 'string' || command.length === 0) return false;
  const explicitPath = isExplicitPath(command);
  if (!explicitPath) return true;
  const resolved = resolveMaybeHome(command, baseDir);
  if (!resolved) return false;
  try {
    fs.accessSync(resolved, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function hasRunnableInterpreterTarget(cmd) {
  const normalized = normalizeInterpreterCommand(cmd);
  const interpreterCmd = normalized?.cmd;
  if (!interpreterCmd || interpreterCmd.length === 0) return false;
  const targetIndex = findInterpreterTargetIndex(interpreterCmd);
  if (targetIndex == null) {
    const command = interpreterCmd[0];
    if (!isExplicitPath(command)) return true;
    return isRunnableCommand(command, normalized.cwd);
  }
  if (targetIndex === -2) return true;
  if (targetIndex === -1) return false;
  const target = interpreterCmd[targetIndex];
  if (!isExplicitPath(target)) return false;
  const targetCwd = isBunCommand(interpreterCmd[0])
    ? findBunScriptCwd(interpreterCmd, 1, normalized.cwd)
    : normalized.cwd;
  return isReadablePath(target, targetCwd);
}

function normalizeInterpreterCommand(cmd) {
  if (!isEnvCommand(cmd[0])) return { cmd, cwd: null };
  return extractEnvCommand(cmd);
}

function findInterpreterTargetIndex(cmd) {
  const command = cmd[0];
  if (isNodeCommand(command)) {
    return findNodeLikeScriptIndex(cmd, 1);
  }
  if (isBunCommand(command)) {
    return findBunScriptIndex(cmd, 1);
  }
  if (isDenoCommand(command)) {
    return findDenoScriptIndex(cmd, 1);
  }
  return null;
}

function isEnvCommand(command) {
  const base = commandBase(command);
  return base === 'env';
}

function extractEnvCommand(cmd) {
  return normalizeEnvArgs(cmd.slice(1));
}

function normalizeEnvArgs(args, cwd = null) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string' || arg.length === 0) return null;
    if (arg === '-' || arg === '--ignore-environment' || isEnvValuelessShortOption(arg)) continue;
    if (arg === '--') return normalizeEnvCommandOperands(args.slice(i + 1), cwd);
    if (arg === '-S' || arg === '--split-string') {
      const split = splitEnvString(args[i + 1]);
      if (!split) return null;
      return normalizeEnvArgs(split.concat(args.slice(i + 2)), cwd);
    }
    if (arg.startsWith('--split-string=')) {
      const split = splitEnvString(arg.slice('--split-string='.length));
      if (!split) return null;
      return normalizeEnvArgs(split.concat(args.slice(i + 1)), cwd);
    }
    if (arg === '-u' || arg === '--unset') {
      i += 1;
      continue;
    }
    if (arg.startsWith('--unset=')) continue;
    if (arg === '-C' || arg === '--chdir') {
      const next = args[i + 1];
      if (typeof next !== 'string' || next.length === 0) return null;
      cwd = resolveMaybeHome(next, cwd);
      i += 1;
      continue;
    }
    if (arg.startsWith('--chdir=')) {
      const dir = arg.slice('--chdir='.length);
      if (dir.length === 0) return null;
      cwd = resolveMaybeHome(dir, cwd);
      continue;
    }
    if (isEnvValueOption(arg)) {
      i += 1;
      continue;
    }
    if (isEnvInlineValueOption(arg)) continue;
    if (arg.startsWith('-')) return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue;
    return { cmd: args.slice(i), cwd };
  }
  return null;
}

function normalizeEnvCommandOperands(args, cwd) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string' || arg.length === 0) return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue;
    if (arg.startsWith('-')) return null;
    return { cmd: args.slice(i), cwd };
  }
  return null;
}

function isEnvValuelessShortOption(arg) {
  return /^-[0iv]+$/.test(arg);
}

function isEnvValueOption(arg) {
  return arg === '-P' || arg === '--path';
}

function isEnvInlineValueOption(arg) {
  return (
    arg.startsWith('--path=')
  );
}

function splitEnvString(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parts = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\\s/.test(ch)) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (escaped || quote) return null;
  if (current.length > 0) parts.push(current);
  return parts.length > 0 ? parts : null;
}

function isNodeCommand(command) {
  const base = commandBase(command);
  return base === 'node';
}

function isBunCommand(command) {
  const base = commandBase(command);
  return base === 'bun';
}

function isDenoCommand(command) {
  const base = commandBase(command);
  return base === 'deno';
}

function commandBase(command) {
  if (typeof command !== 'string' || command.length === 0) return '';
  const posixBase = path.basename(command);
  const winBase = path.win32.basename(command);
  const base = winBase.length < posixBase.length ? winBase : posixBase;
  return base.replace(/\\.exe$/i, '').toLowerCase();
}

function findNodeLikeScriptIndex(cmd, startIndex) {
  for (let i = startIndex; i < cmd.length; i++) {
    const arg = cmd[i];
    if (typeof arg !== 'string' || arg.length === 0) return -1;
    if (arg === '-e' || arg === '--eval' || arg === '-p' || arg === '--print') return -2;
    if (arg.startsWith('--eval=') || arg.startsWith('--print=')) return -2;
    if (isNodeLikeOptionWithValue(arg)) {
      i += 1;
      continue;
    }
    if (hasInlineNodeLikeOptionValue(arg)) continue;
    if (isNodeLikeValuelessOption(arg)) continue;
    if (arg.startsWith('-')) return -1;
    return i;
  }
  return -1;
}

function findBunScriptIndex(cmd, startIndex) {
  for (let i = startIndex; i < cmd.length; i++) {
    const arg = cmd[i];
    if (typeof arg !== 'string' || arg.length === 0) return -1;
    if (arg === '-e' || arg === '--eval' || arg === '-p' || arg === '--print') return -2;
    if (arg.startsWith('--eval=') || arg.startsWith('--print=')) return -2;
    if (isBunOptionWithValue(arg)) {
      i += 1;
      continue;
    }
    if (hasInlineBunOptionValue(arg)) continue;
    if (isBunValuelessOption(arg)) continue;
    if (arg === 'run') {
      return findScriptAfterSubcommand(cmd, i + 1, 'bun');
    }
    if (arg.startsWith('-')) return -1;
    return i;
  }
  return -1;
}

function findBunScriptCwd(cmd, startIndex, baseDir = null) {
  let cwd = baseDir;
  for (let i = startIndex; i < cmd.length; i++) {
    const arg = cmd[i];
    if (typeof arg !== 'string' || arg.length === 0) return cwd;
    if (arg === '--cwd') {
      const next = cmd[i + 1];
      if (typeof next !== 'string' || next.length === 0) return cwd;
      cwd = resolveMaybeHome(next, cwd);
      i += 1;
      continue;
    }
    if (arg.startsWith('--cwd=')) {
      const next = arg.slice('--cwd='.length);
      if (next.length === 0) return cwd;
      cwd = resolveMaybeHome(next, cwd);
      continue;
    }
    if (arg === '-e' || arg === '--eval' || arg === '-p' || arg === '--print') return cwd;
    if (arg.startsWith('--eval=') || arg.startsWith('--print=')) return cwd;
    if (isBunOptionWithValue(arg)) {
      i += 1;
      continue;
    }
    if (hasInlineBunOptionValue(arg)) continue;
    if (isBunValuelessOption(arg)) continue;
    if (arg === 'run') return findBunScriptCwd(cmd, i + 1, cwd);
    return cwd;
  }
  return cwd;
}

function findDenoScriptIndex(cmd, startIndex) {
  for (let i = startIndex; i < cmd.length; i++) {
    const arg = cmd[i];
    if (typeof arg !== 'string' || arg.length === 0) return -1;
    if (arg === 'eval') return -2;
    if (arg === 'run' || arg === 'test' || arg === 'bench' || arg === 'check') {
      return findScriptAfterSubcommand(cmd, i + 1, 'deno');
    }
    if (isDenoOptionWithValue(arg)) {
      i += 1;
      continue;
    }
    if (hasInlineDenoOptionValue(arg)) continue;
    if (isDenoValuelessOption(arg)) continue;
    if (arg.startsWith('-')) return -1;
    return i;
  }
  return -1;
}

function findScriptAfterSubcommand(cmd, startIndex, runtime) {
  for (let i = startIndex; i < cmd.length; i++) {
    const arg = cmd[i];
    if (typeof arg !== 'string' || arg.length === 0) return -1;
    if (runtime === 'bun' && isBunOptionWithValue(arg)) {
      i += 1;
      continue;
    }
    if (runtime === 'deno' && isDenoOptionWithValue(arg)) {
      i += 1;
      continue;
    }
    if (runtime === 'bun' && hasInlineBunOptionValue(arg)) continue;
    if (runtime === 'deno' && hasInlineDenoOptionValue(arg)) continue;
    if (runtime === 'bun' && isBunValuelessOption(arg)) continue;
    if (runtime === 'deno' && isDenoValuelessOption(arg)) continue;
    if (arg.startsWith('-')) return -1;
    return i;
  }
  return -1;
}

function isNodeLikeOptionWithValue(arg) {
  return (
    arg === '-C' ||
    arg === '-r' ||
    arg === '--conditions' ||
    arg === '--debug-port' ||
    arg === '--disable-warning' ||
    arg === '--env-file' ||
    arg === '--env-file-if-exists' ||
    arg === '--experimental-config-file' ||
    arg === '--experimental-loader' ||
    arg === '--import' ||
    arg === '--inspect-publish-uid' ||
    arg === '--loader' ||
    arg === '--localstorage-file' ||
    arg === '--require'
  );
}

function hasInlineNodeLikeOptionValue(arg) {
  return (
    arg.startsWith('--conditions=') ||
    arg.startsWith('--debug-port=') ||
    arg.startsWith('--disable-warning=') ||
    arg.startsWith('--env-file=') ||
    arg.startsWith('--env-file-if-exists=') ||
    arg.startsWith('--experimental-config-file=') ||
    arg.startsWith('--experimental-loader=') ||
    arg.startsWith('--import=') ||
    arg.startsWith('--inspect-publish-uid=') ||
    arg.startsWith('--loader=') ||
    arg.startsWith('--localstorage-file=') ||
    arg.startsWith('--require=')
  );
}

function isNodeLikeValuelessOption(arg) {
  return (
    arg === '-' ||
    arg === '-c' ||
    arg === '--' ||
    arg === '--check' ||
    arg === '--cpu-prof' ||
    arg === '--enable-source-maps' ||
    arg === '--expose-gc' ||
    arg === '--inspect' ||
    arg === '--inspect-brk' ||
    arg === '--inspect-wait' ||
    arg === '--no-deprecation' ||
    arg === '--no-warnings' ||
    arg === '--preserve-symlinks' ||
    arg === '--preserve-symlinks-main' ||
    arg === '--throw-deprecation' ||
    arg === '--trace-deprecation' ||
    arg === '--trace-warnings'
  );
}

function isBunOptionWithValue(arg) {
  return (
    arg === '-c' ||
    arg === '-d' ||
    arg === '-F' ||
    arg === '-l' ||
    arg === '-r' ||
    arg === '--config' ||
    arg === '--conditions' ||
    arg === '--console-depth' ||
    arg === '--cpu-prof-dir' ||
    arg === '--cpu-prof-interval' ||
    arg === '--cpu-prof-name' ||
    arg === '--cwd' ||
    arg === '--define' ||
    arg === '--dns-result-order' ||
    arg === '--drop' ||
    arg === '--elide-lines' ||
    arg === '--env-file' ||
    arg === '--extension-order' ||
    arg === '--feature' ||
    arg === '--fetch-preconnect' ||
    arg === '--filter' ||
    arg === '--import' ||
    arg === '--inspect' ||
    arg === '--inspect-brk' ||
    arg === '--inspect-wait' ||
    arg === '--install' ||
    arg === '--jsx-factory' ||
    arg === '--jsx-fragment' ||
    arg === '--jsx-import-source' ||
    arg === '--jsx-runtime' ||
    arg === '--loader' ||
    arg === '--main-fields' ||
    arg === '--max-http-header-size' ||
    arg === '--port' ||
    arg === '--preload' ||
    arg === '--require' ||
    arg === '--shell' ||
    arg === '--title' ||
    arg === '--tsconfig-override' ||
    arg === '--unhandled-rejections' ||
    arg === '--user-agent'
  );
}

function hasInlineBunOptionValue(arg) {
  return (
    arg.startsWith('--config=') ||
    arg.startsWith('--conditions=') ||
    arg.startsWith('--console-depth=') ||
    arg.startsWith('--cpu-prof-dir=') ||
    arg.startsWith('--cpu-prof-interval=') ||
    arg.startsWith('--cpu-prof-name=') ||
    arg.startsWith('--cwd=') ||
    arg.startsWith('--define=') ||
    arg.startsWith('--dns-result-order=') ||
    arg.startsWith('--drop=') ||
    arg.startsWith('--elide-lines=') ||
    arg.startsWith('--env-file=') ||
    arg.startsWith('--extension-order=') ||
    arg.startsWith('--feature=') ||
    arg.startsWith('--fetch-preconnect=') ||
    arg.startsWith('--filter=') ||
    arg.startsWith('--import=') ||
    arg.startsWith('--inspect=') ||
    arg.startsWith('--inspect-brk=') ||
    arg.startsWith('--inspect-wait=') ||
    arg.startsWith('--install=') ||
    arg.startsWith('--jsx-factory=') ||
    arg.startsWith('--jsx-fragment=') ||
    arg.startsWith('--jsx-import-source=') ||
    arg.startsWith('--jsx-runtime=') ||
    arg.startsWith('--loader=') ||
    arg.startsWith('--main-fields=') ||
    arg.startsWith('--max-http-header-size=') ||
    arg.startsWith('--port=') ||
    arg.startsWith('--preload=') ||
    arg.startsWith('--require=') ||
    arg.startsWith('--shell=') ||
    arg.startsWith('--title=') ||
    arg.startsWith('--tsconfig-override=') ||
    arg.startsWith('--unhandled-rejections=') ||
    arg.startsWith('--user-agent=')
  );
}

function isBunValuelessOption(arg) {
  return (
    arg === '-b' ||
    arg === '-i' ||
    arg === '--bun' ||
    arg === '--cpu-prof' ||
    arg === '--cpu-prof-md' ||
    arg === '--expose-gc' ||
    arg === '--heap-prof' ||
    arg === '--heap-prof-md' ||
    arg === '--hot' ||
    arg === '--if-present' ||
    arg === '--ignore-dce-annotations' ||
    arg === '--jsx-side-effects' ||
    arg === '--no-addons' ||
    arg === '--no-clear-screen' ||
    arg === '--no-deprecation' ||
    arg === '--no-env-file' ||
    arg === '--no-exit-on-error' ||
    arg === '--no-install' ||
    arg === '--no-macros' ||
    arg === '--parallel' ||
    arg === '--prefer-latest' ||
    arg === '--prefer-offline' ||
    arg === '--preserve-symlinks' ||
    arg === '--preserve-symlinks-main' ||
    arg === '--redis-preconnect' ||
    arg === '--sequential' ||
    arg === '--silent' ||
    arg === '--smol' ||
    arg === '--sql-preconnect' ||
    arg === '--throw-deprecation' ||
    arg === '--use-bundled-ca' ||
    arg === '--use-openssl-ca' ||
    arg === '--use-system-ca' ||
    arg === '--watch' ||
    arg === '--workspaces' ||
    arg === '--zero-fill-buffers'
  );
}

function isDenoOptionWithValue(arg) {
  return (
    arg === '-c' ||
    arg === '--cert' ||
    arg === '--conditions' ||
    arg === '--config' ||
    arg === '--cpu-prof-dir' ||
    arg === '--cpu-prof-interval' ||
    arg === '--cpu-prof-name' ||
    arg === '--ext' ||
    arg === '--import-map' ||
    arg === '--location' ||
    arg === '--lock' ||
    arg === '--minimum-dependency-age' ||
    arg === '--preload' ||
    arg === '--require' ||
    arg === '--seed'
  );
}

function hasInlineDenoOptionValue(arg) {
  return (
    arg.startsWith('--cert=') ||
    arg.startsWith('--conditions=') ||
    arg.startsWith('--config=') ||
    arg.startsWith('--coverage=') ||
    arg.startsWith('--cpu-prof-dir=') ||
    arg.startsWith('--cpu-prof-interval=') ||
    arg.startsWith('--cpu-prof-name=') ||
    arg.startsWith('--env-file=') ||
    arg.startsWith('--ext=') ||
    arg.startsWith('--import-map=') ||
    arg.startsWith('--location=') ||
    arg.startsWith('--lock=') ||
    arg.startsWith('--minimum-dependency-age=') ||
    arg.startsWith('--node-modules-dir=') ||
    arg.startsWith('--preload=') ||
    arg.startsWith('--require=') ||
    arg.startsWith('--seed=') ||
    arg.startsWith('--vendor=') ||
    arg.startsWith('--v8-flags=') ||
    /^--(allow|deny|ignore)-[A-Za-z-]+=/.test(arg) ||
    arg.startsWith('--permission-set=') ||
    arg.startsWith('--reload=') ||
    arg.startsWith('--tunnel=') ||
    arg.startsWith('--watch=') ||
    arg.startsWith('--watch-exclude=') ||
    arg.startsWith('--watch-hmr=')
  );
}

function isDenoValuelessOption(arg) {
  return (
    arg === '-A' ||
    arg === '-P' ||
    arg === '-q' ||
    arg === '-r' ||
    arg === '-t' ||
    arg === '--allow-all' ||
    arg === '--cached-only' ||
    arg === '--coverage' ||
    arg === '--cpu-prof' ||
    arg === '--cpu-prof-flamegraph' ||
    arg === '--cpu-prof-md' ||
    arg === '--env-file' ||
    arg === '--frozen' ||
    arg === '--no-check' ||
    arg === '--no-clear-screen' ||
    arg === '--no-code-cache' ||
    arg === '--no-config' ||
    arg === '--no-lock' ||
    arg === '--no-npm' ||
    arg === '--no-prompt' ||
    arg === '--no-remote' ||
    arg === '--node-modules-dir' ||
    arg === '--quiet' ||
    arg === '--reload' ||
    arg === '--tunnel' ||
    arg === '--unstable' ||
    arg === '--v8-flags' ||
    arg === '--vendor' ||
    arg === '--watch' ||
    arg === '--watch-exclude' ||
    arg === '--watch-hmr' ||
    /^-[RWINESA]$/.test(arg) ||
    /^--(allow|deny|ignore)-[A-Za-z-]+$/.test(arg) ||
    arg === '--permission-set'
  );
}

function isReadablePath(target, baseDir = null) {
  const resolved = resolveMaybeHome(target, baseDir);
  if (!resolved) return false;
  try {
    fs.accessSync(resolved, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function isExplicitPath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  return value.startsWith('~/') || value.startsWith('~\\\\') || value.includes('/') || value.includes('\\\\') || /^[A-Za-z]:/.test(value);
}

function containsSequence(haystack, needle) {
  if (!Array.isArray(haystack) || !Array.isArray(needle) || needle.length === 0) return false;
  if (needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}
`;
}

module.exports = {
  cmdInit,
  buildNotifyHandler,
  installLocalTrackerApp,
  repairCodexNotifyIntegration,
  repairAcodeNotifyIntegration,
  repairRuntimeIntegrations,
  applyIntegrationSetup,
};

async function probeFile(p) {
  try {
    const st = await fs.stat(p);
    if (st.isFile()) return { exists: true, reason: null };
    return { exists: false, reason: "not-file" };
  } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return { exists: false, reason: "missing" };
    if (e?.code === "EACCES" || e?.code === "EPERM")
      return { exists: false, reason: "permission-denied" };
    return { exists: false, reason: "error", code: e?.code || "unknown" };
  }
}

async function isDir(p) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch (_e) {
    return false;
  }
}

// The only modules the runtime copy must carry — the CLI's declared deps.
const PACKAGE_DEPENDENCIES = Object.keys(
  require(path.resolve(__dirname, "../../package.json")).dependencies || {},
);

async function installLocalTrackerApp({ appDir }) {
  // Test-only escape hatch: skip the ~10 MB runtime copy (src + dashboard/dist +
  // node_modules) when a test only exercises hook/config/notify wiring. Copying
  // the bundle per test case dominates the init test suite's wall time. Tests
  // that assert on the copied runtime simply leave this unset.
  if (process.env.TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY === "1") return { ok: true, skipped: true };
  // Copy the current package's runtime (bin + src + deps) into ~/.tokenusage so
  // notify can run sync without npx and without npm's global prefix.
  const packageRoot = path.resolve(__dirname, "../..");

  // When running from the installed local runtime (or when appDir is symlinked
  // to this package), source and destination resolve to the same place. Do not
  // delete appDir in that case.
  if (await pathsPointToSameLocation(packageRoot, appDir)) {
    return { ok: true, reused: true };
  }

  // Build into a staging dir first: a failed copy must never destroy a working
  // runtime (or leave a half one behind that hooks would spawn and die in).
  const stagingDir = `${appDir}.new`;
  await fs.rm(stagingDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  const built = await buildRuntimeCopy({ packageRoot, appDir: stagingDir });
  if (!built.ok) {
    await fs.rm(stagingDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    return built;
  }

  await fs.rm(appDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  try {
    await fs.rename(stagingDir, appDir);
  } catch (_err) {
    await fs.rm(stagingDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    return { ok: false, missing: [], reason: "swap-failed" };
  }

  // The marker is the contract every spawn point checks: only a copy that
  // booted gets one.
  const version = require(path.resolve(__dirname, "../../package.json")).version;
  await fs
    .writeFile(
      runtimeReadyMarkerPath(appDir),
      JSON.stringify({ version, installedAt: new Date().toISOString() }, null, 2),
      "utf8",
    )
    .catch(() => {});
  return { ok: true };
}

// Assemble bin + src + the dependency closure in `appDir` and prove it boots.
// Returns {ok:true} / {ok:false, missing, reason}.
async function buildRuntimeCopy({ packageRoot, appDir }) {
  const srcFrom = path.join(packageRoot, "src");
  const binFrom = path.join(packageRoot, "bin", "tokenusage.js");
  const packageJsonFrom = path.join(packageRoot, "package.json");
  const nodeModulesFrom = path.join(packageRoot, "node_modules");
  const dashboardDistFrom = path.join(packageRoot, "dashboard", "dist");

  try {
    await ensureDir(appDir);
    await fs.cp(srcFrom, path.join(appDir, "src"), { recursive: true });
    await ensureDir(path.join(appDir, "bin"));
    const binTo = path.join(appDir, "bin", "tracker.js");
    await fs.copyFile(binFrom, binTo);
    await fs.chmod(binTo, 0o755).catch(() => {});
    await fs.copyFile(packageJsonFrom, path.join(appDir, "package.json")).catch(() => {});
    if (await isDir(dashboardDistFrom)) {
      await fs.cp(dashboardDistFrom, path.join(appDir, "dashboard", "dist"), { recursive: true });
    }
  } catch (err) {
    return { ok: false, missing: [], reason: `copy-failed: ${err?.message || err}` };
  }

  const deps = await copyRuntimeDependencies({
    from: nodeModulesFrom,
    to: path.join(appDir, "node_modules"),
  });
  if (!deps.ok) return { ok: false, missing: deps.missing, reason: "missing-dependencies" };

  const boot = await probeRuntimeCopy(appDir);
  if (!boot.ok) return { ok: false, missing: boot.missing, reason: boot.reason };
  return { ok: true };
}

// Boot the staged copy with the current Node: `require` every declared
// dependency (which loads their transitive graph too) and print the version
// through the real CLI entry. Only a copy that survives both gets a marker.
function probeRuntimeCopy(appDir) {
  const trackerBinPath = path.join(appDir, "bin", "tracker.js");
  const script = [
    "const names = " + JSON.stringify(PACKAGE_DEPENDENCIES) + ";",
    "const missing = [];",
    "for (const name of names) {",
    "  try { require(name); } catch (err) {",
    "    if (err && (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND')) {",
    "      missing.push(name);",
    "    }",
    "  }",
    "}",
    "if (missing.length > 0) { console.error(missing.join(',')); process.exit(3); }",
  ].join("\n");
  const env = { ...process.env };
  // The probe must not trigger telemetry or hook spawning.
  env.TOKENUSAGE_NO_TELEMETRY = "1";
  try {
    const probe = cp.spawnSync(process.execPath, ["-e", script], {
      cwd: appDir,
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (probe.status !== 0) {
      const reported = String(probe.stderr || "").trim();
      const missing = reported
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      return { ok: false, missing, reason: "dependency-probe-failed" };
    }
    const boot = cp.spawnSync(process.execPath, [trackerBinPath, "--version"], {
      cwd: appDir,
      env,
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (boot.status !== 0) {
      return {
        ok: false,
        missing: [],
        reason: `boot-failed: ${String(boot.stderr || "").trim().split("\n")[0] || `exit ${boot.status}`}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, missing: [], reason: `probe-error: ${err?.message || err}` };
  }
}

function describeRuntimeCopyFailure(result) {
  const missing = Array.isArray(result?.missing) ? result.missing.filter(Boolean) : [];
  const reason = result?.reason ? String(result.reason) : "incomplete copy";
  if (missing.length === 0) return reason;
  const preview = missing.slice(0, 3).join(", ");
  return `${reason}: ${preview}${missing.length > 3 ? " …" : ""}`;
}

async function pathsPointToSameLocation(a, b) {
  const aReal = await safeRealpath(a);
  const bReal = await safeRealpath(b);
  if (aReal && bReal) return aReal === bReal;
  return path.resolve(a) === path.resolve(b);
}

async function safeRealpath(p) {
  try {
    return await fs.realpath(p);
  } catch (_err) {
    return null;
  }
}

// Run the first sync inline so we can show the user their real token total
// immediately. Caps wall-time at FIRST_SYNC_TIMEOUT_MS — past that we let the
// child continue detached and surrender the wait. Returns aggregate stats
// derived from queue.jsonl after the wait window closes.
const FIRST_SYNC_TIMEOUT_MS = 15_000;

async function runFirstSyncAndRead({ trackerBinPath, trackerDir, packageName }) {
  // Test-only escape hatch: skip spawning a real `sync --drain` subprocess when
  // a test only exercises init wiring. Returns the same shape derived from an
  // (empty) queue so callers behave identically without the ~1s spawn per case.
  if (process.env.TOKENUSAGE_SKIP_FIRST_SYNC === "1") {
    return readFirstSyncTotals(trackerDir);
  }
  const fallbackPkg = packageName || "tokenusage-cli";
  const argv = ["sync", "--auto", "--drain"];
  // Same readiness contract as notify: a runtime copy without its marker is a
  // half copy — spawn the installed package instead of dying silently.
  const hasLocalRuntime =
    typeof trackerBinPath === "string" &&
    fssync.existsSync(trackerBinPath) &&
    fssync.existsSync(runtimeReadyMarkerPath(path.join(trackerDir, "app")));
  const cmd = hasLocalRuntime
    ? [process.execPath, trackerBinPath, ...argv]
    : ["npx", "--yes", fallbackPkg, ...argv];

  await new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    let child;
    try {
      child = cp.spawn(cmd[0], cmd.slice(1), {
        // detached so we can let it keep running past our timeout — the user
        // still gets data later via dashboard auto-refresh.
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        env: process.env,
      });
    } catch (err) {
      if (isDebugEnabled()) {
        process.stderr.write(`first-sync spawn failed: ${err?.message || err}\n`);
      }
      settle();
      return;
    }
    child.on("error", () => settle());
    child.on("exit", () => settle());
    timer = setTimeout(() => {
      try {
        child.unref();
      } catch (_e) {}
      settle();
    }, FIRST_SYNC_TIMEOUT_MS);
  });

  return readFirstSyncTotals(trackerDir);
}

function readFirstSyncTotals(trackerDir) {
  const queuePath = path.join(trackerDir, "queue.jsonl");
  let raw;
  try {
    raw = fssync.readFileSync(queuePath, "utf8");
  } catch (_e) {
    return { totalTokens: 0, sources: [] };
  }
  let totalTokens = 0;
  const sources = new Set();
  // Each sync appends cumulative totals per (source, model, hour_start); keep
  // the last entry per bucket to match what the dashboard shows.
  const latest = new Map();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      const key = `${row.source || ""}|${row.model || ""}|${row.hour_start || ""}`;
      latest.set(key, row);
    } catch {
      // skip malformed
    }
  }
  for (const row of latest.values()) {
    const n = Number(row.total_tokens);
    if (Number.isFinite(n) && n > 0) totalTokens += n;
    if (row.source) sources.add(row.source);
  }
  return { totalTokens, sources: Array.from(sources) };
}

// Copy the CLI's dependency closure into `to` as a flat node_modules tree.
//
// npm installs the CLI's deps flat (real directories), so copying them is
// enough. pnpm links them as junctions into a shared store: copying the links
// yields a runtime that breaks as soon as that store entry moves (nvm switch),
// and NOT following them yields a runtime with no deps at all. So walk the
// declared dependency graph and copy each package's *real* directory instead —
// that flattens both layouts into something self-contained.
async function copyRuntimeDependencies({ from, to }) {
  if (!(await isDir(from))) return { ok: false, missing: PACKAGE_DEPENDENCIES };

  const { packages } = collectRuntimePackages(from);
  try {
    await ensureDir(to);
    for (const [name, dir] of packages) {
      await fs.cp(dir, path.join(to, name), {
        recursive: true,
        dereference: true,
        filter: skipNestedNodeModules(dir),
      });
    }
  } catch (_e) {
    return { ok: false, missing: await missingRuntimeDependencies(to) };
  }
  const missing = await missingRuntimeDependencies(to);
  return { ok: missing.length === 0, missing };
}

// Breadth-first walk of the declared dependency graph. Follows the same lookup
// Node does for each package — its own node_modules, then the node_modules next
// to it (pnpm: `.pnpm/<id>/node_modules`, npm: the flat root) — so nothing from
// the hoisted store leaks in. Optional deps are followed when present but their
// absence is not an error.
function collectRuntimePackages(nodeModulesRoot) {
  const packages = new Map();
  const unresolved = [];
  const queue = PACKAGE_DEPENDENCIES.map((name) => ({ name, from: null, optional: false }));
  while (queue.length > 0) {
    const item = queue.shift();
    if (packages.has(item.name)) continue;
    const dir =
      item.from === null
        ? realDirSync(path.join(nodeModulesRoot, item.name))
        : resolveDependencyPackage(item.from, item.name);
    const manifest = dir ? readPackageJsonSync(dir) : null;
    if (!dir || !manifest) {
      if (!item.optional) unresolved.push(item.name);
      continue;
    }
    packages.set(item.name, dir);
    const required = Object.keys(manifest.dependencies || {});
    for (const dep of required) queue.push({ name: dep, from: dir, optional: false });
    for (const dep of Object.keys(manifest.optionalDependencies || {})) {
      queue.push({ name: dep, from: dir, optional: true });
    }
  }
  return { packages, unresolved };
}

function resolveDependencyPackage(packageDir, name) {
  const parentNodeModules = name.startsWith("@")
    ? path.dirname(path.dirname(packageDir))
    : path.dirname(packageDir);
  return (
    realDirSync(path.join(packageDir, "node_modules", name)) ||
    realDirSync(path.join(parentNodeModules, name))
  );
}

// Packages that ship their own node_modules keep it linked to pnpm's shared
// store; dereferencing those links would drag the entire workspace dependency
// graph into the runtime copy.
function skipNestedNodeModules(from) {
  return (src) => {
    const rel = path.relative(from, src);
    return !rel || !rel.split(path.sep).includes("node_modules");
  };
}

function realDirSync(p) {
  if (!isDirSync(p)) return null;
  try {
    const real = fssync.realpathSync(p);
    return isDirSync(real) ? real : null;
  } catch (_e) {
    return null;
  }
}

function isDirSync(p) {
  try {
    return fssync.statSync(p).isDirectory();
  } catch (_e) {
    return false;
  }
}

function readPackageJsonSync(dir) {
  try {
    return JSON.parse(fssync.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch (_e) {
    return null;
  }
}

async function missingRuntimeDependencies(nodeModulesDir) {
  const missing = [];
  for (const name of PACKAGE_DEPENDENCIES) {
    if (!(await isDir(path.join(nodeModulesDir, name)))) missing.push(name);
  }
  return missing;
}

function isDebugEnabled() {
  return process.env.TOKENUSAGE_DEBUG === "1";
}
