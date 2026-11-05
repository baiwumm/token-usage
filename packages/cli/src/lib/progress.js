function createProgress({ stream } = {}) {
  const out = stream || process.stdout;
  const enabled = Boolean(out && out.isTTY);
  const frames = ["|", "/", "-", "\\"];
  const intervalMs = 90;

  let timer = null;
  let text = "";
  let frame = 0;
  let lastLen = 0;

  function render() {
    if (!enabled) return;
    const line = `${frames[frame++ % frames.length]} ${text}`;
    const pad = lastLen > line.length ? " ".repeat(lastLen - line.length) : "";
    lastLen = line.length;
    out.write(`\r${line}${pad}`);
  }

  function start(initialText) {
    if (!enabled) return;
    text = initialText || "";
    if (timer) clearInterval(timer);
    timer = setInterval(render, intervalMs);
    render();
  }

  function update(nextText) {
    text = nextText || "";
    render();
  }

  function stop() {
    if (!enabled) return;
    if (timer) clearInterval(timer);
    timer = null;
    out.write(`\r${" ".repeat(lastLen)}\r`);
    lastLen = 0;
  }

  return { enabled, start, update, stop };
}

function renderBar(progress, width = 20) {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const filled = Math.round(p * width);
  const empty = Math.max(0, width - filled);
  return `[${"=".repeat(filled)}${"-".repeat(empty)}] ${Math.round(p * 100)}%`;
}

function formatNumber(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Math.trunc(v).toLocaleString("en-US");
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? String(Math.trunc(v)) : v.toFixed(v >= 10 ? 1 : 2);
  return `${fixed} ${units[i]}`;
}

function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "0s";
  if (n < 1) return "0s";
  if (n < 1000) return `${Math.round(n)}ms`;
  const seconds = n / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(Math.round(seconds - minutes * 60)).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes - hours * 60).padStart(2, "0")}m`;
}

/**
 * The one line that says which collector machine produced this output.
 *
 * One account has two collector machines, and command output gets pasted into
 * release checklists and issue trackers. Without the identity, "the machine"
 * is ambiguous — the device name is the cloud's own name for it
 * (docs/cli-contract.md §2.2), so it matches the dashboard device card.
 */
function formatDeviceLine(identity, { label = "Device", indent = "- " } = {}) {
  const name = identity?.name || "unknown machine";
  const id = identity?.device_id;
  return `${indent}${label}: ${name}${id ? ` (id ${id})` : " (not paired)"}`;
}

module.exports = {
  createProgress,
  renderBar,
  formatNumber,
  formatBytes,
  formatDuration,
  formatDeviceLine,
};
