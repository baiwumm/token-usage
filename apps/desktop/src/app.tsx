import { Toast } from "@heroui/react";

import { MonitorBody } from "@/components/monitor/monitor-body";

/** Root composition for the monitor window. */
export function App() {
  return (
    <>
      <MonitorBody />
      <Toast.Provider placement="bottom end" />
    </>
  );
}
