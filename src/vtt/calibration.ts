// path: src/vtt/calibration.ts
// Turning a TV into a battle grid is two measurements, and they are easy to
// confuse, so they are named apart throughout:
//
//   · screen calibration — how many CSS pixels make one physical inch on the
//     glass. A property of the television, kept per display id.
//   · map grid — how many image pixels make one square in a given map's art.
//     A property of that map, kept in `maps.grid`.
//
// Render the image at (pxPerInch / square) and one square comes out one inch
// wide, which is where a 25 mm base goes. That ratio is the whole feature.
//
// Consequence worth stating: on the table, zoom is not a user control. Free
// zoom would put the minis out of register with the art. The DM pans; the
// scale is fixed by physics.
import type { TableCalibration } from './protocol'
import { DEFAULT_CALIBRATION, POI_LABEL_SIZE_MAX, POI_LABEL_SIZE_MIN } from './protocol'

export interface DisplayBounds { width: number; height: number }

export interface ScreenCalibration {
  /** What the DM typed: the TV's advertised diagonal. */
  diagonalInches: number
  /**
   * CSS px per inch. Normally derived from the diagonal, but kept separately
   * because the honest final step is holding a ruler against the screen and
   * nudging until the on-screen inch measures an inch.
   */
  pxPerInch: number
}

/**
 * CSS pixels per inch for a display of these bounds at that diagonal.
 *
 * Electron reports bounds in DIP and a renderer's CSS pixel is one DIP, so the
 * scale factor cancels and must NOT be applied here — folding it in was wrong
 * by exactly the factor it introduced on any scaled display.
 */
export function pxPerInchFromDiagonal(bounds: DisplayBounds, diagonalInches: number): number {
  if (!(diagonalInches > 0)) return DEFAULT_CALIBRATION.pxPerInch
  return Math.hypot(bounds.width, bounds.height) / diagonalInches
}

// ── Persistence ───────────────────────────────────────────────────────────────
// Per display id, because a laptop that meets two different TVs should not have
// to be recalibrated each time it changes rooms.

const SCREENS_KEY = 'dmforge:vtt:screens'
const PREFS_KEY = 'dmforge:vtt:prefs'

type ScreenMap = Record<string, ScreenCalibration>

function readScreens(): ScreenMap {
  try {
    const raw = localStorage.getItem(SCREENS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as ScreenMap : {}
  } catch {
    return {}
  }
}

export function loadScreenCalibration(displayId: number | null): ScreenCalibration | null {
  if (displayId == null) return null
  const entry = readScreens()[String(displayId)]
  if (!entry || !Number.isFinite(entry.pxPerInch) || entry.pxPerInch <= 0) return null
  return entry
}

export function saveScreenCalibration(displayId: number, cal: ScreenCalibration): void {
  try {
    const all = readScreens()
    all[String(displayId)] = cal
    localStorage.setItem(SCREENS_KEY, JSON.stringify(all))
  } catch { /* private mode — calibration just won't persist */ }
}

/** Grid appearance, shared across displays: a look, not a measurement. */
export type GridPrefs = Omit<TableCalibration, 'pxPerInch'>

export function loadGridPrefs(): GridPrefs {
  const fallback: GridPrefs = {
    showGrid: DEFAULT_CALIBRATION.showGrid,
    gridColor: DEFAULT_CALIBRATION.gridColor,
    gridOpacity: DEFAULT_CALIBRATION.gridOpacity,
    poiLabelSize: DEFAULT_CALIBRATION.poiLabelSize,
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw)
    return {
      showGrid: typeof p.showGrid === 'boolean' ? p.showGrid : fallback.showGrid,
      gridColor: typeof p.gridColor === 'string' ? p.gridColor : fallback.gridColor,
      gridOpacity: Number.isFinite(Number(p.gridOpacity)) ? Number(p.gridOpacity) : fallback.gridOpacity,
      // Clamped on read as well as write: a stored value from a build with
      // different bounds should not put an unreadable label on the table.
      poiLabelSize: clampLabelSize(Number(p.poiLabelSize), fallback.poiLabelSize),
    }
  } catch {
    return fallback
  }
}

export function clampLabelSize(n: number, fallback = DEFAULT_CALIBRATION.poiLabelSize): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(POI_LABEL_SIZE_MAX, Math.max(POI_LABEL_SIZE_MIN, n))
}

export function saveGridPrefs(prefs: GridPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
}
