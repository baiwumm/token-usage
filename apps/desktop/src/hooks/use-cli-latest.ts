// Click-only CLI update check against the npm registry (docs/desktop-plan.md
// §12.1 network exception): the desktop is otherwise offline, so the request
// fires only when the operator clicks the CLI version chip. The answer lives
// in component state and is never persisted, and a failed or unparsable
// response degrades to a quiet "检查失败" instead of blocking the card.

import { useCallback, useEffect, useState } from "react";

import { compareVersions } from "@/lib/version";

const REGISTRY_URL = "https://registry.npmjs.org/tokenusage-cli/latest";
const TIMEOUT_MS = 8_000;

export type CliLatestState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "outdated"; version: string }
  | { kind: "error" };

function readPublishedVersion(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const version = (payload as { version?: unknown }).version;

  return typeof version === "string" && version.trim() !== ""
    ? version.trim()
    : null;
}

export function useCliLatest(installed: string | null) {
  const [state, setState] = useState<CliLatestState>({ kind: "idle" });

  // A re-probe (CLI upgraded while the window is open) invalidates the answer.
  useEffect(() => {
    setState({ kind: "idle" });
  }, [installed]);

  const check = useCallback(async () => {
    if (installed === null) return;

    setState({ kind: "checking" });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(REGISTRY_URL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const version = readPublishedVersion(await response.json());
      const order =
        version === null ? null : compareVersions(installed, version);

      if (order === null || version === null) {
        setState({ kind: "error" });

        return;
      }

      setState(order >= 0 ? { kind: "latest" } : { kind: "outdated", version });
    } catch {
      setState({ kind: "error" });
    } finally {
      window.clearTimeout(timeout);
    }
  }, [installed]);

  return { state, check };
}
