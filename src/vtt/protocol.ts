// path: src/vtt/protocol.ts
// The wire format between DM-Forge and the table view. Shared by both ends and
// deliberately free of imports from the store, the DB types or electron, so
// that moving the transport from IPC to a WebSocket (for a browser client, or
// for the Raspberry Pi mini tracker) is a change of plumbing only.
//
// Every message carries `v`. The table view refuses anything it does not know
// how to read rather than guessing, because a half-understood scene on the
// players' screen is worse than a blank one.

export const CAST_PROTOCOL_VERSION = 1

/**
 * Where one battle-grid square sits in the map image's own pixels. `square` is
 * the side length; the offsets say where the first gridline falls, so the
 * overlay can land on grid art that does not start flush at the corner.
 */
export interface MapGrid {
  square: number
  offsetX: number
  offsetY: number
}

/**
 * One point of interest as the players may see it: where it is, what it is
 * called, and what colour it is. That is the whole of it.
 *
 * No prose. The table used to carry each point's text so players could open
 * it; that was dropped, and the field went with it rather than being left
 * unread — body text is where the DM's secrets live, and the safest place for
 * it is not on the wire at all.
 */
export interface CastPOI {
  id: number
  label: string
  /** Percent of the fitted image box, exactly as the app stores POI coords. */
  x: number
  y: number
  color: string
  /** Shown dimmed, mirroring a ghosted visit layer on the DM's canvas. */
  ghost: boolean
}

/**
 * One drawing-layer region (a border, a district) as the players may see it.
 *
 * Geometry, colours and — if the DM turned it on — its name. Not its prose:
 * a region's body is DM planning text, and unlike a POI the players were not
 * given a way to ask for it.
 */
export interface CastShape {
  id: number
  /** Percent-space points, already parsed. Ellipses carry two bbox corners. */
  points: { x: number; y: number }[]
  shapeType: 'polygon' | 'ellipse'
  label: string
  showLabel: boolean
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  strokeStyle: 'solid' | 'dashed'
}

/**
 * Fog of war, as the lit regions rather than the walls that produced them.
 *
 * That choice matters. Sending the wall geometry would put the entire dungeon
 * layout on the players' screen for anyone who cared to look at it — every
 * room they have not reached, every corridor, drawn in full. The visibility
 * polygons carry only what is already lit, so the unexplored map is not merely
 * hidden on the table, it was never sent there.
 */
export interface CastFog {
  /** Lit regions in percent space. Empty means the table is fully dark. */
  polygons: { x: number; y: number }[][]
}

/**
 * What the table is showing. This is a projection, not a map row — see
 * castProjection.ts for why every field here is spelled out by hand.
 *
 * Note what is absent: the map's name. Map names are DM shorthand ("Ambush —
 * split party = TPK") and the players are looking straight at this screen.
 */
export interface CastScene {
  mapId: number
  /** Resolved file:// URL of the image. */
  imageUrl: string
  /** Natural pixel size of the image, so the table can lay out before load. */
  natural: { w: number; h: number }
  grid: MapGrid | null
  /**
   * The points to show, already resolved to what was visible on the DM's
   * canvas when the map was cast — the layers and visits they had enabled at
   * that moment, not everything on the map.
   *
   * Empty when the DM has POIs switched off. Empty rather than flagged: with
   * the toggle off the data never crosses to the table at all, so there is
   * nothing on the players' screen to reveal by accident.
   */
  pois: CastPOI[]
  /**
   * Drawing layers (regions, borders) that were switched on when the map was
   * cast. Same snapshot rule and same toggle as `pois`.
   */
  shapes: CastShape[]
  /** null when the DM has fog off; the map is then simply all visible. */
  fog: CastFog | null
}

/** Pan, in CSS pixels, applied to the scaled image on the table. */
export interface CastViewport {
  panX: number
  panY: number
}

/**
 * The physical calibration of the table screen: how many CSS pixels make one
 * real inch on the glass. One inch is one grid square is one 25 mm base.
 */
export interface TableCalibration {
  pxPerInch: number
  /** Drawn over the map so the DM can see where squares land. */
  showGrid: boolean
  gridColor: string
  gridOpacity: number
  /**
   * Font size, in CSS px, of the name above each pin. A real setting rather
   * than a constant because the right value depends on the room: how big the
   * TV is and how far away the furthest player is sitting.
   */
  poiLabelSize: number
}

export type CastMessage =
  | { v: 1; type: 'scene'; scene: CastScene | null }
  | { v: 1; type: 'viewport'; viewport: CastViewport }
  | { v: 1; type: 'calibration'; calibration: TableCalibration }

export type CastMessageType = CastMessage['type']

/** Narrow an untrusted inbound value to a message this build understands. */
export function isCastMessage(x: unknown): x is CastMessage {
  if (!x || typeof x !== 'object') return false
  const m = x as { v?: unknown; type?: unknown }
  if (m.v !== CAST_PROTOCOL_VERSION) return false
  return m.type === 'scene' || m.type === 'viewport' || m.type === 'calibration'
}

export const DEFAULT_CALIBRATION: TableCalibration = {
  // A 55" 1080p TV is about 40 px/inch; this is only a starting point, and the
  // DM is expected to measure. See calibration.ts.
  pxPerInch: 40,
  showGrid: true,
  gridColor: '#ffffff',
  gridOpacity: 0.25,
  poiLabelSize: 13,
}

/** Bounds for the label-size control. The floor is deliberately tiny: on a
 *  dense map a name can be a near-invisible tick that only confirms a pin is
 *  named, rather than something anyone is meant to read. */
export const POI_LABEL_SIZE_MIN = 2
export const POI_LABEL_SIZE_MAX = 36
