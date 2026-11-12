// path: src/utils/previewCrop.ts
// The part of an article's picture its hover card shows. Hover cards draw the
// picture as a wide strip (PREVIEW_ASPECT); the article stores which strip of
// the image that is, as fractions of the image, set from a box in edit mode.
//
// The crop remembers the image it was set on (`src`): change the portrait and
// the old crop no longer applies, so the new picture gets the default framing.

/** Hover cards show their picture 320 wide and PREVIEW_HEIGHT tall. */
export const PREVIEW_HEIGHT = 140
export const PREVIEW_ASPECT = 320 / PREVIEW_HEIGHT
/** With no crop set, frame toward the top: portraits put the face there. */
export const DEFAULT_FOCUS_Y = 0.2

export interface PreviewCrop { src: string; x: number; y: number; w: number; h: number }
export type CropRect = Omit<PreviewCrop, 'src'>

const finite = (n: unknown) => typeof n === 'number' && isFinite(n)

/** The stored crop, when it is valid and was set on this image. */
export function parsePreviewCrop(raw: string | null | undefined, src: string | null | undefined): PreviewCrop | null {
  if (!raw || !src) return null
  try {
    const c = JSON.parse(raw)
    if (!c || c.src !== src || ![c.x, c.y, c.w, c.h].every(finite)) return null
    if (c.w <= 0 || c.h <= 0 || c.w > 1.0001 || c.h > 1.0001) return null
    return c
  } catch { return null }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * A stored crop reshaped to the current card shape, keeping its width and
 * centre (so it stays on the same face) and staying inside the image. Crops
 * saved before the card picture changed shape would otherwise be stretched.
 */
export function fitCropToAspect(c: CropRect, imgW: number, imgH: number): CropRect {
  const k = imgW / (PREVIEW_ASPECT * imgH)   // box height per unit of width, in image fractions
  if (Math.abs(c.w * k - c.h) < 1e-3) return c
  let w = Math.min(c.w, 1), h = w * k
  if (h > 1) { h = 1; w = 1 / k }
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2
  return { w, h, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h) }
}

/** The framing used when no crop is set, for an image of the given size. */
export function defaultCropRect(imgW: number, imgH: number): CropRect {
  // Box height as a fraction of the image, for a box spanning the full width.
  const hAtFullWidth = imgW / (PREVIEW_ASPECT * imgH)
  if (hAtFullWidth <= 1) {
    return { x: 0, w: 1, h: hAtFullWidth, y: (1 - hAtFullWidth) * DEFAULT_FOCUS_Y }
  }
  // Wider than the strip: full height, centred.
  const w = (PREVIEW_ASPECT * imgH) / imgW
  return { x: (1 - w) / 2, w, h: 1, y: 0 }
}
