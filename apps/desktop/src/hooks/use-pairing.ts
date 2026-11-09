// Pairing flow state (desktop-plan D3): a gate ("is this machine paired?"),
// the managed `device-login` child lifecycle, and the first sync after
// approval.
//
// The gate asks the CLI (`status --json` → device_token_set) and caches the
// answer in localStorage, so paired machines render the monitor instantly
// and the status check only confirms in the background. The cache means
// "this machine completed pairing": a CLI that is momentarily missing from
// PATH does not un-pair it — only the CLI's own answer flips it back. The
// hook holds no secrets and never talks to the network itself; the Rust
// bridge owns the child process (desktop-plan §3 boundary 3).

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  parseStatusLight,
  pickFirstSyncResult,
  reduceLoginPoll,
  tailOf,
  type DeviceLoginPoll,
  type FirstSyncResult,
  type LoginPhase,
  type PairingGate,
} from "@/lib/pairing";

const PAIRED_CACHE_KEY = "tokenusage.desktop.paired";
const LOGIN_POLL_MS = 2_000;
/** `status --json` walks every provider dir; ~1 s on a loaded machine. */
const GATE_TIMEOUT_MS = 20_000;
/** Grace so the countdown hitting zero and the CLI's own expiry agree. */
const EXPIRY_GRACE_MS = 5_000;

export type FirstSyncPhase =
  { kind: "idle" } | { kind: "running" } | FirstSyncResult;

