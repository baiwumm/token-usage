// Token number formatting for the desktop monitor. Fixed zh-CN compact style
// (万 / 亿 via Intl compact notation) — the web's per-user format preferences
// deliberately do not sync across apps (docs/desktop-plan.md §9).

const formatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatTokens(tokens: number): string {
  return formatter.format(tokens);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;

  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}
