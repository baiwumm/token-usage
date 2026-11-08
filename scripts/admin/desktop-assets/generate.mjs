// Generate the desktop app icon source (1024×1024 PNG) for `tauri icon`.
//
// Design: dark rounded tile + three ascending usage bars in the VERMILLION
// brand accent (#c2402a → oklch(55.43% 0.17 32.08), the Broadsheet ink red
// adopted on the landing page). Drawn at 4× supersampling and box-downscaled
// for smooth edges — no image API, no extra dependency: pngjs from the repo
// root devDependencies (approved 2026-10-30 for the achievement pipeline).
//
// Usage: node scripts/admin/desktop-assets/generate.mjs
// Output: apps/desktop/src-tauri/icons/source.png
// Then:   pnpm --filter @token-usage/desktop exec tauri icon \
//           src-tauri/icons/source.png -o src-tauri/icons

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "..", "apps", "desktop", "src-tauri", "icons", "source.png");

const SIZE = 1024;
const S = 4; // supersampling factor
const N = SIZE * S;

const TILE = { x0: 64, y0: 64, x1: 960, y1: 960, r: 208 };
const BAR_WIDTH = 136;
const BAR_BASE = 752;
const BAR_RADIUS = 32;
// Ascending bars, the tallest reading as "usage growing".
const BARS = [
  { x: 264, h: 256 },
  { x: 444, h: 384 },
  { x: 624, h: 512 },
];
const BG = [23, 23, 27]; // dark tile (#17171b), sits fine in light and dark
const ACCENT = [194, 64, 42]; // #c2402a VERMILLION

function clipRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function sample(sx, sy) {
  const px = sx / S;
  const py = sy / S;
  if (!clipRoundRect(px, py, TILE.x0, TILE.y0, TILE.x1, TILE.y1, TILE.r)) {
    return null; // transparent outside the tile
  }
  for (const bar of BARS) {
    const top = BAR_BASE - bar.h;
    if (
      clipRoundRect(
        px,
        py,
        bar.x,
        top,
        bar.x + BAR_WIDTH,
        BAR_BASE,
        BAR_RADIUS,
      )
    ) {
      return ACCENT;
    }
  }
  return BG;
}

const png = new PNG({ width: SIZE, height: SIZE });
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const value = sample(x * S + sx, y * S + sy);
        if (value) {
          r += value[0];
          g += value[1];
          b += value[2];
          a += 255;
        }
      }
    }
    const samples = S * S;
    const idx = (SIZE * y + x) << 2;
    png.data[idx] = Math.round(r / samples);
    png.data[idx + 1] = Math.round(g / samples);
    png.data[idx + 2] = Math.round(b / samples);
    png.data[idx + 3] = Math.round(a / samples);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, PNG.sync.write(png));
console.log(`wrote ${OUT}`);
