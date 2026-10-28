// path: src/components/vtt/TableMinimap.tsx
// The DM's working surface for whatever is on the table.
//
// It began as a thumbnail you clicked to aim the camera, with the party and
// the doors as separate controls underneath — a numbered list of doors beside
// a picture of the doors, which meant reading "door 3" and then hunting for it
// on the map. Everything acts on the picture now.
//
//   · drag open map   aim the players' view
//   · drag the party  move where fog is worked out from
//   · click a door    open or shut it, live
//   · click a pin     centre the players' view on it
//   · right-click a party marker removes it
//
// One gesture, one meaning, decided by what is under the cursor when it goes
// down — doors first, since they are the smallest target and the one you are
// most likely to be aiming at deliberately. The camera is last, because it is
// the whole background and would otherwise swallow everything.
//
// The camera rectangle has no resize handles, and never will: the table draws
// at a fixed physical scale, so how much map fits is decided by the TV and the
// calibration, never by dragging.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CastPOI, CastShape } from '../../vtt/protocol'
import type { MapWall } from '../../types'
import { cameraRect, type Size } from '../../vtt/camera'
import { ellipseAttrs, polygonPointsAttr } from '../../utils/mapShapeGeometry'

/** Grab radius in thumbnail px, per target kind. Smallest target, first look. */
const HIT_DOOR = 9
const HIT_VIEWER = 10
const HIT_POI = 7

type Drag =
  | { kind: 'camera' }
  | { kind: 'viewer'; index: number }

