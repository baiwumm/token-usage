// Pure SVG renderer for the public badge (docs/badge.md §5). Same input in,
// same bytes out: no Date.now()/Math.random(), fixed system fonts (GitHub
// camo blocks remote ones), a fixed character-width table for layout, and
// every dynamic string XML-escaped. Output never carries scripts, external
// references or request context (§5.1); the xmlns declaration is the one
// http:// string allowed — a namespace identifier, never fetched, without
// which browsers refuse to decode the standalone image.
//
// Numbers go through ./format — the badge's fixed server-side defaults
// (§4.5), shared with the /u page so both always agree.

import type { BadgeData, BadgeTheme, RenderOptions } from "./types";

import {
  formatBadgeCost,
  formatBadgeCount,
  formatBadgeShare,
  formatBadgeTokens,
} from "./format";

interface Palette {
  bg0: string;
  bg1: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  track: string;
}

const DARK: Palette = {
  bg0: "#0d0f1a",
  bg1: "#161a2e",
  border: "rgba(255,255,255,.08)",
  text: "#f5f6fa",
  muted: "rgba(245,246,250,.55)",
  accent: "#7c8cff",
  track: "rgba(255,255,255,.12)",
};

const LIGHT: Palette = {
  bg0: "#ffffff",
  bg1: "#ffffff",
  border: "rgba(15,23,42,.10)",
  text: "#0f172a",
  muted: "rgba(15,23,42,.55)",
  accent: "#4f46e5",
  track: "rgba(15,23,42,.12)",
};

// theme=auto (§5.5): one embedded <style> flips every palette token on
// prefers-color-scheme; elements paint via classes so the SAME svg adapts.
const AUTO_STYLE =
  "<style>.c-t{fill:#0f172a}.c-m{fill:rgba(15,23,42,.55)}.c-a{fill:#4f46e5}" +
  ".c-as{stroke:#4f46e5}.c-tr{fill:rgba(15,23,42,.12)}.c-bg{fill:#ffffff}" +
  ".c-bd{stroke:rgba(15,23,42,.10)}" +
  ".c-b0{stop-color:#ffffff}.c-b1{stop-color:#ffffff}" +
  "@media (prefers-color-scheme: dark){.c-t{fill:#f5f6fa}" +
  ".c-m{fill:rgba(245,246,250,.55)}.c-a{fill:#7c8cff}.c-as{stroke:#7c8cff}" +
  ".c-tr{fill:rgba(255,255,255,.12)}.c-bg{fill:#161a2e}" +
  ".c-bd{stroke:rgba(255,255,255,.08)}" +
  ".c-b0{stop-color:#0d0f1a}.c-b1{stop-color:#161a2e}}</style>";

const FONT_STACK =
  "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Paint = { kind: "inline"; p: Palette } | { kind: "class" };

function paintFor(theme: BadgeTheme): Paint {
  if (theme === "auto") return { kind: "class" };

  return { kind: "inline", p: theme === "light" ? LIGHT : DARK };
}

type PaintToken = "text" | "muted" | "accent" | "track" | "bg";

const PAINT_CLASS: Record<PaintToken, string> = {
  text: "c-t",
  muted: "c-m",
  accent: "c-a",
  track: "c-tr",
  bg: "c-bg",
};

function fillAttr(paint: Paint, token: PaintToken): string {
  if (paint.kind === "class") return `class="${PAINT_CLASS[token]}"`;

  return `fill="${token === "bg" ? paint.p.bg1 : paint.p[token]}"`;
}

// ---------------------------------------------------------------------------
// Text helpers.
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Fixed-width estimate (§5.1): same character set → same width, no fonts
// involved, so layout is a pure function of the text.
function textWidth(value: string, size: number): number {
  let units = 0;

  for (const ch of value) {
    if ("iljI|!.,:;'`·".includes(ch)) units += 0.3;
    else if ("mwMW@…".includes(ch)) units += 0.88;
    else if (ch >= "A" && ch <= "Z") units += 0.68;
    else if (ch >= "0" && ch <= "9") units += 0.6;
    else units += 0.56;
  }

  return units * size;
}

function truncateByWidth(
  value: string,
  size: number,
  maxWidth: number,
): string {
  if (textWidth(value, size) <= maxWidth) return value;
  const budget = maxWidth - textWidth("…", size);
  let out = "";

  for (const ch of value) {
    if (textWidth(out + ch, size) > budget) break;
    out += ch;
  }

  return `${out}…`;
}

