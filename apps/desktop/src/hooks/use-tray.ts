// Tray availability (desktop-plan §10/§11): `tray-icon` swallows a rejected
// `Shell_NotifyIcon`, and a process whose integrity level is lower than the
// taskbar's cannot post its icon there — usually because a low-integrity parent
// (a script, a restricted scheduled task) launched the app, NOT because UAC is
// off (0.3.1 correction). Rust answers the truth; the checks are repeated
// because the shell may register the icon just after the window loads, and the
// verdict is sticky-true (a later miss does not unhide it).

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

/** ms after mount; any `true` wins, `false` only after the last check. */
const CHECK_DELAYS_MS = [400, 1_200, 3_000];

export function useTrayAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let registered = false;

      for (const delay of CHECK_DELAYS_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (cancelled) {
          return;
        }
        try {
          registered = await invoke<boolean>("tray_status");
        } catch {
          return; // older bridge without the command — stay silent
        }
        if (registered) {
          break;
        }
      }
      if (!cancelled) {
        setAvailable(registered);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
