// path: electron/main/ipc/vttImportCore.ts
// Reads the two VTT interchange formats Dungeon Alchemist can produce and
// reduces both to one shape the importer can act on.
//
// Pure: node built-ins only, no electron and no db, so the parsing can be
// reasoned about (and tested) on its own. The shell — file dialog, writing the
// image, inserting rows — lives in vttImport.ts. Same split as publishCore.
//
// Everything comes out in PERCENT of the image (0–100), never pixels. Map
// images are downscaled to 4000px wide on import, so pixel coordinates would
// silently stop matching the picture they describe; percentages do not care.
//
// ── Universal VTT (.dd2vtt / .uvtt / .df2vtt) ────────────────────────────────
// Self-describing and self-contained. Distances are in GRID SQUARES, not
// pixels, and the image rides along as base64.
//
//   { "resolution": { "map_size": {"x":30,"y":20}, "pixels_per_grid": 256 },
//     "line_of_sight": [ [ {"x":1,"y":2}, {"x":4,"y":2} ], ... ],
//     "objects_line_of_sight": [ ... ],
//     "portals": [ { "bounds": [ {...}, {...} ], "closed": true } ],
//     "image": "<base64 png>" }
//
// ── Foundry VTT scene JSON ───────────────────────────────────────────────────
// Pixel coordinates, and the image is a path rather than data, so the user
// picks it separately.
//
//   { "width": 4000, "height": 3000, "padding": 0.25,
//     "grid": 100 | { "size": 100 },
//     "walls": [ { "c": [x1,y1,x2,y2], "door": 0, "ds": 0, "sense": 20 } ] }
//
// The padding is the trap. Foundry pads the canvas around the background image
// and stores wall coordinates in that padded space, so they must be shifted
// back by the padding before they mean anything relative to the image.

export type ParsedWallKind = 'wall' | 'door' | 'window'

export interface ParsedWall {
  /** Percent of the image, 0–100. */
  x1: number
  y1: number
  x2: number
  y2: number
  kind: ParsedWallKind
  doorOpen: boolean
}

export interface ParsedVTT {
  source: 'uvtt' | 'foundry'
  name?: string
  /** Grid square in pixels of the ORIGINAL image, before any downscale. */
  pixelsPerGrid: number
  /** Original image size in pixels. */
  imageSize: { w: number; h: number }
  walls: ParsedWall[]
  /** Set by Universal VTT, which embeds the picture. */
  imageBase64?: string
}

export class VTTParseError extends Error {}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Percent, clamped: a stray coordinate should not drag the map off-image. */
const pct = (v: number, total: number) =>
  total > 0 ? Math.max(-1000, Math.min(1000, (v / total) * 100)) : 0

/** A segment with both ends in the same spot blocks nothing and breaks maths. */
function isDegenerate(w: ParsedWall): boolean {
  return Math.abs(w.x1 - w.x2) < 1e-6 && Math.abs(w.y1 - w.y2) < 1e-6
}

/**
 * Sniff and parse. Throws VTTParseError with something a human can act on,
 * because the usual cause is picking the wrong file out of an export folder.
 */
export function parseVTT(text: string): ParsedVTT {
  let doc: any
  try {
    doc = JSON.parse(text)
  } catch {
    throw new VTTParseError('That file is not JSON. Pick the .dd2vtt / .uvtt file, or the scene .json from a Foundry export.')
  }
  if (!doc || typeof doc !== 'object') throw new VTTParseError('That file does not contain a VTT scene.')

  if (doc.resolution && typeof doc.resolution === 'object') return parseUniversalVTT(doc)
  if (Array.isArray(doc.walls)) return parseFoundryScene(doc)

  throw new VTTParseError(
    'Unrecognised file. Expected a Universal VTT export (.dd2vtt / .uvtt) or a Foundry VTT scene .json.',
  )
}

// ── Universal VTT ─────────────────────────────────────────────────────────────