interface CliRunResult {
  resolved: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function readCachedPaired(): boolean {
  try {
    return window.localStorage.getItem(PAIRED_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCachedPaired(paired: boolean): void {
  try {
    if (paired) {
      window.localStorage.setItem(PAIRED_CACHE_KEY, "1");
    } else {
      window.localStorage.removeItem(PAIRED_CACHE_KEY);
    }
  } catch {
    // Storage unavailable — the gate just re-asks on the next launch.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), ms);
    }),
  ]);
}

async function readSyncLog(): Promise<string | null> {
  try {
    return (
      (await invoke<string | null>("read_tracker_file", {
        relPath: "logs/sync.log",
      })) ?? null
    );
  } catch {
    return null;
  }
}

export function usePairing({
  cliAvailable,
  cliResolved,
  onDataChanged,
}: {
  cliAvailable: boolean;
  cliResolved: boolean;
  /** Monitor refresh after the first sync wrote new local data. */
  onDataChanged: () => Promise<void> | void;
}) {
  const [gate, setGate] = useState<PairingGate>(() =>
    readCachedPaired() ? { kind: "paired" } : { kind: "checking" },
  );
  const [rechecking, setRechecking] = useState(false);
  const [login, setLogin] = useState<LoginPhase>({ kind: "idle" });
  const [firstSync, setFirstSync] = useState<FirstSyncPhase>({ kind: "idle" });
  // Mirrors `login` synchronously: async callbacks (spawn, poll) compare
  // against it after their awaits, so it must never lag a render behind.
  const loginRef = useRef<LoginPhase>(login);
  const browserOpenedRef = useRef(false);
  const onDataChangedRef = useRef(onDataChanged);

  const applyLogin = useCallback((next: LoginPhase) => {
    loginRef.current = next;
    setLogin(next);
  }, []);

  useEffect(() => {
    onDataChangedRef.current = onDataChanged;
  }, [onDataChanged]);

  /** Authoritative check through the CLI; unreadable → the cache decides. */
  const recheckGate = useCallback(async () => {
    setRechecking(true);
    let paired: boolean | null = null;

    try {
      const result = await withTimeout(
        invoke<CliRunResult>("run_cli", { args: ["status", "--json"] }),
        GATE_TIMEOUT_MS,
      );

      paired = result ? parseStatusLight(result.stdout || null) : null;
    } catch {
      paired = null;
    }
    const decided = paired ?? readCachedPaired();

    writeCachedPaired(decided);
    setGate({ kind: decided ? "paired" : "unpaired" });
    setRechecking(false);
  }, []);

  // Gate once the first CLI probe settles, and again when availability
  // flips (the install step's 重新检测). No CLI → no status spawn: the cache
  // alone decides, so a machine that was paired keeps its monitor.
  useEffect(() => {
    if (!cliResolved) {
      return;
    }
    if (cliAvailable) {
      void recheckGate();
    } else {
      setGate({ kind: readCachedPaired() ? "paired" : "unpaired" });
    }
  }, [cliAvailable, cliResolved, recheckGate]);

  const runFirstSync = useCallback(async () => {
    setFirstSync({ kind: "running" });
    const startedAtMs = Date.now();
    let exit = { exitCode: null as number | null, outputTail: "" };

    try {
      const result = await invoke<CliRunResult>("run_cli", {
        args: ["sync", "--auto"],
      });

      exit = {
        exitCode: result.resolved ? result.exitCode : null,
        outputTail: tailOf(
          [result.stdout, result.stderr].filter(Boolean).join("\n"),
        ),
      };
    } catch (error) {
      exit = {
        exitCode: null,
        outputTail: error instanceof Error ? error.message : String(error),
      };
    }
    setFirstSync(pickFirstSyncResult(await readSyncLog(), startedAtMs, exit));
    await onDataChangedRef.current();
  }, []);

  const startLogin = useCallback(async () => {
    applyLogin({ kind: "starting" });
    setFirstSync({ kind: "idle" });
    browserOpenedRef.current = false;
    try {
      await invoke("device_login_start");
    } catch (error) {
      applyLogin({
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      });

      return;
    }
    // A cancel pressed while the spawn was in flight must win. Polling only
    // starts from here: before the child is registered, the bridge answers
    // "idle", which the reducer would read as a failed launch.
    if (loginRef.current.kind === "starting") {
      applyLogin({ kind: "waiting", code: null, expiresAtMs: null });
    }
  }, [applyLogin]);

  const cancelLogin = useCallback(async () => {
    applyLogin({ kind: "idle" });
    try {
      await invoke("device_login_cancel");
    } catch {
      // The child may have already exited; the next start replaces it.
    }
  }, [applyLogin]);

  const pollLogin = useCallback(async () => {
    if (loginRef.current.kind !== "waiting") {
      return;
    }
    let poll: DeviceLoginPoll;

    try {
      poll = await invoke<DeviceLoginPoll>("device_login_poll");
    } catch {
      return; // bridge hiccup — the next tick retries
    }
    const prev = loginRef.current;

    if (prev.kind !== "waiting") {
      return; // cancelled or reset while the poll was in flight
    }
    const now = Date.now();

    if (prev.expiresAtMs !== null && now > prev.expiresAtMs + EXPIRY_GRACE_MS) {
      void invoke("device_login_cancel").catch(() => undefined);
      applyLogin({ kind: "failed", message: "配对码已过期，请重新开始配对" });

      return;
    }
    const { phase, approved } = reduceLoginPoll(prev, poll, now);

    applyLogin(phase);
    if (phase.kind === "waiting" && phase.code && !browserOpenedRef.current) {
      browserOpenedRef.current = true;
      const url =
        phase.code.verificationUriComplete ?? phase.code.verificationUri;

      void invoke("open_in_browser", { url }).catch(() => undefined);
    }
    if (approved) {
      // The CLI wrote the token; caching "paired" now keeps the monitor up
      // on the next launch even if the window closes mid-wizard.
      writeCachedPaired(true);
      void runFirstSync();
    }
  }, [applyLogin, runFirstSync]);

  useEffect(() => {
    if (login.kind !== "waiting") {
      return;
    }
    // First poll right away so the code shows within the authorize round
    // trip; the kind stays "waiting" while the code arrives, so this effect
    // does not restart (and re-poll) on that transition.
    void pollLogin();
    const timer = window.setInterval(() => {
      void pollLogin();
    }, LOGIN_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [login.kind, pollLogin]);

  /** Re-open the browser approval page for the current code. */
  const reopenBrowser = useCallback(() => {
    const current = loginRef.current;

    if (current.kind !== "waiting" || !current.code) {
      return;
    }
    const url =
      current.code.verificationUriComplete ?? current.code.verificationUri;

    void invoke("open_in_browser", { url }).catch(() => undefined);
  }, []);

  /** Wizard exit: flip the gate to the monitor. */
  const finishPairing = useCallback(() => {
    writeCachedPaired(true);
    setGate({ kind: "paired" });
  }, []);

  return {
    gate,
    rechecking,
    login,
    firstSync,
    recheckGate,
    startLogin,
    cancelLogin,
    reopenBrowser,
    runFirstSync,
    finishPairing,
  };
}
