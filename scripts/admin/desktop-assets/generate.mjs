// Generate the desktop app icon source (1024×1024 PNG) for `tauri icon`,
// straight from the project logo (apps/desktop/public/logo.svg) so the brand
// mark lives in exactly one place.
//
// The logo is simple geometry (rounded tiles drawn as <rect> elements), so the
// renderer reads those rects out of the SVG and paints them in document order
// at 4× supersampling, then box-downscales for smooth edges — no SVG engine,
// no image API, no new dependency (pngjs is a repo-root devDependency).
//
// Usage: node scripts/admin/desktop-assets/generate.mjs
// Output: apps/desktop/src-tauri/icons/source.png
// Then:   pnpm --filter @token-usage/desktop exec tauri icon \
//           src-tauri/icons/source.png -o src-tauri/icons

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const LOGO = join(ROOT, "apps", "desktop", "public", "logo.svg");
const OUT = join(ROOT, "apps", "desktop", "src-tauri", "icons", "source.png");

const SIZE = 1024;
const S = 4; // supersampling factor

const svg = readFileSync(LOGO, "utf8");
const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBox) throw new Error(`${LOGO}: missing "0 0 <w> <h>" viewBox`);
const VB_W = Number(viewBox[1]);
const VB_H = Number(viewBox[2]);

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]+)"`));
  return match ? match[1] : null;
}

function hexToRgb(value) {
  const hex = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`${LOGO}: unsupported fill "${value}" (only #rrggbb rects)`);
  }
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

// Painter's order: later rects paint over earlier ones.
const shapes = [...svg.matchAll(/<rect\b[^>]*>/g)].map(([tag]) => {
  const fill = attr(tag, "fill");
  const width = attr(tag, "width");
  const height = attr(tag, "height");
  if (!fill || !width || !height) {
    throw new Error(`${LOGO}: rect needs fill/width/height: ${tag}`);
  }
  return {
    x: Number(attr(tag, "x") ?? 0),
    y: Number(attr(tag, "y") ?? 0),
    width: Number(width),
    height: Number(height),
    radius: Number(attr(tag, "rx") ?? attr(tag, "ry") ?? 0),
    rgb: hexToRgb(fill),
  };
});
if (shapes.length === 0) throw new Error(`${LOGO}: no <rect> shapes to draw`);

function clipRoundRect(px, py, x0, y0, x1, y1, radius) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(py, y0 + radius), y1 - radius);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Paints one sample given in viewBox units; null = transparent. */
function sample(vx, vy) {
  let color = null;
  for (const shape of shapes) {
    if (
      clipRoundRect(
        vx,
        vy,
        shape.x,
        shape.y,
        shape.x + shape.width,
        shape.y + shape.height,
        shape.radius,
      )
    ) {
      color = shape.rgb;
    }
  }
  return color;
}

const png = new PNG({ width: SIZE, height: SIZE });
const samples = S * S;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let covered = 0;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const vx = ((x * S + sx) / (SIZE * S)) * VB_W;
        const vy = ((y * S + sy) / (SIZE * S)) * VB_H;
        const color = sample(vx, vy);
        if (color) {
          r += color[0];
          g += color[1];
          b += color[2];
          covered += 1;
        }
      }
    }
    const idx = (SIZE * y + x) << 2;
    png.data[idx] = covered ? Math.round(r / covered) : 0;
    png.data[idx + 1] = covered ? Math.round(g / covered) : 0;
    png.data[idx + 2] = covered ? Math.round(b / covered) : 0;
    png.data[idx + 3] = Math.round((covered / samples) * 255);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, PNG.sync.write(png));
console.log(`wrote ${OUT}`);
