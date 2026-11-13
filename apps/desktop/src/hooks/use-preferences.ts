// Preferences state (desktop-plan D4). localStorage is the store; autostart is
// the one setting whose truth lives in the OS (the plugin), so its cached
// value is reconciled against `isEnabled()` on mount and written only through
// the plugin.

import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useCallback, useEffect, useState } from "react";

import { setFormatPreferences } from "@/lib/format-tokens";
import {
  loadPreferences,
  normalizePreferences,
  savePreferences,
  type Preferences,
} from "@/lib/preferences";

export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const loaded = loadPreferences();

    // Publish the saved format before the first render reads a number: charts,
    // cards, tray labels and notification bodies call formatTokens() directly,
    // with no Provider/Context in between.
    setFormatPreferences(loaded);

    return loaded;
  });

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((prev) => {
      const next = normalizePreferences({ ...prev, ...patch });

      setFormatPreferences(next);
      savePreferences(next);

      return next;
    });
  }, []);

  // The OS registration wins: an entry removed in Task Manager, or a stale
  // cached flag, must not disagree with the switch the user sees.
  useEffect(() => {
    let cancelled = false;

    void isEnabled()
      .then((enabled) => {
        if (cancelled) return;
        setPrefs((prev) => {
          if (prev.autostart === enabled) return prev;
          const next = { ...prev, autostart: enabled };

          savePreferences(next);

          return next;
        });
      })
      .catch(() => {
        // Plugin unavailable (older build) — keep the stored value.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setAutostart = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
      update({ autostart: enabled });
    },
    [update],
  );

  return { prefs, update, setAutostart };
}
