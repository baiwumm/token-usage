import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { DashboardPayload } from "@/lib/dashboard/api";

import { Card } from "@heroui/react";

import { DevicePanel } from "./device-panel";
import { PanelOverlay } from "./panel-overlay";

import { SectionError, SectionSkeleton } from "@/components/section-states";

/** Device panel slot: per-device activity for the current window. */
export function DeviceSection({
  copy,
  data,
  refreshing,
  selectedDeviceId,
  status,
  onRetry,
  onSelectDevice,
}: {
  copy: DashboardCopy;
  data: DashboardPayload | null;
  refreshing: boolean;
  selectedDeviceId: string | null;
  status: LoadStatus;
  onRetry: () => void;
  onSelectDevice: (deviceId: string | null) => void;
}) {
  return (
    <div className="relative">
      <PanelOverlay active={refreshing} />
      {status === "ready" && data ? (
        <DevicePanel
          copy={copy}
          devices={data.devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={onSelectDevice}
        />
      ) : (
        <Card className="p-6">
          <Card.Content>
            {status === "loading" ? (
              <SectionSkeleton className="h-44 w-full" />
            ) : (
              <SectionError
                message={copy.states.loadError}
                retry={onRetry}
                retryLabel={copy.states.retry}
              />
            )}
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
