// Guard for the artwork fit table (apps/web/src/lib/achievements/art-fit.ts).
//
// The shipped PNGs fill 70–85 % of their canvas, so the table records the
// measured coin radius per artwork. This test re-measures the alpha disc of
// every PNG and fails when the table drifts — a regenerated or re-encoded
// asset cannot change size without the UI compensating for it.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACHIEVEMENTS } from "@/lib/achievements/catalog";
import {
  ARTWORK_CROP,
  ARTWORK_RADIUS,
  artworkScale,
} from "@/lib/achievements/art-fit";

const ARTWORK_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "achievements",
);

/** Minimal PNG reader: enough for the palette/RGBA art the pipeline writes. */
function alphaDisc(file: string): { radius: number; centerX: number; centerY: number } {
  const buffer = readFileSync(file);
  let offset = 8;
  let header: { width: number; height: number; colorType: number } | null = null;
  let transparency: Buffer | null = null;
  const data: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        colorType: chunk[9],
      };
    } else if (type === "tRNS") {
      transparency = chunk;
    } else if (type === "IDAT") {
      data.push(chunk);
    }

    offset += 12 + length;
  }

  if (!header) throw new Error(`${file}: missing IHDR`);

  const { width, height, colorType } = header;
  const bytesPerPixel = colorType === 3 ? 1 : 4;
  const rowBytes = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(data));
  const pixels = Buffer.alloc(height * rowBytes);
  let cursor = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = raw.subarray(cursor, cursor + rowBytes);
    cursor += rowBytes;
    const previous =
      y > 0 ? pixels.subarray((y - 1) * rowBytes, y * rowBytes) : Buffer.alloc(rowBytes);
    const current = pixels.subarray(y * rowBytes, (y + 1) * rowBytes);

    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let value = line[x];

      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);

        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }

      current[x] = value & 0xff;
    }
  }

  const alphaAt = (index: number): number => {
    if (colorType === 3) {
      const indexValue = pixels[index];

      return transparency && indexValue < transparency.length
        ? transparency[indexValue]
        : 255;
    }

    return pixels[index * 4 + 3];
  };

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(y * width + x) > 127) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) throw new Error(`${file}: no opaque pixels`);

  return {
    radius: (maxX - minX + maxY - minY) / 4 / (width / 2),
    centerX: (minX + maxX) / 2 / width,
    centerY: (minY + maxY) / 2 / height,
  };
}

describe("artwork fit table", () => {
  it("covers every achievement id", () => {
    const ids = ACHIEVEMENTS.map((achievement) => achievement.id).sort();
    const table = Object.keys(ARTWORK_RADIUS).sort();

    expect(table).toEqual(ids);
  });

  it("matches the measured coin radius of every shipped PNG", () => {
    for (const achievement of ACHIEVEMENTS) {
      const file = join(ARTWORK_DIR, `${achievement.id}.png`);

      expect(existsSync(file), file).toBe(true);

      const measured = alphaDisc(file);
      const recorded = ARTWORK_RADIUS[achievement.id];

      expect(
        Math.abs(measured.radius - recorded),
        `${achievement.id}: measured ${measured.radius.toFixed(3)} vs recorded ${recorded}`,
      ).toBeLessThan(0.01);
    }
  });

  it("keeps every coin centered in its canvas", () => {
    for (const achievement of ACHIEVEMENTS) {
      const measured = alphaDisc(
        join(ARTWORK_DIR, `${achievement.id}.png`),
      );

      expect(Math.abs(measured.centerX - 0.5), achievement.id).toBeLessThan(0.03);
      expect(Math.abs(measured.centerY - 0.5), achievement.id).toBeLessThan(0.03);
    }
  });

  it("scales every coin to the same on-screen size", () => {
    const scales = ACHIEVEMENTS.map((achievement) =>
      artworkScale(achievement.id),
    );

    // The same scale for every asset means the same coin size on screen.
    for (const scale of scales) {
      expect(scale).toBeGreaterThan(1);
      expect(scale).toBeLessThan(1.6);
    }

    // Scaled up, every coin covers the frame plus the same crop.
    for (const achievement of ACHIEVEMENTS) {
      const onScreen = ARTWORK_RADIUS[achievement.id] * artworkScale(achievement.id);

      expect(onScreen, achievement.id).toBeCloseTo(1 + ARTWORK_CROP, 6);
    }
  });

  it("leaves an unknown artwork unscaled", () => {
    expect(artworkScale("not-an-achievement")).toBe(1);
  });
});
