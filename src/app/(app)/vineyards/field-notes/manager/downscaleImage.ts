"use client";

// Client-side image downscale for field-note photos. Managers shoot on phones
// over weak rural signal, so we cap the longest edge and re-encode to JPEG to
// keep uploads small (<1MB target). The dimension math is a PURE function so it
// can be unit-tested without a DOM/canvas.

/** Longest-edge cap for an uploaded photo. */
export const MAX_EDGE = 1600;

/**
 * Fit (w, h) inside a square of `max` on the longest edge, preserving aspect
 * ratio. NEVER upscales a smaller image. Handles portrait + landscape. Returns
 * integer pixel dimensions.
 */
export function fitDimensions(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const longest = Math.max(w, h);
  if (longest <= max) return { width: Math.round(w), height: Math.round(h) };
  const scale = max / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** ~1MB target for the encoded blob. */
const TARGET_BYTES = 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed."))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Downscale + re-encode an image File to a JPEG Blob: longest edge ≤ MAX_EDGE,
 * quality ≈0.7, target <1MB. Steps quality down once if still over target.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(img, 0, 0, width, height);

  let blob = await canvasToBlob(canvas, 0.7);
  if (blob.size > TARGET_BYTES) {
    blob = await canvasToBlob(canvas, 0.5);
  }
  return blob;
}
