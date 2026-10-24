// path: src/vtt/camera.ts
// Where the table's window onto the map sits, and how to move it.
//
// Two ends need this maths and they must not drift: the table view draws the
// image at some origin, and the DM's minimap draws a rectangle showing which
// part of the image that origin exposes. One is the inverse of the other, so
// both live here and neither recomputes it locally.
//
// Coordinate spaces, kept straight by name:
//   · image px   — the map image's own pixels (natural size)
//   · table px   — CSS pixels on the table screen; image px × scale
//   · percent    — 0–100 across the image, how POIs and shapes are stored
//
// The camera's *size* is not a setting. The table draws at a fixed physical
// scale, so how much map fits is decided by the TV and the calibration. The DM
// chooses only where the window sits.
import type { CastViewport, MapGrid, TableCalibration } from './protocol'

export interface Size { w: number; h: number }
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Table px per image px.
 *
 * Calibrated, this is pure physics: one grid square must come out one inch.
 * Uncalibrated, there is no honest answer, so the image is fitted to the
 * screen — wrong for minis, but visibly wrong rather than silently off.
 */
export function tableScale(
  natural: Size,
  grid: MapGrid | null,
  calibration: Pick<TableCalibration, 'pxPerInch'>,
  screen: Size,
): number {
  if (grid && grid.square > 0) return calibration.pxPerInch / grid.square
  if (!natural.w || !natural.h || !screen.w || !screen.h) return 1
  return Math.min(screen.w / natural.w, screen.h / natural.h)
}

export interface Layout {
  /** The image's drawn size, in table px. */
  imgW: number
  imgH: number
  /** Where its top-left corner lands on the table screen, pan included. */
  originX: number
  originY: number
}

/**
 * An image smaller than the screen sits centred; a larger one starts at the
 * top-left corner. Pan is applied on top either way, so a given pan means the
 * same thing at any image size.
 */
export function layout(natural: Size, scale: number, screen: Size, pan: CastViewport): Layout {
  const imgW = natural.w * scale
  const imgH = natural.h * scale
  const baseX = imgW < screen.w ? (screen.w - imgW) / 2 : 0
  const baseY = imgH < screen.h ? (screen.h - imgH) / 2 : 0
  return { imgW, imgH, originX: baseX + pan.panX, originY: baseY + pan.panY }
}

/** How much of the image the screen can hold, in image px. */
export function visibleImageSize(scale: number, screen: Size): Size {
  if (scale <= 0) return { w: 0, h: 0 }
  return { w: screen.w / scale, h: screen.h / scale }
}

/**
 * The part of the image currently on the table, in image px.
 *
 * May extend past the image's own bounds when the map is smaller than the
 * screen — that is honest, and the minimap draws it that way so the DM can see
 * there is nothing more to pan to.
 */
export function cameraRect(natural: Size, scale: number, screen: Size, pan: CastViewport): Rect {
  const { originX, originY } = layout(natural, scale, screen, pan)
  const vis = visibleImageSize(scale, screen)
  return { x: -originX / scale, y: -originY / scale, w: vis.w, h: vis.h }
}

/**
 * The pan that puts `point` (image px) at the centre of the table screen,
 * clamped so the camera never runs off the edge of the map.
 *
 * On an axis where the whole image already fits, the clamp collapses to zero
 * pan: there is nothing to scroll, and letting it drift would only slide the
 * map away from centre.
 */
export function panToCentre(natural: Size, scale: number, screen: Size, point: Point): CastViewport {
  if (scale <= 0) return { panX: 0, panY: 0 }
  const vis = visibleImageSize(scale, screen)
  const imgW = natural.w * scale
  const imgH = natural.h * scale
  const baseX = imgW < screen.w ? (screen.w - imgW) / 2 : 0
  const baseY = imgH < screen.h ? (screen.h - imgH) / 2 : 0

  const axis = (centre: number, naturalLen: number, visLen: number, base: number) => {
    const left = naturalLen > visLen
      ? clamp(centre - visLen / 2, 0, naturalLen - visLen)
      : (naturalLen - visLen) / 2
    return -left * scale - base
  }

  return {
    panX: axis(point.x, natural.w, vis.w, baseX),
    panY: axis(point.y, natural.h, vis.h, baseY),
  }
}

/** Percent-space coords (how POIs are stored) to image px. */
export function percentToImage(natural: Size, p: Point): Point {
  return { x: (p.x / 100) * natural.w, y: (p.y / 100) * natural.h }
}
