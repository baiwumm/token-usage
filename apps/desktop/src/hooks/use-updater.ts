// D5 updater: check the GitHub Releases manifest → download → in-place
// install → relaunch. The endpoint and Ed25519 public key live in
// tauri.conf.json; the plugin verifies the signature before the installer
// runs. Startup performs one silent check that only *announces* an available
// build — installation always needs the explicit settings button, so a
// background launch never restarts the app on its own. Startup failures
// (offline machines are normal) stay quiet; the manual button surfaces them.

import { toast } from "@heroui/react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";

export type UpdaterStatus = "idle" | "checking" | "downloading";

export interface UpdaterState {
  status: UpdaterStatus;
  /** Newest version seen upstream; null until a check finds one. */
  availableVersion: string | null;
  /** Running app version (tauri.conf.json), for the settings label. */
  currentVersion: string | null;
}

const STARTUP_CHECK_DELAY_MS = 8_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A missing manifest is not a failure: the endpoint 404s until a desktop
 * release publishes `latest.json` (2026-11-12 acceptance: the CLI and desktop
 * releases share one repo, so the manifest is served from a dedicated
 * `desktop-latest` release — before the first one exists every check 404s).
 * The plugin reports it as "Could not fetch a valid release JSON".
 */
function isManifestMissing(error: unknown): boolean {
  return /valid release JSON|404|not found|empty response/i.test(
    errorText(error),
  );
}

export function useUpdater(): UpdaterState & {
  /** `install: false` only reports; `install: true` downloads and relaunches. */
  checkForUpdates: (install: boolean) => Promise<void>;
} {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      .catch(() => undefined);
  }, []);

  const checkForUpdates = useCallback(
    async (install: boolean) => {
      if (busy.current) return;
      busy.current = true;
      setStatus("checking");
      try {
        const update: Update | null = await check();

        if (!update) {
          setAvailableVersion(null);
          if (install) {
            toast(
              `已是最新版本${currentVersion === null ? "" : `（v${currentVersion}）`}`,
            );
          }

          return;
        }
        setAvailableVersion(update.version);
        if (!install) {
          toast(`发现新版本 v${update.version}：设置 → 检查更新 安装`);

          return;
        }
        // The settings click is the consent: download, install, restart.
        const progress = toast(`正在下载 v${update.version}……`, {
          isLoading: true,
          timeout: 0,
        });

        setStatus("downloading");
        try {
          await update.downloadAndInstall();
          toast.update(progress, `正在安装 v${update.version}，应用即将重启`, {
            isLoading: false,
            timeout: 4000,
            variant: "success",
          });
          await relaunch();
        } catch (error) {
          toast.update(progress, `更新安装失败：${errorText(error)}`, {
            isLoading: false,
            timeout: 8000,
            variant: "danger",
          });
        }
      } catch (error) {
        if (install) {
          if (isManifestMissing(error)) {
            toast(
              `尚未发布更新清单，暂无更新可安装（当前 v${
                currentVersion ?? "—"
              }）`,
            );
          } else {
            toast.danger(`检查更新失败：${errorText(error)}`);
          }
        }
      } finally {
        busy.current = false;
        setStatus("idle");
      }
    },
    [currentVersion],
  );

  // One silent startup check. The guard lives in the callback (not the
  // effect body) so a re-run of the effect — `runCheck` changes once the
  // version probe lands — merely reschedules the same single check.
  const startupPending = useRef(false);

  useEffect(() => {
    if (startupPending.current) return;
    startupPending.current = true;
    const timer = window.setTimeout(() => {
      void checkForUpdates(false);
    }, STARTUP_CHECK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [checkForUpdates]);

  return { status, availableVersion, currentVersion, checkForUpdates };
}
