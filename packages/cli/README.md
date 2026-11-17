<p align="center">
  <strong>English</strong> · <a href="https://github.com/baiwumm/token-usage/blob/main/packages/cli/README.zh-CN.md">简体中文</a>
</p>

# tokenusage-cli

Self-hosted AI coding token usage collector. It parses the logs your AI tools already write,
reports aggregate usage to a paired [Token Usage](https://www.token-usage.cc) dashboard, and
never uploads prompts, message bodies, absolute paths or session titles.

- Website: https://www.token-usage.cc
- Dashboard docs: https://www.token-usage.cc/docs/cli/
- Collector API contract: https://github.com/baiwumm/token-usage/blob/main/docs/cli-contract.md
- License and provenance: `LICENSE` and `THIRD_PARTY_NOTICES.md`

> Requires Node.js ≥ 22.19 (driven by the `undici` 8 engine floor).

## Quick start (three steps)

```bash
# 1) Initialize: scan root configs and per-tool usage hooks, then register an hourly
#    collection task (Windows runs it through a hidden-window VBS; --no-task skips it).
#    Registering the enhanced task definition needs an elevated shell — without it the
#    task degrades to a plain hourly trigger and init prints a "degraded" notice.
tokenusage init

# 2) Pair: print a user_code and approve it in the browser
tokenusage device-login
#    → https://<your-site>/device?user_code=XXXX-XXXX
#    → the device token is stored locally after approval (code valid for 15 minutes)

# 3) Report
tokenusage sync            # one round: parse → queue → upload
tokenusage sync --drain    # first run or a large backlog (bigger batch budget)
```

That's it. The task registered by `init` collects hourly; you can also run
`tokenusage sync` manually or keep a resident watcher with `--watch`. To stop automatic
collection entirely, use `tokenusage pause`.

**Who approves a pairing?** Whoever is logged in at the site when approving — the device and
all of its data are bound to that account, and accounts are fully isolated. On a self-hosted
instance you approve your own devices; an administrator neither needs to nor can approve other
people's. A stranger can request a pairing code, but without an account they cannot approve it
(sign-ups are invite-only / gated by `token_allowed_emails`), and codes expire after 15 minutes.

## Commands

| Command | What it does |
| --- | --- |
| `tokenusage init` | Local setup: scan root configs, install per-tool hooks, register the hourly task (hidden window on Windows), refresh the runtime copy. **Does not pair** |
| `tokenusage device-login` | Device flow: print a `user_code`, approve it at `/device`, store the device token |
| `tokenusage sync` | Parse local AI tool logs → upload hourly buckets + session metadata |
| `tokenusage upload` | Flush the local queue without scanning sources |
| `tokenusage reconcile` | Read-only check: local `queue.jsonl` last-wins baseline vs. this device's cloud buckets, compared per `(hour_start, source, model)`. Exits 1 on drift |
| `tokenusage pause` / `resume` | Pause/resume automatic collection — scheduled task, hooks and `--watch` all go quiet; manual `sync` still works |
| `tokenusage status` | Local state: base URL, token, device identity, collection state, queue backlog, last parse/upload times |
| `tokenusage doctor` | Health check (runtime, network, tool configs, task degradation); non-zero exit on critical issues |
| `tokenusage diagnostics` | Export diagnostics JSON (home directory paths redacted to `~`) |
| `tokenusage sessions` | Export local session analysis (JSON/CSV, metadata only) |
| `tokenusage uninstall [--purge]` | Remove hooks, scheduled task and runtime copy; `--purge` also deletes the data directory (machine identity is kept) |

Configuration precedence: CLI flags > `~/.tokenusage/.../config.json` > environment variables
(`TOKENUSAGE_BASE_URL` etc.) > built-in defaults.

Help and errors: `tokenusage help`, `tokenusage help <command>` and
`tokenusage <command> --help` all work. Bad arguments print a single `Error: ...` line plus a
`Hint:` and exit with code `2`; runtime failures exit `1`. Add `--debug` for a stack trace.

## Common flags

<details>
<summary><code>init</code></summary>

| Flag | Meaning |
| --- | --- |
| `--base-url <url>` | Backend URL (defaults to the hosted instance) |
| `--dashboard-url <url>` | Dashboard URL shown in the success message |
| `--anon-key <key>` / `--anon-key-file <path>` | Publishable key of a self-hosted instance |
| `--integrations <ids,all,none>` | Choose which tool integrations to take over; `none` equals `--no-integrations` |
| `--no-integrations` | Leave every tool config untouched |
| `--no-task` | Do not register the scheduled collection task |
| `--run-report=on\|off` | Toggle run-report uploads (heartbeat) |
| `--yes` | Non-interactive |
| `--dry-run` | Preview without writing |
| `--no-open` | Do not open the browser automatically |

Removed: `--email` / `--password` / `--device-name` / `--link-code` / `--no-auth` (pairing
only goes through `device-login`).
</details>

<details>
<summary><code>sync</code></summary>

| Flag | Meaning |
| --- | --- |
| `--watch` / `--interval <ms>` | Resident mode, default every 15 minutes (minimum 60000) |
| `--upload-only` | Skip scanning, flush the queue only (same as `upload`) |
| `--drain` | Raise batch limits and drain the whole backlog |
| `--no-sessions` | Upload hourly buckets only, skip session metadata |
| `--publish-account` | Publish account-level sources locally (cursor / trae-cn) |
| `--all-local-sources` | Also scan background sources |
| `--auto` | Automatic mode: respects the pause flag and the cloud sync switch |
| `--from-notify` / `--from-openclaw` / `--from-retry` / `--from-scheduled` | Trigger markers used by hooks and the scheduler |
| `--wait-for-lock` | Wait instead of skipping when another sync is running |
| `--background` / `--lightweight` | Reduced scanning profiles |
| `--repair-grok` | Rebuild Grok rows from session snapshots |
| `--timing` | Print phase timings (scan / upload / sessions) in the summary |

Available `--source` ids are listed by `tokenusage sync --help`.
</details>

<details>
<summary><code>upload</code> / <code>reconcile</code> / <code>status</code> / <code>doctor</code> / <code>diagnostics</code> / <code>sessions</code> / <code>device-login</code></summary>

| Command | Flags |
| --- | --- |
| `upload` | `--drain` / `--force` (raise batch limits, ignore cooldown), `--json` |
| `reconcile` | `--days <n>` (default 7, max 366), `--from` / `--to` (UTC calendar days, inclusive), `--limit <n>` (1–2000), `--json` |
| `status` | `--diagnostics`, `--json`, `--light`, `--limits` (vendor quota panels; reads local credentials and calls vendor APIs), `--no-spinner`, `--probe-keychain` / `--probe-keychain-details` (macOS) |
| `doctor` | `--json`, `--out <file>`, `--base-url <url>` |
| `diagnostics` | `--out <file>`, `--compact` / `--pretty` |
| `sessions` | `--from` / `--to`, `--format json\|csv` (or `--csv`), `--out <file>` (atomic write, 0600), `--refresh`, `--no-git` |
| `device-login` | `--json`, `--base-url <url>`, `--dashboard-url <url>`, `--anon-key <key>` / `--anon-key-file <path>` |
</details>

### Reconcile without re-scanning

```bash
tokenusage reconcile                     # last 7 days
tokenusage reconcile --days 30           # last 30 days (max 366)
tokenusage reconcile --from 2026-10-25 --to 2026-10-31   # UTC calendar days, --to inclusive
tokenusage reconcile --json              # structured drift details for scripts/dashboards
```

- The baseline is exactly what `sync` / `upload` would send: the whole `queue.jsonl` reduced by
  `(hour_start, source, model)` with last-wins semantics.
- Drift comes in three kinds: `missing_on_server` (local only, usually a pending upload),
  `server_only` (cloud only — queue trimmed or machine identity changed), and `mismatch` (same
  key, different values, with per-field `local → cloud` differences). Any of them exits `1`.
- Local buckets after the `queue.state.json` offset are reported as **pending**: listed
  separately, not counted as drift, and they do not trigger exit code `1`.

## `sync --watch`: resident reporting

```bash
tokenusage sync --watch                          # every 15 minutes
tokenusage sync --watch --interval 300000        # every 5 minutes
tokenusage sync --watch --interval 3600000 --no-sessions   # hourly, buckets only
```

- Stops with Ctrl+C. `--watch` is a foreground process; it registers no system task. Stopping
  is always safe — the queue and watermarks are persisted, and the next `sync` resumes.
- Each round is incremental: the first one parses all historical logs, later ones only rescan
  changed files. Both the upload offset and the session watermark are checkpointed, so nothing
  is uploaded twice or lost.
- Backoff: consecutive failures stretch the interval 1x → 2x → 5x (reason on stderr); one
  success resets it.

## Collection control and scheduling

```bash
tokenusage pause            # pause automatic collection (task / hooks / --watch)
tokenusage resume           # resume
tokenusage status           # current state
```

- The pause flag is persistent and silent: scheduled runs, hook/notify triggers and `--watch`
  exit quietly. Manual `tokenusage sync` always works.
- `init` registers an hourly collection for your platform; `pause`/`resume` disable and
  re-enable it, and `uninstall` removes it together with its scripts.

  | Platform | Schedule |
  | --- | --- |
  | Windows | Scheduled task `TokenUsageSync` (`schtasks /Create /XML`, hidden via VBS; runs on logon, catches up on missed runs, retries 3 times, no execution timeout) |
  | macOS | launchd `~/Library/LaunchAgents/com.token-usage.sync.plist` (`StartInterval` 3600 + `RunAtLoad`) |
  | Linux | systemd user timer `token-usage-sync.timer` (`Persistent=true`, catches up after boot) |
  | Other | No native scheduler — use `tokenusage sync --watch` or run `sync` manually |

- Automatic runs log JSONL to `~/.tokenusage/tracker/logs/sync.log` (fields such as `phase`,
  `status`, `parsed_files`, `buckets`, `inserted`, `pending_bytes`; rotated at 1 MiB).

## Run reports

After every round — including empty rounds — the CLI uploads one aggregate run record: time,
trigger (scheduled/manual/watch/notify), result, duration, parsed file count and upload volume.
The dashboard's "Collector runs" page uses it as a health signal, so empty runs still count as
a heartbeat.

- Only aggregate counters and the version string; no paths, titles or message bodies.
- Best effort: a failure is logged locally and never blocks usage collection.
- Opt out with `tokenusage init --run-report=off`.

## When you haven't paired yet

The CLI works unpaired, just degraded to **collect but not upload**:

- `sync` parses and queues as usual, then reports `skipped (no device token)`. Data stays in
  the local queue and is not lost — the next `sync --drain` after pairing uploads everything.
- `sync --auto` (hook-triggered) waits quietly for a token.
- `status` / `doctor` work normally and show a missing token as a warning.
- Server side, requests without a pairing token are rejected with `401`; an unpaired machine
  can read nothing.

So installing the CLI first and configuring the site later is a legitimate path; the backlog is
uploaded the moment pairing completes.

## Privacy boundary

Only **aggregate usage** is uploaded:

- Hourly buckets: six token counters per tool per hour, model name, project basename, and
  credits (credit-based sources only, tracked as a separate dimension).
- Session metadata: `session_id` (vendor UUID, or a stable local fingerprint for sources
  without one), source, start/end time, project basename, token split, per-model usage,
  credits.

**Never uploaded:** prompts, assistant messages, tool arguments, command output, diffs,
session titles, absolute local paths, resume commands. A field whitelist in
`test/session-upload.test.js` locks this boundary.

The CLI sends no anonymous install heartbeat and no third-party error reports. Apart from the
instance you paired, nothing receives data.

## Data directory

`~/.tokenusage/` (`0700` directory, `0600` files):

| File | Purpose |
| --- | --- |
| `tracker/config.json` | Pairing and runtime config (base URL, device token, machine id) |
| `tracker/app/` | Self-contained runtime copy (`.runtime-ready` records the version) |
| `tracker/queue.jsonl` / `queue.state.json` | Upload queue and upload offset (reconcile baseline) |
| `tracker/project.queue.jsonl` | Project-level queue (`project_key` buckets) |
| `tracker/cursors.json` | Per-source incremental cursors |
| `tracker/session-upload-watermarks.json` | Session upload watermarks |
| `tracker/upload.throttle.json` | Upload throttling state |
| `tracker/logs/sync.log` | Rolling automatic-run log (JSONL) |

The self-contained runtime copy means the scheduled task keeps working after an nvm-windows
Node switch; `tokenusage doctor` reports a missing or stale copy, and `uninstall --purge`
removes it together with the data directory.

## Provider support

Parsers ship for every supported source and stay dormant when the corresponding tool is not
configured. The authoritative list is `tokenusage sync --help` (currently 46 local sources plus
5 background sources); what is actually enabled on your machine is shown by
`tokenusage status`. Unused parsers upload nothing.

Note: `cursor` and `trae-cn` are account-level sources; session metadata is never uploaded for
them.

## FAQ

**Does it read my prompts?** No. The collector parses token counts and model names from local
logs; prompts, replies and tool output are never read into the upload payload.

**Do I need to change my AI tools or use a proxy?** No. There is no proxy and no SDK; the CLI
reads the logs the tools already produce.

**Can several machines report to one dashboard?** Yes. Each machine pairs separately, and usage
aggregates under one account with a per-device drill-down.

**Why is the first `sync` slow?** It parses all historical logs once. Later rounds only rescan
changed files and use checkpointed offsets.

## Development

```bash
pnpm install            # repository root
pnpm --filter tokenusage-cli test
```

Releases use the repository's `cli-v*` tag workflow (Trusted Publishing); see the
[release guide](https://github.com/baiwumm/token-usage/blob/main/docs/cli-release.md).
