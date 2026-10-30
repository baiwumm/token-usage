// Regenerate the achievement badge artwork.
//
// Pipeline per badge (id order = prompts.json):
//   1. `mmx image generate` (image-01, 1:1) with the shared style template
//      from prompts.json → a 1024px JPEG on a pure black void.
//   2. QA: the frame border must be black, and the coin must be a round,
//      centered, bright-rimmed disc of 70–95 % of the frame width.
//   3. Failed QA → retry with the next seed (up to 4 attempts).
//   4. Circular alpha cut (the coin becomes a transparent disc) and a
//      box-filter downscale to 256px → apps/web/public/achievements/<id>.png
//
// Requirements (NOT runtime dependencies of the app — see README.md):
//   - the `mmx` CLI on PATH (MiniMax image generation)
//   - `jpeg-js` + `pngjs` in the repo root devDependencies (approved 2026-10-30)
//
// Usage: node scripts/admin/achievement-assets/generate.mjs [--only id,id]
//        [--seed <base>]   # 改基准 seed（同一 subject 换构图时用）
//        [--optimize]      # 不出图，只对现有 PNG 做量化收口（需 sharp）
//        [--optimize-only] # 只量化，不出图（需 sharp）

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const OUT_DIR = join(ROOT, "apps", "web", "public", "achievements");
const WORK = join(HERE, ".work");

const manifest = JSON.parse(
  readFileSync(join(HERE, "prompts.json"), "utf8"),
);
const STYLE = manifest.style.join(", ");
const SIZE = manifest.size ?? 256;

const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const seedArg = process.argv.indexOf("--seed");
const SEED_BASE = seedArg > -1 ? Number(process.argv[seedArg + 1]) : 41000;
const optimizeOnly = process.argv.includes("--optimize-only");

/**
 * Optional palette quantization (256 colors + alpha). Needs `sharp`, an
 * optional devDependency that is not installed (see README.md) — the pipeline
 * still works without it, the PNGs are just heavier (~80-110 KB instead of
 * ~30 KB).
 */
async function optimize(file) {
  try {
    const { default: sharp } = await import("sharp");

    const out = await sharp(readFileSync(file))
      .png({ palette: true, quality: 88, effort: 10, compressionLevel: 9 })
      .toBuffer();

    writeFileSync(file, out);

    return `${(out.length / 1024).toFixed(1)} KB`;
  } catch {
    return "skipped (sharp unavailable)";
  }
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(WORK, { recursive: true });

function luminance(data, index) {
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
}

/** POSIX single-quote escaping: prompts contain apostrophes ("conductor's"). */
function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * QA pass: black void background + a round, centered, bright-rimmed coin.
 * Returns the circle geometry when the frame is usable.
 */
function inspect(raw) {
  const { width: W, height: H, data } = raw;
  let borderSum = 0;
  let borderCount = 0;

  for (let x = 0; x < W; x += 1) {
    for (const y of [0, 1, H - 2, H - 1]) {
      borderSum += luminance(data, (y * W + x) * 4);
      borderCount += 1;
    }
  }
  for (let y = 0; y < H; y += 1) {
    for (const x of [0, 1, W - 2, W - 1]) {
      borderSum += luminance(data, (y * W + x) * 4);
      borderCount += 1;
    }
  }
  const borderMean = borderSum / borderCount;

  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (luminance(data, (y * W + x) * 4) > 45) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { ok: false, reason: "no bright rim" };

  const width = maxX - minX;
  const height = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ratio = Math.max(width, height) / W;

  if (borderMean > 18) {
    return { ok: false, reason: `background not black (${borderMean.toFixed(1)})` };
  }
  if (ratio < 0.7 || ratio > 0.95) {
    return { ok: false, reason: `coin size ${ratio.toFixed(2)}` };
  }
  if (Math.abs(width - height) > 0.08 * W) {
    return { ok: false, reason: `coin not round (${width}x${height})` };
  }
  if (Math.abs(cx - W / 2) > 0.05 * W || Math.abs(cy - H / 2) > 0.05 * H) {
    return { ok: false, reason: `coin off-center` };
  }

  return { ok: true, cx, cy, radius: Math.max(width, height) / 2 };
}

/** Circular alpha mask + box-filter downscale to SIZE x SIZE. */
function cut(raw, geometry) {
  const { width: W, height: H, data } = raw;
  const alpha = new Uint8Array(W * H);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const distance = Math.hypot(x + 0.5 - geometry.cx, y + 0.5 - geometry.cy);
      const edge = geometry.radius - 1.5;

      alpha[y * W + x] =
        distance <= edge
          ? 255
          : distance <= geometry.radius
            ? Math.round((255 * (geometry.radius - distance)) / 1.5)
            : 0;
    }
  }

  const png = new PNG({ width: SIZE, height: SIZE });
  const scale = W / SIZE;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const x0 = Math.floor(x * scale);
      const x1 = Math.floor((x + 1) * scale);
      const y0 = Math.floor(y * scale);
      const y1 = Math.floor((y + 1) * scale);

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * W + sx) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          a += alpha[sy * W + sx];
          n += 1;
        }
      }

      const o = (y * SIZE + x) * 4;
      png.data[o] = Math.round(r / n);
      png.data[o + 1] = Math.round(g / n);
      png.data[o + 2] = Math.round(b / n);
      png.data[o + 3] = Math.round(a / n);
    }
  }

  return png;
}

const entries = Object.entries(manifest.badges);

for (const [index, [id, entry]] of entries.entries()) {
  if (only && !only.has(id)) continue;

  const target = join(OUT_DIR, `${id}.png`);

  if (optimizeOnly) {
    console.log(`${id}: ${await optimize(target)}`);
    continue;
  }

  const prompt = `${entry.subject}, ${STYLE}, accent color ${entry.accent}`;
  let written = false;

  for (let attempt = 1; attempt <= 4 && !written; attempt += 1) {
    const seed = SEED_BASE + index * 17 + attempt;
    const prefix = `${id}-a${attempt}`;

    try {
      execFileSync(
        "bash",
        [
          "-lc",
          `mmx image generate --aspect-ratio ${manifest.aspectRatio} --n 1 --seed ${seed} --out-dir ${shellQuote(WORK)} --out-prefix ${prefix} --quiet --prompt ${shellQuote(prompt)}`,
        ],
        { stdio: ["ignore", "pipe", "pipe"], timeout: 300000 },
      );
    } catch {
      console.log(`${id} attempt ${attempt}: generation failed`);
      continue;
    }

    let raw;

    try {
      raw = jpeg.decode(readFileSync(join(WORK, `${prefix}_001.jpg`)), {
        useTArray: true,
      });
    } catch {
      console.log(`${id} attempt ${attempt}: decode failed`);
      continue;
    }

    const qa = inspect(raw);

    if (!qa.ok) {
      console.log(`${id} attempt ${attempt}: QA failed - ${qa.reason}`);
      continue;
    }

    writeFileSync(
      target,
      PNG.sync.write(cut(raw, qa), { colorType: 6, deflateLevel: 9 }),
    );
    console.log(`${id}: OK (attempt ${attempt}, seed ${seed}) -> ${await optimize(target)}`);
    written = true;
  }

  if (!written) console.log(`${id}: FAILED - rerun with --only ${id}`);
}
