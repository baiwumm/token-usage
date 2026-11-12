// Window geometry memory (desktop-plan §12.1, D11): the window position /
// size / maximized flag persist in localStorage and restore before the
// window shows. The config starts the window hidden (`visible: false`), this
// hook applies the saved geometry, then calls show() — no startup jump; a
// Rust watchdog shows the window anyway if the webview never gets here.
// Size restores as logical px so a saved 400px window stays 400 CSS px on a
// different-DPI monitor; the position is physical px and validated against
// the current monitors, so an unplugged display cannot strand it off-screen.

import {
  getCurrentWindow,
  availableMonitors,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { useEffect } from "react";

const GEOMETRY_KEY = "tokenusage.desktop.window";

interface WindowGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
}

const MIN_WIDTH = 340;
const MIN_HEIGHT = 480;
const SAVE_DEBOUNCE_MS = 300;

function readGeometry(): WindowGeometry | null {
  try {
    const raw = window.localStorage.getItem(GEOMETRY_KEY);

    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== "object") return null;
    const source = parsed as Partial<Record<keyof WindowGeometry, unknown>>;

    if (
      typeof source.width !== "number" ||
      typeof source.height !== "number" ||
      typeof source.x !== "number" ||
      typeof source.y !== "number"
    ) {
      return null;
    }

    return {
      width: Math.max(MIN_WIDTH, Math.round(source.width)),
      height: Math.max(MIN_HEIGHT, Math.round(source.height)),
      x: Math.round(source.x),
      y: Math.round(source.y),
      maximized: source.maximized === true,
    };
  } catch {
    return null;
  }
}

function saveGeometry(geometry: WindowGeometry): void {
  try {
    window.localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry));
  } catch {
    // Quota or disabled storage — the geometry just does not persist.
  }
}

/** Position must land within a real monitor's area (8px slack, plus a
 *  titlebar row at the top edge). */
async function positionOnScreen(x: number, y: number): Promise<boolean> {
  try {
    const monitors = await availableMonitors();

    return monitors.some(
      (monitor) =>
        x >= monitor.position.x - 8 &&
        x < monitor.position.x + monitor.size.width - 8 &&
        y >= monitor.position.y - 8 &&
        y < monitor.position.y + monitor.size.height - 32,
    );
  } catch {
    return false;
  }
}

export function useWindowGeometry(): void {
  useEffect(() => {
    const win = getCurrentWindow();
    let saveTimer: number | null = null;
    const scheduleSave = () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void (async () => {
          try {
            if (!(await win.isVisible())) return;
            const geometry: WindowGeometry = {
              width: (await win.innerSize()).toLogical(await win.scaleFactor())
                .width,
              height: (await win.innerSize()).toLogical(await win.scaleFactor())
                .height,
              x: (await win.outerPosition()).x,
              y: (await win.outerPosition()).y,
              maximized: await win.isMaximized(),
            };

            if (
              !geometry.maximized &&
              (geometry.width < MIN_WIDTH || geometry.height < MIN_HEIGHT)
            ) {
              return;
            }
            saveGeometry(geometry);
          } catch {
            // The window went away mid-save — nothing worth reporting.
          }
        })();
      }, SAVE_DEBOUNCE_MS);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") scheduleSave();
    };

    document.addEventListener("visibilitychange", onHide);
    const unlisteners: Array<Promise<() => void>> = [
      win.onMoved(scheduleSave),
      win.onResized(scheduleSave),
      // The Rust close handler hides the window; capture the geometry at the
      // same moment from the webview side.
      win.onCloseRequested(() => {
        scheduleSave();
      }),
    ];

    void (async () => {
      try {
        const geometry = readGeometry();

        if (geometry) {
          if (geometry.maximized) {
            await win.maximize();
          } else if (await positionOnScreen(geometry.x, geometry.y)) {
            await win.setSize(new LogicalSize(geometry.width, geometry.height));
            await win.setPosition(new PhysicalPosition(geometry.x, geometry.y));
          }
        }
        await win.show();
      } catch {
        // Never leave the window hidden over a failed restore.
        try {
          await win.show();
        } catch {
          // The Rust watchdog covers this layer too.
        }
      }
    })();

    return () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      document.removeEventListener("visibilitychange", onHide);
      void Promise.all(unlisteners).then((unlisten) => {
        for (const off of unlisten) off();
      });
    };
  }, []);
}
