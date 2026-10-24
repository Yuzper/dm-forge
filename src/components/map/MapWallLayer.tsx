// path: src/components/map/MapWallLayer.tsx
// Draws a map's sight-blocking walls on the DM's canvas, and lets them be
// fixed. Rendered inside the host's transformed container and sized to the
// fitted image box, so it pans and zooms with the image for free — the same
// arrangement MapShapeLayer uses.
//
// Walls only appear while the wall tool is active. A VTT import brings
// hundreds of segments, and painting them over the art the rest of the time
// would bury the map the DM is actually working on.
//
// Stroke widths divide by zoom so a wall stays the same thickness on screen at
// any magnification, which is what makes endpoint handles stay grabbable.
import type { MapWall } from '../../types'

export const WALL_COLORS: Record<string, string> = {
  wall: '#e05555',
  door: '#5b9fe8',
  window: '#3dbf7f',
}

export interface WallDraft { x1: number; y1: number; x2: number; y2: number }

export default function MapWallLayer({
  walls, box, scale, interactive, selectedId, draft,
  onSelect, onEndpointDown,
}: {
  walls: MapWall[]
  box: { w: number; h: number }
  scale: number
  /** False while another tool owns the canvas: drawn, but inert. */
  interactive: boolean
  selectedId?: number | null
  /** The wall being dragged out right now, not yet saved. */
  draft?: WallDraft | null
  onSelect?: (wall: MapWall, e: React.MouseEvent) => void
  onEndpointDown?: (wall: MapWall, end: 1 | 2, e: React.MouseEvent) => void
}) {
  if (box.w <= 0 || box.h <= 0) return null

  const lx = (x: number) => (x / 100) * box.w
  const ly = (y: number) => (y / 100) * box.h
  const w = (n: number) => n / scale

  return (
    <svg
      width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {walls.map(wall => {
        const selected = wall.id === selectedId
        const colour = WALL_COLORS[wall.kind] ?? WALL_COLORS.wall
        const open = wall.kind === 'door' && wall.door_open === 1
        return (
          <g key={wall.id}>
            {/* A fat invisible line under each wall: a 2px stroke is almost
                impossible to hit with a mouse, especially zoomed out. */}
            {interactive && (
              <line
                x1={lx(wall.x1)} y1={ly(wall.y1)} x2={lx(wall.x2)} y2={ly(wall.y2)}
                stroke="transparent" strokeWidth={w(12)} strokeLinecap="round"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onSelect?.(wall, e) }}
              />
            )}
            <line
              x1={lx(wall.x1)} y1={ly(wall.y1)} x2={lx(wall.x2)} y2={ly(wall.y2)}
              stroke={colour}
              strokeWidth={w(selected ? 4 : 2.5)}
              strokeLinecap="round"
              // An open door is drawn as a dashed ghost: still there, no
              // longer blocking, and obviously different at a glance.
              strokeDasharray={open ? `${w(5)} ${w(4)}` : undefined}
              opacity={open ? 0.45 : 0.9}
              style={{ pointerEvents: 'none' }}
            />
            {selected && interactive && ([1, 2] as const).map(end => (
              <circle
                key={end}
                cx={lx(end === 1 ? wall.x1 : wall.x2)}
                cy={ly(end === 1 ? wall.y1 : wall.y2)}
                r={w(5)}
                fill="#fff" stroke={colour} strokeWidth={w(2)}
                style={{ pointerEvents: 'all', cursor: 'grab' }}
                onMouseDown={e => { e.stopPropagation(); onEndpointDown?.(wall, end, e) }}
              />
            ))}
          </g>
        )
      })}

      {draft && (
        <line
          x1={lx(draft.x1)} y1={ly(draft.y1)} x2={lx(draft.x2)} y2={ly(draft.y2)}
          stroke="#fff" strokeWidth={w(2.5)} strokeLinecap="round"
          strokeDasharray={`${w(6)} ${w(4)}`} opacity={0.85}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  )
}
