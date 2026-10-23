// Device enrollment for the device flow — ports the I/O half of
// api/_lib/device.js against the token_* tables.
//
// The old tokentracker_device_machine 1:1 table is folded into
// token_devices.machine_cluster_id (rewrite-plan §3): the first value written
// for a device stays stable forever ("已存在则幂等跳过").

import { insert, select, update, type RestRow } from "./supabase-rest";

import { randomHex, sha256Hex, deviceNameFor } from "@/lib/device-codes";

const DEVICE_COLUMNS =
  "id,device_name,platform,machine_id,machine_cluster_id,revoked_at";

export type DeviceRow = RestRow;

async function findActiveDevice(
  userId: string,
  machineId: string | null,
  name: string,
): Promise<DeviceRow | null> {
  if (machineId) {
    const rows = await select("token_devices", {
      select: DEVICE_COLUMNS,
      filters: [
        ["user_id", "eq", userId],
        ["machine_id", "eq", machineId],
        ["revoked_at", "is", "null"],
      ],
      limit: 1,
    });

    if (rows[0]) return rows[0];
  }
  const rows = await select("token_devices", {
    select: DEVICE_COLUMNS,
    filters: [
      ["user_id", "eq", userId],
      ["device_name", "eq", name],
      ["revoked_at", "is", "null"],
    ],
    limit: 1,
  });

  return rows[0] || null;
}

async function createDevice(
  userId: string,
  name: string,
  machineId: string | null,
): Promise<DeviceRow> {
  let candidate = name;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await insert("token_devices", [
        {
          user_id: userId,
          device_name: candidate,
          platform: "cli-device-flow",
          machine_id: machineId || null,
          default_device_name: candidate,
        },
      ]);

      return rows[0];
    } catch (error) {
      // The active-name index protects against hostname collisions. Retry with
      // a stable machine suffix instead of merging two PCs into one device.
      const status = (error as { status?: unknown }).status;

      if (status !== 409) throw error;
      candidate = `${name} #${randomHex(2)}`.slice(0, 128);
    }
  }
  throw new Error("Could not allocate a unique device name");
}

// Folded tokentracker_device_machine: set machine_cluster_id once; a value
// already present on the device row is left alone.
async function ensureMachineCluster(
  device: DeviceRow,
  machineId: string | null,
): Promise<void> {
  const clusterId = machineId || String(device.id);

  if (device.machine_cluster_id) return;
  await update(
    "token_devices",
    { machine_cluster_id: clusterId },
    [
      ["id", "eq", device.id],
      ["machine_cluster_id", "is", "null"],
    ],
    { returning: false },
  );
}

export async function issueDeviceToken({
  userId,
  clientInfo,
  machineId,
}: {
  userId: string;
  clientInfo: unknown;
  machineId: string | null;
}): Promise<{ token: string; deviceId: string; machineId: string | null }> {
  const name = deviceNameFor(clientInfo, machineId);
  let device = await findActiveDevice(userId, machineId, name);

  if (!device) {
    device = await createDevice(userId, name, machineId);
  }
  await ensureMachineCluster(device, machineId);

  const now = new Date().toISOString();

  await update(
    "token_device_tokens",
    { revoked_at: now },
    [
      ["device_id", "eq", device.id],
      ["revoked_at", "is", "null"],
    ],
    { returning: false },
  );

  const token = randomHex(32);

  await insert("token_device_tokens", [
    {
      user_id: userId,
      device_id: device.id,
      token_hash: sha256Hex(token),
    },
  ]);

  return {
    token,
    deviceId: String(device.id),
    machineId: machineId || (device.machine_id as string | null) || null,
  };
}