export default function TableMinimap({
  imageUrl, natural, scale, screen, pan, pois, shapes,
  walls = [], viewers = [], showWalls = false, width, maxHeight = 460,
  onCentre, onMoveViewer, onRemoveViewer, onToggleDoor,
}: {
  imageUrl: string
  natural: Size
  /** Table px per image px. */
  scale: number
  /** The table window's own size, in table px. */
  screen: Size
  pan: { panX: number; panY: number }
  pois: CastPOI[]
  shapes: CastShape[]
  /** Sight-blocking geometry. Drawn faintly so rooms are legible. */
  walls?: MapWall[]
  /** Party positions, percent space. */
  viewers?: { x: number; y: number }[]
  /** Only worth drawing walls when fog is actually on. */
  showWalls?: boolean
  /** Set by the panel, which is resizable. */
  width: number
  maxHeight?: number
  /** Centre the table on this point, in image px. */
  onCentre: (point: { x: number; y: number }) => void
  onMoveViewer?: (index: number, point: { x: number; y: number }) => void
  onRemoveViewer?: (index: number) => void
  onToggleDoor?: (wallId: number) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<'door' | 'viewer' | 'poi' | null>(null)

  const aspect = natural.w > 0 ? natural.h / natural.w : 0.6
  const thumbW = Math.max(120, Math.round(width))
  const thumbH = Math.max(70, Math.min(maxHeight, Math.round(thumbW * aspect)))
  const sx = natural.w > 0 ? thumbW / natural.w : 0
  const sy = natural.h > 0 ? thumbH / natural.h : 0

  const px = (x: number) => (x / 100) * thumbW
  const py = (y: number) => (y / 100) * thumbH

  const rect = cameraRect(natural, scale, screen, pan)
  const doors = walls.filter(w => w.kind === 'door')

  /** Pointer position in thumbnail px. */
  const localAt = useCallback((clientX: number, clientY: number) => {
    const el = boxRef.current
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: clientX - b.left, y: clientY - b.top }
  }, [])

  const toImage = useCallback((local: { x: number; y: number }) =>
    (sx > 0 && sy > 0 ? { x: local.x / sx, y: local.y / sy } : null), [sx, sy])

  const toPercent = (local: { x: number; y: number }) => ({
    x: (local.x / thumbW) * 100,
    y: (local.y / thumbH) * 100,
  })

  /** What is under this point, in priority order. */
  const hitTest = useCallback((local: { x: number; y: number }) => {
    for (const d of doors) {
      const mx = px((d.x1 + d.x2) / 2)
      const my = py((d.y1 + d.y2) / 2)
      if (Math.hypot(mx - local.x, my - local.y) <= HIT_DOOR) return { kind: 'door' as const, id: d.id }
    }
    for (let i = 0; i < viewers.length; i++) {
      if (Math.hypot(px(viewers[i].x) - local.x, py(viewers[i].y) - local.y) <= HIT_VIEWER) {
        return { kind: 'viewer' as const, index: i }
      }
    }
    for (const p of pois) {
      if (Math.hypot(px(p.x) - local.x, py(p.y) - local.y) <= HIT_POI) {
        return { kind: 'poi' as const, poi: p }
      }
    }
    return { kind: 'camera' as const }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doors, viewers, pois, thumbW, thumbH])

  // Drags continue outside the thumbnail, so the camera (or the party) keeps
  // following instead of sticking the moment the cursor leaves the box.
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const local = localAt(e.clientX, e.clientY)
      if (!local) return
      if (drag.kind === 'camera') {
        const img = toImage(local)
        if (img) onCentre(img)
      } else {
        onMoveViewer?.(drag.index, toPercent(local))
      }
    }
    const up = () => setDrag(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, localAt, toImage, onCentre, onMoveViewer, thumbW, thumbH])

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const local = localAt(e.clientX, e.clientY)
    if (!local) return
    const hit = hitTest(local)
    if (hit.kind === 'door') { onToggleDoor?.(hit.id); return }
    if (hit.kind === 'viewer') { setDrag({ kind: 'viewer', index: hit.index }); return }
    if (hit.kind === 'poi') {
      const img = toImage({ x: px(hit.poi.x), y: py(hit.poi.y) })
      if (img) onCentre(img)
      return
    }
    setDrag({ kind: 'camera' })
    const img = toImage(local)
    if (img) onCentre(img)
  }

  const handleContext = (e: React.MouseEvent) => {
    const local = localAt(e.clientX, e.clientY)
    if (!local) return
    const hit = hitTest(local)
    // Right-click only means something on a party marker; anywhere else the
    // native menu is more useful than a no-op.
    if (hit.kind === 'viewer') {
      e.preventDefault()
      onRemoveViewer?.(hit.index)
    }
  }

  const handleHover = (e: React.PointerEvent) => {
    if (drag) return
    const local = localAt(e.clientX, e.clientY)
    if (!local) { setHover(null); return }
    const hit = hitTest(local)
    setHover(hit.kind === 'camera' ? null : hit.kind)
  }

  // Clamped for drawing only: the true rect can hang off the edge when the map
  // is smaller than the screen, and a box drawn outside the thumbnail looks
  // like a bug rather than information.
  const rx = Math.max(0, rect.x * sx)
  const ry = Math.max(0, rect.y * sy)
  const rw = Math.min(thumbW - rx, rect.w * sx)
  const rh = Math.min(thumbH - ry, rect.h * sy)
  const coversAll = rw >= thumbW - 1 && rh >= thumbH - 1

  const cursor = drag?.kind === 'viewer' ? 'grabbing'
    : drag ? 'grabbing'
      : hover === 'door' ? 'pointer'
        : hover === 'viewer' ? 'grab'
          : hover === 'poi' ? 'pointer'
            : 'crosshair'

  return (
    <div
      ref={boxRef}
      onPointerDown={handleDown}
      onPointerMove={handleHover}
      onPointerLeave={() => setHover(null)}
      onContextMenu={handleContext}
      title="Drag to aim · drag the party · click a door or a pin"
      style={{
        position: 'relative', width: thumbW, height: thumbH,
        borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        border: '1px solid var(--border)', background: '#0a0908',
        cursor, userSelect: 'none', touchAction: 'none', flexShrink: 0,
      }}
    >
      <img
        src={imageUrl} alt="" draggable={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', opacity: 0.85 }}
      />

      <svg
        width={thumbW} height={thumbH} viewBox={`0 0 ${thumbW} ${thumbH}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {shapes.map(sh => (
          sh.shapeType === 'ellipse'
            ? (() => {
                const e = ellipseAttrs(sh.points, { w: thumbW, h: thumbH })
                return e ? (
                  <ellipse key={sh.id} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry}
                    fill={sh.fillColor} fillOpacity={sh.fillOpacity}
                    stroke={sh.strokeColor} strokeWidth={1} />
                ) : null
              })()
            : (
              <polygon key={sh.id} points={polygonPointsAttr(sh.points, { w: thumbW, h: thumbH })}
                fill={sh.fillColor} fillOpacity={sh.fillOpacity}
                stroke={sh.strokeColor} strokeWidth={1} />
            )
        ))}

        {/* Walls, faint. Not decoration: without them you cannot tell which
            room you are dropping the party into on a dungeon map. */}
        {showWalls && walls.filter(w => w.kind !== 'door').map(w => (
          <line
            key={w.id}
            x1={px(w.x1)} y1={py(w.y1)} x2={px(w.x2)} y2={py(w.y2)}
            stroke="#e05555" strokeWidth={0.7} opacity={0.35}
          />
        ))}

        {/* Doors, drawn big enough to aim at and coloured by state. */}
        {doors.map(d => (
          <g key={d.id}>
            <line
              x1={px(d.x1)} y1={py(d.y1)} x2={px(d.x2)} y2={py(d.y2)}
              stroke={d.door_open ? '#c8a84b' : '#5b9fe8'}
              strokeWidth={2.5} strokeLinecap="round"
              strokeDasharray={d.door_open ? '3 3' : undefined}
            />
            <circle
              cx={px((d.x1 + d.x2) / 2)} cy={py((d.y1 + d.y2) / 2)} r={3.2}
              fill={d.door_open ? '#c8a84b' : '#5b9fe8'}
              stroke="rgba(0,0,0,0.65)" strokeWidth={1}
            />
          </g>
        ))}

        {pois.map(p => (
          <circle
            key={p.id}
            cx={px(p.x)} cy={py(p.y)} r={3}
            fill={p.color} stroke="rgba(0,0,0,0.7)" strokeWidth={1}
            opacity={p.ghost ? 0.5 : 1}
          />
        ))}

        {/* The party last, so it is never buried by a pin or a door. */}
        {viewers.map((v, i) => (
          <g key={`viewer-${i}`}>
            <circle cx={px(v.x)} cy={py(v.y)} r={7}
              fill="rgba(200,168,75,0.18)" stroke="#c8a84b" strokeWidth={1.5} />
            <circle cx={px(v.x)} cy={py(v.y)} r={2.2} fill="#c8a84b" />
          </g>
        ))}
      </svg>

      {/* The camera. Hidden when it covers the whole map — a border tracing the
          thumbnail's own edge says nothing and only adds noise. */}
      {!coversAll && rw > 0 && rh > 0 && (
        <>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            // Everything outside the camera dims, which reads faster than a
            // bright outline on a busy map.
            boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.5)',
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${rx}px ${ry}px, ${rx}px ${ry + rh}px,
              ${rx + rw}px ${ry + rh}px, ${rx + rw}px ${ry}px, ${rx}px ${ry}px)`,
          }} />
          <div style={{
            position: 'absolute', left: rx, top: ry, width: rw, height: rh,
            border: '1.5px solid var(--gold)', borderRadius: 2,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.6)', pointerEvents: 'none',
          }} />
        </>
      )}
    </div>
  )
}
