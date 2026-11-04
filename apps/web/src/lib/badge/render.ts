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

import type { BadgeMark } from "./marks";
import type { BadgeData, BadgeTheme, RenderOptions } from "./types";

import {
  formatBadgeCost,
  formatBadgeCount,
  formatBadgeShare,
  formatBadgeTokens,
} from "./format";
import { SOURCE_MARKS } from "./marks";

import { sourceLogoFile } from "@/lib/sources";

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
  ".c-lg-d{display:none}.c-lg-l{display:inline}" +
  "@media (prefers-color-scheme: dark){.c-t{fill:#f5f6fa}" +
  ".c-m{fill:rgba(245,246,250,.55)}.c-a{fill:#7c8cff}.c-as{stroke:#7c8cff}" +
  ".c-tr{fill:rgba(255,255,255,.12)}.c-bg{fill:#161a2e}" +
  ".c-bd{stroke:rgba(255,255,255,.08)}" +
  ".c-b0{stop-color:#0d0f1a}.c-b1{stop-color:#161a2e}" +
  ".c-lg-d{display:inline}.c-lg-l{display:none}}</style>";

const FONT_STACK =
  "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Paint = { kind: "inline"; p: Palette; dark: boolean } | { kind: "class" };

function paintFor(theme: BadgeTheme): Paint {
  if (theme === "auto") return { kind: "class" };

  return {
    kind: "inline",
    p: theme === "light" ? LIGHT : DARK,
    dark: theme !== "light",
  };
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

// §5.2: the subtitle carries the range for account badges; a repo badge puts
// its uppercased project key where "ALL TIME" sits (operator call 2026-11-04)
// and keeps the range phrase only for the 30-day window.
function subtitleFor(data: BadgeData): string {
  const range = data.range === "30d" ? "30 DAYS" : "ALL TIME";

  if (data.scope === "repo" && data.project) {
    const project = projectDisplay(data.project).toUpperCase();

    return data.range === "30d"
      ? `TOTAL USAGE · ${project} · ${range}`
      : `TOTAL USAGE · ${project}`;
  }

  return `TOTAL USAGE · ${range}`;
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

function defsBlock(paint: Paint, extra = ""): string {
  const stops =
    paint.kind === "class"
      ? '<stop offset="0" class="c-b0"/><stop offset="1" class="c-b1"/>'
      : `<stop offset="0" stop-color="${paint.p.bg0}"/><stop offset="1" stop-color="${paint.p.bg1}"/>`;

  return `<defs><linearGradient id="bu-bg" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>${extra}</defs>`;
}

// ---------------------------------------------------------------------------
// Marks and avatar (§5.2, 2026-11-02).
// ---------------------------------------------------------------------------

// The product mark ships as two assets: public/logo.svg (black tile + white
// glyph, for light backgrounds) and public/logo-dark.svg (inverted, for dark
// backgrounds). Both are inlined as geometry with their own fills — painting
// the glyph with the palette accent read almost invisible on the dark card
// (operator report, 2026-11-02). theme=auto embeds both and flips them with
// the same media query that drives the palette.
const PRODUCT_LOGO = {
  light: { tile: "#0A0A0A", glyph: "#FFFFFF" },
  dark: { tile: "#FFFFFF", glyph: "#0A0A0B" },
} as const;

// Brand lockup (§5.2, 2026-11-03): product mark + name, with the project's
// site right under the name. Fixed text rather than the request host — every
// self-hosted deployment points at the same project site, and a host-derived
// string would make the output non-deterministic (byte-level goldens, §5.1).
const PROJECT_SITE = "token-usage.cc";

function productLogoBox(tile: string, glyph: string): string {
  return (
    `<rect width="360" height="360" rx="80" ry="80" fill="${tile}"/>` +
    `<rect x="118" y="106" width="124" height="40" rx="12" fill="${glyph}"/>` +
    `<rect x="159" y="146" width="42" height="108" rx="12" fill="${glyph}"/>` +
    `<rect x="210" y="222" width="32" height="32" rx="8" fill="${glyph}"/>`
  );
}

function productLogoAt(
  x: number,
  y: number,
  size: number,
  variant: { tile: string; glyph: string },
): string {
  const scale = (size / 360).toFixed(4);

  return `<g transform="translate(${x} ${y}) scale(${scale})">${productLogoBox(variant.tile, variant.glyph)}</g>`;
}

function productMark(x: number, y: number, size: number, paint: Paint): string {
  if (paint.kind === "inline") {
    return productLogoAt(
      x,
      y,
      size,
      paint.dark ? PRODUCT_LOGO.dark : PRODUCT_LOGO.light,
    );
  }

  return (
    `<g class="c-lg-l">${productLogoAt(x, y, size, PRODUCT_LOGO.light)}</g>` +
    `<g class="c-lg-d">${productLogoAt(x, y, size, PRODUCT_LOGO.dark)}</g>`
  );
}

function markFromFile(file: string | null): BadgeMark | null {
  if (!file) return null;
  const stem = file
    .replace(/^\/brand-logos\//, "")
    .replace(/\.(svg|png)$/i, "");

  return SOURCE_MARKS[stem] ?? null;
}

// Draws a mark in a fixed square box; the geometry keeps its source viewBox
// and is scaled/offset here, so no per-logo layout data leaks into the caller.
function drawMark(
  mark: BadgeMark,
  x: number,
  y: number,
  size: number,
  paint: Paint,
): string {
  const [vx, vy, vw, vh] = mark.viewBox;
  const scale = size / Math.max(vw, vh);
  const dx = x - vx * scale + (size - vw * scale) / 2;
  const dy = y - vy * scale + (size - vh * scale) / 2;

  return `<g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(4)})" ${fillAttr(paint, "text")}>${mark.shapes.join("")}</g>`;
}

const AVATAR = { cx: 44, cy: 46, r: 18, x: 26, y: 28, size: 36 };

function avatarDefs(data: BadgeData): string {
  return data.avatarDataUri
    ? `<clipPath id="bu-av"><circle cx="${AVATAR.cx}" cy="${AVATAR.cy}" r="${AVATAR.r}"/></clipPath>`
    : "";
}

// Owner avatar next to the name. The image travels inline as a data: URI
// (an <img>-embedded SVG cannot fetch external resources). No avatar means no
// avatar block at all — the name simply starts at the card margin (operator
// call 2026-11-02; the initials placeholder is gone).
function avatarBlock(data: BadgeData): string {
  if (!data.avatarDataUri) return "";

  return `<image x="${AVATAR.x}" y="${AVATAR.y}" width="${AVATAR.size}" height="${AVATAR.size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#bu-av)" href="${data.avatarDataUri}"/>`;
}

// §5.6: restrained entrance — translate only (never opacity), so a renderer
// that freezes at t=0 still shows every element; share bars animate width.
function reveal(delay: number, rise = 5): string {
  return `<animateTransform attributeName="transform" type="translate" from="0 ${rise}" to="0 0" dur="0.9s" begin="${delay}s" fill="freeze"/>`;
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

// §5.2 (2026-11-04): both scopes show the same block — the top source with its
// share — so a repo badge reads like an account badge (it used to switch to
// TOP MODELS with a token count). Models stay on the public page. The bar runs
// from the row name to the card's right edge; a fixed 72px stub left a visible
// gap before the percentage (operator report).
const RIGHT_EDGE = 576;
const DETAIL_GAP = 8;

function rightBlock(data: BadgeData, paint: Paint): string {
  const source = data.sources[0];
  const blockX = 452;

  // The header baseline matches the three left-hand stat labels (y=120) and
  // the row baseline matches their values (y=150), so the block reads as one
  // row of aligned columns (operator call 2026-11-02).
  let out = textEl(blockX, 120, 10, fillAttr(paint, "muted"), "TOP SOURCES", {
    spacing: 1,
  });

  if (!source || !source.label) {
    return out + textEl(blockX, 150, 11, fillAttr(paint, "muted"), "—");
  }

  const mark = markFromFile(sourceLogoFile(source.key));
  const detail = formatBadgeShare(source.share);
  const nameX = mark ? blockX + 18 : blockX;
  const nameMax = RIGHT_EDGE - textWidth(detail, 10) - DETAIL_GAP - nameX;

  if (mark) out += drawMark(mark, blockX, 140, 12, paint);
  out += textEl(
    nameX,
    150,
    11,
    fillAttr(paint, "text"),
    truncateByWidth(source.label, 11, nameMax),
  );
  out += textEl(RIGHT_EDGE, 150, 10, fillAttr(paint, "muted"), detail, {
    anchor: "end",
  });

  const barX = nameX;
  const barWidth = RIGHT_EDGE - barX;

  out += `<rect x="${barX}" y="157" width="${barWidth}" height="4" rx="2" ${fillAttr(paint, "track")}/>`;
  const filled = Math.round(
    barWidth * Math.min(1, Math.max(0, source.share ?? 0)),
  );

  if (filled > 0) {
    out += `<rect x="${barX}" y="157" width="${filled}" height="4" rx="2" ${fillAttr(paint, "accent")}><animate attributeName="width" from="0" to="${filled}" dur="1.1s" begin="0.15s" fill="freeze"/></rect>`;
  }

  return out;
}

function renderPanel(
  data: BadgeData,
  theme: BadgeTheme,
  withSparkline: boolean,
): string {
  const paint = paintFor(theme);
  const title = data.displayName.trim() || "AI Coding Usage";
  const subtitle = subtitleFor(data);
  const sparkline = withSparkline
    ? sparklinePolyline(data.series, 456, 56, 120, 28, paint)
    : null;
  const styleBlock = paint.kind === "class" ? AUTO_STYLE : "";
  // Without an avatar the left column starts at the card margin; with one the
  // text shifts right and gets a narrower title budget.
  const nameX = data.avatarDataUri ? 74 : 24;
  const titleMax = data.avatarDataUri ? 360 : 410;

  return (
    svgOpen(600, 176) +
    styleBlock +
    defsBlock(paint, avatarDefs(data)) +
    canvasRects(paint, 600, 176) +
    `<g>${reveal(0, 4)}` +
    avatarBlock(data) +
    textEl(
      nameX,
      44,
      18,
      fillAttr(paint, "text"),
      truncateByWidth(title, 18, titleMax),
      {
        weight: 700,
      },
    ) +
    textEl(nameX, 64, 10, fillAttr(paint, "muted"), subtitle, {
      spacing: 1.5,
    }) +
    "</g>" +
    // §5.2: the mark sits to the right of the two text lines and is centered
    // on the block as a whole (2026-11-04 operator call) — its 24px box spans
    // the name and site rows, which run y≈25–47.
    textEl(540, 32, 10, fillAttr(paint, "accent"), "TOKEN USAGE", {
      anchor: "end",
      spacing: 2,
    }) +
    textEl(540, 45, 9, fillAttr(paint, "muted"), PROJECT_SITE, {
      anchor: "end",
      spacing: 0.5,
    }) +
    productMark(552, 24, 24, paint) +
    (sparkline ?? "") +
    // §5.6 (2026-11-04): all four columns share one entrance group, so they
    // cannot drift apart in any frame — staggered groups made the TOP block
    // sit a few pixels off from the three stat columns mid-animation.
    `<g>${reveal(0.05)}` +
    statSlot(24, "TOKENS", formatBadgeTokens(data.totals.tokens), paint) +
    statSlot(180, "COST", formatBadgeCost(data.totals.costUsd), paint) +
    statSlot(
      330,
      "ACTIVE DAYS",
      formatBadgeCount(data.totals.activeDays),
      paint,
    ) +
    rightBlock(data, paint) +
    "</g>" +
    "</svg>"
  );
}

// §5.3: single-line 20px double-segment badge. The brand segment is a fixed
// black plate carrying the product mark and the uppercase name in white
// (operator call 2026-11-02) — black/white reads the same on any page, so it
// does not follow the theme; the value segment keeps the palette (opaque bg
// with the track wash on top) so the numbers stay legible on both themes. The
// clip keeps the outer corners round and the seam square.
const COMPACT_PAD = 6;
const COMPACT_BRAND_BG = "#0A0A0A";
const COMPACT_LOGO_SIZE = 14;
const COMPACT_LABEL = "TOKEN USAGE";

function renderCompact(data: BadgeData, theme: BadgeTheme): string {
  const paint = paintFor(theme);
  const right = `${formatBadgeTokens(data.totals.tokens)} · ${formatBadgeCost(data.totals.costUsd)}`;
  const labelX = COMPACT_PAD + COMPACT_LOGO_SIZE + 5;
  const leftWidth =
    labelX + Math.ceil(textWidth(COMPACT_LABEL, 10)) + COMPACT_PAD;
  const rightWidth = Math.ceil(textWidth(right, 11)) + COMPACT_PAD * 2;
  const width = leftWidth + rightWidth;
  const styleBlock = paint.kind === "class" ? AUTO_STYLE : "";

  return (
    svgOpen(width, 20) +
    styleBlock +
    `<defs><clipPath id="bu-clip"><rect width="${width}" height="20" rx="3"/></clipPath></defs>` +
    '<g clip-path="url(#bu-clip)">' +
    `<rect width="${leftWidth}" height="20" fill="${COMPACT_BRAND_BG}"/>` +
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" ${fillAttr(paint, "bg")}/>` +
    `<rect x="${leftWidth}" width="${rightWidth}" height="20" ${fillAttr(paint, "track")}/>` +
    "</g>" +
    // The plate is black, so it takes the dark-theme asset (white tile +
    // dark glyph) — the same variant the panel badge uses on dark cards.
    productLogoAt(COMPACT_PAD, 3, COMPACT_LOGO_SIZE, PRODUCT_LOGO.dark) +
    textEl(labelX, 14, 10, 'fill="#ffffff"', COMPACT_LABEL, { weight: 600 }) +
    textEl(leftWidth + COMPACT_PAD, 14, 11, fillAttr(paint, "text"), right) +
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
