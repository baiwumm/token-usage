"use client";

/**
 * Avatar crop output: composites the react-easy-crop area + rotation onto a
 * canvas and scales the result to a 256×256 WebP blob (falls back to PNG in
 * browsers whose canvas.toBlob lacks WebP support — both are accepted).
 * Ported from better-admin's crop-image.ts.
 */

import type { Area } from "react-easy-crop";

/** Output size (square, matching the "one avatar per user" small-image role). */
const OUTPUT_SIZE = 256;

function getRadianAngle(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("image export failed"));
        }
      },
      "image/webp",
      0.9,
    );
  });
}

export async function getCroppedWebpBlob(
  imageSrc: string,
  crop: Area,
  rotation: number,
): Promise<Blob> {
  const image = await loadImage(imageSrc);

  // 1. Draw the source rotated onto a square canvas large enough for the
  //    diagonal (the official safeArea algorithm) so rotation cannot clip.
  const maxSize = Math.max(image.naturalWidth, image.naturalHeight);
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

  const canvas = document.createElement("canvas");

  canvas.width = safeArea;
  canvas.height = safeArea;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.translate(safeArea / 2, safeArea / 2);
  ctx.rotate(getRadianAngle(rotation));
  ctx.translate(-safeArea / 2, -safeArea / 2);
  ctx.drawImage(
    image,
    safeArea / 2 - image.naturalWidth * 0.5,
    safeArea / 2 - image.naturalHeight * 0.5,
  );

  // 2. Extract the crop area (croppedAreaPixels is already rotation-aware).
  //    Offsets are negated: translate the (draw offset + crop origin) pixel of
  //    the safeArea bitmap to (0,0) of the new canvas; sign errors silently
  //    crop the wrong region.
  const data = ctx.getImageData(0, 0, safeArea, safeArea);

  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);
  ctx.putImageData(
    data,
    Math.round(-safeArea / 2 + image.naturalWidth * 0.5 - crop.x),
    Math.round(-safeArea / 2 + image.naturalHeight * 0.5 - crop.y),
  );

  // 3. Scale to the fixed 256×256 WebP output.
  const output = document.createElement("canvas");

  output.width = OUTPUT_SIZE;
  output.height = OUTPUT_SIZE;
  output.getContext("2d")?.drawImage(canvas, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return canvasToBlob(output);
}