function parseUniversalVTT(doc: any): ParsedVTT {
  const res = doc.resolution ?? {}
  const ppg = num(res.pixels_per_grid) ?? 0
  const sizeX = num(res.map_size?.x) ?? 0
  const sizeY = num(res.map_size?.y) ?? 0
  if (ppg <= 0 || sizeX <= 0 || sizeY <= 0) {
    throw new VTTParseError('This Universal VTT file is missing its resolution block, so there is no grid to read.')
  }

  // The origin is where the exported region starts within the original scene;
  // coordinates are relative to it.
  const originX = num(res.map_origin?.x) ?? 0
  const originY = num(res.map_origin?.y) ?? 0

  const walls: ParsedWall[] = []

  // Both line-of-sight arrays are polylines: each is a run of points, and each
  // consecutive pair is one blocking segment.
  const addPolylines = (raw: unknown, kind: ParsedWallKind) => {
    if (!Array.isArray(raw)) return
    for (const line of raw) {
      if (!Array.isArray(line)) continue
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], b = line[i + 1]
        const ax = num(a?.x), ay = num(a?.y), bx = num(b?.x), by = num(b?.y)
        if (ax == null || ay == null || bx == null || by == null) continue
        const wall: ParsedWall = {
          x1: pct(ax - originX, sizeX), y1: pct(ay - originY, sizeY),
          x2: pct(bx - originX, sizeX), y2: pct(by - originY, sizeY),
          kind, doorOpen: false,
        }
        if (!isDegenerate(wall)) walls.push(wall)
      }
    }
  }

  addPolylines(doc.line_of_sight, 'wall')
  // Furniture and scenery that also blocks sight. Same treatment — the table
  // does not care whether a sightline died on a wall or a bookcase.
  addPolylines(doc.objects_line_of_sight, 'wall')

  // Portals are doors and windows: a two-point span plus a closed flag.
  if (Array.isArray(doc.portals)) {
    for (const p of doc.portals) {
      const b = p?.bounds
      if (!Array.isArray(b) || b.length < 2) continue
      const ax = num(b[0]?.x), ay = num(b[0]?.y), bx = num(b[1]?.x), by = num(b[1]?.y)
      if (ax == null || ay == null || bx == null || by == null) continue
      const wall: ParsedWall = {
        x1: pct(ax - originX, sizeX), y1: pct(ay - originY, sizeY),
        x2: pct(bx - originX, sizeX), y2: pct(by - originY, sizeY),
        kind: 'door',
        // `closed` absent is treated as closed: a door that silently starts
        // open would show the players a room they have not reached.
        doorOpen: p?.closed === false,
      }
      if (!isDegenerate(wall)) walls.push(wall)
    }
  }

  const image = typeof doc.image === 'string' && doc.image.length > 0 ? doc.image : undefined

  return {
    source: 'uvtt',
    name: typeof doc.name === 'string' ? doc.name : undefined,
    pixelsPerGrid: ppg,
    imageSize: { w: sizeX * ppg, h: sizeY * ppg },
    walls,
    imageBase64: image,
  }
}

// ── Foundry VTT ───────────────────────────────────────────────────────────────

/**
 * Foundry pads the canvas around the background image by a fraction of the
 * scene size, rounded up to whole grid squares, and wall coordinates live in
 * that padded space. Subtracting it puts them back on the image.
 */
export function foundryPadding(width: number, height: number, padding: number, gridSize: number) {
  if (!(padding > 0) || !(gridSize > 0)) return { x: 0, y: 0 }
  return {
    x: Math.ceil((padding * width) / gridSize) * gridSize,
    y: Math.ceil((padding * height) / gridSize) * gridSize,
  }
}

function parseFoundryScene(doc: any): ParsedVTT {
  const width = num(doc.width) ?? 0
  const height = num(doc.height) ?? 0
  // v9 stored a bare number; v10+ nests it under grid.size.
  const gridSize = num(doc.grid?.size) ?? num(doc.grid) ?? 0
  if (width <= 0 || height <= 0) {
    throw new VTTParseError('This Foundry scene has no width/height, so its walls cannot be placed on the image.')
  }
  if (gridSize <= 0) {
    throw new VTTParseError('This Foundry scene has no grid size, so the map cannot be calibrated.')
  }

  const pad = foundryPadding(width, height, num(doc.padding) ?? 0, gridSize)

  const walls: ParsedWall[] = []
  for (const w of doc.walls as any[]) {
    const c = w?.c
    if (!Array.isArray(c) || c.length < 4) continue
    const x1 = num(c[0]), y1 = num(c[1]), x2 = num(c[2]), y2 = num(c[3])
    if (x1 == null || y1 == null || x2 == null || y2 == null) continue

    // `sense` (v9–v11) / `sight` (v12+): 0 means the wall does not block
    // vision — a railing or a window — which is exactly our 'window'.
    const sense = num(w.sight) ?? num(w.sense) ?? 20
    const doorFlag = num(w.door) ?? 0
    const doorState = num(w.ds) ?? 0

    const kind: ParsedWallKind =
      doorFlag > 0 ? 'door'
        : sense === 0 ? 'window'
          : 'wall'

    const wall: ParsedWall = {
      x1: pct(x1 - pad.x, width), y1: pct(y1 - pad.y, height),
      x2: pct(x2 - pad.x, width), y2: pct(y2 - pad.y, height),
      kind,
      // ds: 0 closed, 1 open, 2 locked. Locked is shut.
      doorOpen: kind === 'door' && doorState === 1,
    }
    if (!isDegenerate(wall)) walls.push(wall)
  }

  return {
    source: 'foundry',
    name: typeof doc.name === 'string' ? doc.name : undefined,
    pixelsPerGrid: gridSize,
    imageSize: { w: width, h: height },
    walls,
  }
}

/** Split a Universal VTT's embedded image, which may carry a data: prefix. */
export function decodeEmbeddedImage(base64: string): Buffer {
  const comma = base64.indexOf(',')
  const body = base64.startsWith('data:') && comma >= 0 ? base64.slice(comma + 1) : base64
  return Buffer.from(body, 'base64')
}
