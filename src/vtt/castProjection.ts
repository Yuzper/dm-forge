// path: src/vtt/castProjection.ts
// Builds the player-safe payload for the table screen.
//
// The rule, same as the publish pipeline in electron/main/ipc/publishCore.ts:
// project, do not filter. Nothing is ever handed a DB row to redact. Each
// field that reaches the players is written out by hand here, so adding a
// column to `maps` cannot leak it onto the table by accident, and anyone
// reviewing what players can see has one short function to read.
import type { GameMap, MapShape, MapShapeLayer, MapWall, POI } from '../types'
import type { CastFog, CastMessage, CastPOI, CastScene, CastShape, MapGrid, TableCalibration, CastViewport } from './protocol'
import { CAST_PROTOCOL_VERSION } from './protocol'
import { isRenderable, paintOrder } from '../utils/mapShapeGeometry'
import { blockingSegments, visibilityPolygon } from './lineOfSight'

/** Parse the JSON in `maps.grid`, tolerating anything malformed. */
export function parseMapGrid(raw: string | null | undefined): MapGrid | null {
  if (!raw) return null
  try {
    const g = JSON.parse(raw)
    if (!g || typeof g !== 'object') return null
    const square = Number(g.square)
    if (!Number.isFinite(square) || square <= 0) return null
    return {
      square,
      offsetX: Number.isFinite(Number(g.offsetX)) ? Number(g.offsetX) : 0,
      offsetY: Number.isFinite(Number(g.offsetY)) ? Number(g.offsetY) : 0,
    }
  } catch {
    return null
  }
}

export function serializeMapGrid(grid: MapGrid): string {
  return JSON.stringify({ square: grid.square, offsetX: grid.offsetX, offsetY: grid.offsetY })
}

/**
 * One POI, reduced to what a player may see. Spelled out field by field for
 * the same reason as the scene: a new column on `pois` must not be able to
 * reach the table because someone spread a row.
 *
 * Everything else is left behind — `content` above all (the DM's notes on the
 * place), plus loot_table and loot_table_id, hub_links, layer_id, map_id,
 * poi_type and created_at.
 */
export function projectPOI(poi: POI, ghost: boolean): CastPOI {
  return {
    id: poi.id,
    label: poi.label,
    x: poi.x,
    y: poi.y,
    color: poi.color,
    ghost,
  }
}

/**
 * Regions the players may see, in paint order (largest first) so a district
 * never buries the kingdom it sits in — the same ordering the DM's canvas uses.
 *
 * The visibility rule mirrors MapShapeLayer: an unfiled shape is always shown,
 * otherwise its layer's own toggle decides, and a shape whose layer has gone
 * missing is treated as hidden rather than orphaned onto the screen. Change it
 * in one place and change it in the other.
 */
export function projectShapes(shapes: MapShape[], layers: MapShapeLayer[]): CastShape[] {
  const layerById = new Map<number, MapShapeLayer>()
  for (const l of layers) layerById.set(l.id, l)

  const visible = shapes.filter(sh => {
    if (sh.layer_id == null) return true
    const layer = layerById.get(sh.layer_id)
    return layer ? layer.visible === 1 : false
  })

  return paintOrder(visible)
    .filter(r => isRenderable(r.shape.shape_type, r.points))
    .map(r => ({
      id: r.shape.id,
      points: r.points.map(pt => ({ x: pt.x, y: pt.y })),
      shapeType: r.shape.shape_type,
      label: r.shape.label,
      showLabel: r.shape.show_label === 1,
      fillColor: r.shape.fill_color,
      fillOpacity: r.shape.fill_opacity,
      strokeColor: r.shape.stroke_color,
      strokeWidth: r.shape.stroke_width,
      strokeStyle: r.shape.stroke_style,
    }))
}

/**
 * Work out what is lit, from the walls and wherever the party is standing.
 *
 * Returns null when there is nothing to compute from — no walls, or nobody
 * placed — because a fog layer with no viewers would black out the whole map,
 * which is never what the DM meant by switching fog on.
 */
export function projectFog(
  walls: MapWall[],
  viewers: { x: number; y: number }[],
): CastFog | null {
  if (walls.length === 0 || viewers.length === 0) return null
  const segments = blockingSegments(walls)
  return { polygons: viewers.map(v => visibilityPolygon(v, segments)) }
}

/**
 * The map as the players may see it: the picture, its size, where its grid
 * squares are, and the points and regions the DM chose to show. Nothing else — no name,
 * no shapes, no notes.
 *
 * `pois` is passed in rather than read here: what counts as visible depends on
 * the layers and visits the DM had enabled on their canvas at the moment they
 * cast, which only the canvas knows.
 */
export function projectScene(
  map: Pick<GameMap, 'id' | 'grid'>,
  imageUrl: string,
  natural: { w: number; h: number },
  pois: CastPOI[] = [],
  shapes: CastShape[] = [],
  fog: CastFog | null = null,
): CastScene {
  return {
    mapId: map.id,
    imageUrl,
    natural: { w: natural.w, h: natural.h },
    grid: parseMapGrid(map.grid),
    pois,
    shapes,
    fog,
  }
}

export function sceneMessage(scene: CastScene | null): CastMessage {
  return { v: CAST_PROTOCOL_VERSION, type: 'scene', scene }
}

export function viewportMessage(viewport: CastViewport): CastMessage {
  return { v: CAST_PROTOCOL_VERSION, type: 'viewport', viewport }
}

export function calibrationMessage(calibration: TableCalibration): CastMessage {
  return { v: CAST_PROTOCOL_VERSION, type: 'calibration', calibration }
}
