// Probe registry and shared types for the Settings 实例诊断 card. Kept out of
// the component modules so the card only owns composition. Relocated from the
// former /service-status page (2026-11-07 信息架构调整).

import type { ComponentType, SVGProps } from "react";
import type { DiagnosticsCheckName } from "@/lib/copy/diagnostics";

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
  name: DiagnosticsCheckName;
  target: string;
  status: CheckStatus;
  latencyMs: number | null;
  detail?: CheckDetail;
}

export const CHECK_NAMES: DiagnosticsCheckName[] = [
  "public-config",
  "session",
  "dashboard",
  "account-devices",
];

export const CHECK_TARGETS: Record<DiagnosticsCheckName, string> = {
  "public-config": "/api/functions/token-usage-public-config",
  session: "supabase.auth.getSession",
  dashboard: "/api/functions/token-usage-dashboard",
  "account-devices": "/api/functions/token-usage-account-devices",
};

export const CHECK_ICONS: Record<
  DiagnosticsCheckName,
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
