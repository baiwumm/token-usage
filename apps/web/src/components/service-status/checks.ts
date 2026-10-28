// Probe registry and shared types for /service-status. Kept out of the client
// so the page module only owns state and composition.

import type { ComponentType, SVGProps } from "react";
import type { StatusCheckName } from "@/lib/copy/status";

import { ChartLine, Display, Globe, ShieldCheck } from "@gravity-ui/icons";

export type CheckStatus = "ok" | "fail" | "checking";

// Probes hand their findings back as data, not as sentences, so every row
// follows the active locale; "raw" only carries error text raised by fetch.
export type CheckDetail =
  | { kind: "tokens"; value: number }
  | { kind: "devices"; value: number }
  | { kind: "no-session" }
  | { kind: "raw"; text: string };

export interface CheckResult {
  name: StatusCheckName;
  target: string;
  status: CheckStatus;
  latencyMs: number | null;
  detail?: CheckDetail;
}

export const CHECK_NAMES: StatusCheckName[] = [
  "public-config",
  "session",
  "dashboard",
  "account-devices",
];

export const CHECK_TARGETS: Record<StatusCheckName, string> = {
  "public-config": "/api/functions/token-usage-public-config",
  session: "supabase.auth.getSession",
  dashboard: "/api/functions/token-usage-dashboard",
  "account-devices": "/api/functions/token-usage-account-devices",
};

export const CHECK_ICONS: Record<
  StatusCheckName,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  "public-config": Globe,
  session: ShieldCheck,
  dashboard: ChartLine,
  "account-devices": Display,
};

/** Past this a warm endpoint is unlikely — the hint below suggests a re-run. */
export const LATENCY_SLOW_MS = 1500;
const LATENCY_FAST_MS = 300;

export function nowMs(): number {
  return performance.now();
}

export function latencyTone(ms: number): string {
  if (ms > LATENCY_SLOW_MS) return "text-warning";
  if (ms <= LATENCY_FAST_MS) return "text-success";

  return "";
}

export function initialResults(): CheckResult[] {
  return CHECK_NAMES.map((name) => ({
    name,
    target: CHECK_TARGETS[name],
    status: "checking",
    latencyMs: null,
  }));
}
