import { Toast } from "@heroui/react";

import { MonitorBody } from "@/components/monitor/monitor-body";
import { useWindowGeometry } from "@/hooks/use-window-geometry";

/** Root composition for the monitor window. */
export function App() {
  // Restore-then-show before anything renders (D11 geometry memory).
  useWindowGeometry();

  return (
    <>
      <MonitorBody />
      <Toast.Provider placement="bottom end" />
    </>
  );
}