// §5.1: project display truncates at 24 characters with an ellipsis.
function projectDisplay(project: string): string {
  return project.length > 24 ? `${project.slice(0, 23)}…` : project;
}

interface TextOptions {
  weight?: number;
  anchor?: "start" | "end" | "middle";
  spacing?: number;
}

function textEl(
  x: number,
  y: number,
  size: number,
  fill: string,
  content: string,
  options: TextOptions = {},
): string {
  const weight = options.weight ? ` font-weight="${options.weight}"` : "";
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const spacing = options.spacing ? ` letter-spacing="${options.spacing}"` : "";

  return `<text x="${x}" y="${y}" font-size="${size}"${weight}${anchor}${spacing} ${fill}>${escapeXml(content)}</text>`;
}

// ---------------------------------------------------------------------------
// SVG fragments.
// ---------------------------------------------------------------------------

function svgOpen(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="${FONT_STACK}">`;
}

function gradientDef(paint: Paint): string {
  const stops =
    paint.kind === "class"
      ? '<stop offset="0" class="c-b0"/><stop offset="1" class="c-b1"/>'
      : `<stop offset="0" stop-color="${paint.p.bg0}"/><stop offset="1" stop-color="${paint.p.bg1}"/>`;

  return `<defs><linearGradient id="bu-bg" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>`;
}

function canvasRects(paint: Paint, width: number, height: number): string {
  const border =
    paint.kind === "class"
      ? 'class="c-bd" fill="none"'
      : `stroke="${paint.p.border}" fill="none"`;

  return `<rect width="${width}" height="${height}" rx="12" fill="url(#bu-bg)"/><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="11.5" ${border}/>`;
}

// §5.4: normalized polyline of the daily series, stroke-only. Fewer than two
// points (empty series) degrades to plain panel.
function sparklinePolyline(
  series: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  paint: Paint,
): string | null {
  if (series.length < 2) return null;
  const max = Math.max(0, ...series);
  const step = width / (series.length - 1);
  const points = series
    .map((value, index) => {
      const norm =
        max > 0 && Number.isFinite(value) ? Math.max(0, value) / max : 0;
      const px = x + index * step;
      const py = y + (height - 3) - norm * (height - 6);

      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");

  const stroke =
    paint.kind === "class" ? 'class="c-as"' : `stroke="${paint.p.accent}"`;

  return `<polyline points="${points}" fill="none" ${stroke} stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function statSlot(
  x: number,
  label: string,
  value: string,
  paint: Paint,
): string {
  return (
    textEl(x, 120, 10, fillAttr(paint, "muted"), label, { spacing: 1 }) +
    textEl(x, 150, 24, fillAttr(paint, "text"), value, { weight: 700 })
  );
}

// §5.2: the bottom-right block switches on scope — user gets TOP SOURCES with
// share bars, repo gets TOP MODELS with token counts.
function rightBlock(data: BadgeData, paint: Paint): string {
  const header = data.scope === "user" ? "TOP SOURCES" : "TOP MODELS";
  const rows =
    data.scope === "user"
      ? data.sources.slice(0, 2).map((source) => ({
          name: source.label,
          detail: formatBadgeShare(source.share),
          share: source.share,
        }))
      : data.models.slice(0, 2).map((model) => ({
          name: model.label,
          detail: formatBadgeTokens(model.tokens),
          share: null,
        }));

  let out = textEl(452, 112, 10, fillAttr(paint, "muted"), header, {
    spacing: 1,
  });

  if (rows.length === 0) {
    return out + textEl(452, 132, 11, fillAttr(paint, "muted"), "—");
  }

  rows.forEach((row, index) => {
    const baseline = 132 + index * 30;
    const name = truncateByWidth(row.name, 11, 88);

    out += textEl(452, baseline, 11, fillAttr(paint, "text"), name);
    out += textEl(576, baseline, 10, fillAttr(paint, "muted"), row.detail, {
      anchor: "end",
    });
    if (row.share != null) {
      out += `<rect x="452" y="${baseline + 6}" width="90" height="4" rx="2" ${fillAttr(paint, "track")}/>`;
      const filled = Math.round(90 * Math.min(1, Math.max(0, row.share ?? 0)));

      if (filled > 0) {
        out += `<rect x="452" y="${baseline + 6}" width="${filled}" height="4" rx="2" ${fillAttr(paint, "accent")}/>`;
      }
    }
  });

  return out;
}

function renderPanel(
  data: BadgeData,
  theme: BadgeTheme,
  withSparkline: boolean,
): string {
  const paint = paintFor(theme);
  const title = data.displayName.trim() || "AI Coding Usage";
  const subtitle = `TOTAL USAGE · ${data.range === "30d" ? "30 DAYS" : "ALL TIME"}`;
  const sparkline = withSparkline
    ? sparklinePolyline(data.series, 456, 48, 120, 28, paint)
    : null;
  const styleBlock = paint.kind === "class" ? AUTO_STYLE : "";

  return (
    svgOpen(600, 176) +
    styleBlock +
    gradientDef(paint) +
    canvasRects(paint, 600, 176) +
    textEl(24, 44, 18, fillAttr(paint, "text"), title, { weight: 700 }) +
    textEl(24, 64, 10, fillAttr(paint, "muted"), subtitle, { spacing: 1.5 }) +
    (data.scope === "repo" && data.project
      ? textEl(
          24,
          84,
          12,
          fillAttr(paint, "accent"),
          projectDisplay(data.project),
          { weight: 600 },
        )
      : "") +
    textEl(576, 32, 10, fillAttr(paint, "accent"), "TOKEN USAGE", {
      anchor: "end",
      spacing: 2,
    }) +
    (sparkline ?? "") +
    statSlot(24, "TOKENS", formatBadgeTokens(data.totals.tokens), paint) +
    statSlot(180, "COST", formatBadgeCost(data.totals.costUsd), paint) +
    statSlot(
      330,
      "ACTIVE DAYS",
      formatBadgeCount(data.totals.activeDays),
      paint,
    ) +
    rightBlock(data, paint) +
    "</svg>"
  );
}

// §5.3: single-line 20px double-segment badge; segment fills derive from the
// palette (accent left; right = opaque bg with the track wash on top, so the
// chip stays legible on any page background) — no new colors. The clip keeps
// the outer corners round and the seam square.
function renderCompact(data: BadgeData, theme: BadgeTheme): string {
  const paint = paintFor(theme);
  const right = `${formatBadgeTokens(data.totals.tokens)} · ${formatBadgeCost(data.totals.costUsd)}`;
  const leftWidth = Math.ceil(textWidth("token usage", 11)) + 16;
  const rightWidth = Math.ceil(textWidth(right, 11)) + 16;
  const width = leftWidth + rightWidth;
  const styleBlock = paint.kind === "class" ? AUTO_STYLE : "";

  return (
    svgOpen(width, 20) +
    styleBlock +
    `<defs><clipPath id="bu-clip"><rect width="${width}" height="20" rx="3"/></clipPath></defs>` +
    '<g clip-path="url(#bu-clip)">' +
    `<rect width="${leftWidth}" height="20" ${fillAttr(paint, "accent")}/>` +
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" ${fillAttr(paint, "bg")}/>` +
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" ${fillAttr(paint, "track")}/>` +
    "</g>" +
    textEl(8, 14, 11, 'fill="#ffffff"', "token usage") +
    textEl(leftWidth + 6, 14, 11, fillAttr(paint, "text"), right) +
    "</svg>"
  );
}

export function renderBadgeSvg(
  data: BadgeData,
  options: RenderOptions,
): string {
  if (options.style === "compact") return renderCompact(data, options.theme);

  return renderPanel(data, options.theme, options.style === "sparkline");
}

// Appendix B: fixed 160×20 compact-form gray card — opaque palette bg with
// the track wash and a text-colored label, auto-adaptive and self-contained
// so it stays legible on any page. Carries nothing but the fallback copy —
// no request context ever reaches it.
export function renderFallbackBadge(message: string): string {
  const text = textEl(80, 14, 11, 'class="c-t"', message, { anchor: "middle" });

  return (
    svgOpen(160, 20) +
    AUTO_STYLE +
    '<rect width="160" height="20" rx="3" class="c-bg"/>' +
    '<rect width="160" height="20" rx="3" class="c-tr"/>' +
    text +
    "</svg>"
  );
}
