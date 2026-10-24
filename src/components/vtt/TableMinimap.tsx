// path: src/components/vtt/TableMinimap.tsx
// The DM's view of where the players' camera is pointed, and how they move it.
//
// The whole cast map as a thumbnail, with a bright rectangle showing the part
// of it that is on the table. Click or drag anywhere and the camera centres
// there. The rectangle is not resizable and has no handles on purpose: the
// table draws at a fixed physical scale, so how much map fits is decided by
// the TV and the calibration, never by dragging.
//
// It draws the cast pins and regions rather than the bare image, because
// aiming by landmark ("put the camera on the docks") is the actual task;
// aiming by coastline shape is not. What it shows is exactly what the table
// shows — these are the same projected arrays, not the DM's own map.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CastPOI, CastShape } from '../../vtt/protocol'
import { cameraRect, type Size } from '../../vtt/camera'
import { ellipseAttrs, polygonPointsAttr } from '../../utils/mapShapeGeometry'

export default function TableMinimap({
  imageUrl, natural, scale, screen, pan, pois, shapes, viewers = [], mode = 'camera',
  onCentre, onPlaceViewer,
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
  /** Party positions, percent space, drawn so the DM can see the fog origin. */
  viewers?: { x: number; y: number }[]
  /** 'camera' aims the view; 'party' drops a fog viewpoint instead. */
  mode?: 'camera' | 'party'
  /** Centre the table on this point, in image px. */
  onCentre: (point: { x: number; y: number }) => void
  /** Place a fog viewpoint, in percent space. */
  onPlaceViewer?: (point: { x: number; y: number }) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // Thumbnail size: the panel's width, and never so tall that the controls
  // below it fall off the bottom of a laptop screen.
  const thumbW = 296
  const aspect = natural.w > 0 ? natural.h / natural.w : 0.6
  const thumbH = Math.max(60, Math.min(190, Math.round(thumbW * aspect)))
  const sx = natural.w > 0 ? thumbW / natural.w : 0
  const sy = natural.h > 0 ? thumbH / natural.h : 0

  const rect = cameraRect(natural, scale, screen, pan)

  /** Pointer position on the thumbnail to a point in image px. */
  const pointAt = useCallback((clientX: number, clientY: number) => {
    const el = boxRef.current
    if (!el || sx <= 0 || sy <= 0) return null
    const b = el.getBoundingClientRect()
    return { x: (clientX - b.left) / sx, y: (clientY - b.top) / sy }
  }, [sx, sy])

  // Dragging continues outside the thumbnail, so the camera keeps following
  // past the edge instead of sticking the moment the cursor leaves.
  useEffect(() => {
    // Party mode is a single drop, not a drag: you are marking one spot, and
    // recomputing line of sight on every mouse move would be wasted work.
    if (!dragging || mode === 'party') return
    const move = (e: PointerEvent) => {
      const p = pointAt(e.clientX, e.clientY)
      if (p) onCentre(p)
    }
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, mode, pointAt, onCentre])

  // Clamped for drawing only: the true rect can hang off the edge when the map
  // is smaller than the screen, and a box drawn outside the thumbnail just
  // looks like a bug.
  const rx = Math.max(0, rect.x * sx)
  const ry = Math.max(0, rect.y * sy)
  const rw = Math.min(thumbW - rx, rect.w * sx)
  const rh = Math.min(thumbH - ry, rect.h * sy)
  const coversAll = rw >= thumbW - 1 && rh >= thumbH - 1

  return (
    <div
      ref={boxRef}
      onPointerDown={e => {
        e.preventDefault()
        setDragging(true)
        const p = pointAt(e.clientX, e.clientY)
        if (!p) return
        if (mode === 'party') {
          onPlaceViewer?.({ x: (p.x / natural.w) * 100, y: (p.y / natural.h) * 100 })
        } else {
          onCentre(p)
        }
      }}
      title={mode === 'party'
        ? 'Click where the party is standing'
        : "Click or drag to aim the players' view"}
      style={{
        position: 'relative', width: thumbW, height: thumbH,
        borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        border: '1px solid var(--border)', background: '#0a0908',
        cursor: mode === 'party' ? 'copy' : dragging ? 'grabbing' : 'crosshair',
        userSelect: 'none', touchAction: 'none',
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
        {viewers.map((v, i) => (
          <g key={`viewer-${i}`}>
            <circle cx={(v.x / 100) * thumbW} cy={(v.y / 100) * thumbH} r={6}
              fill="none" stroke="#c8a84b" strokeWidth={1.5} opacity={0.9} />
            <circle cx={(v.x / 100) * thumbW} cy={(v.y / 100) * thumbH} r={2}
              fill="#c8a84b" />
          </g>
        ))}
        {pois.map(p => (
          <circle
            key={p.id}
            cx={(p.x / 100) * thumbW} cy={(p.y / 100) * thumbH} r={3}
            fill={p.color} stroke="rgba(0,0,0,0.7)" strokeWidth={1}
            opacity={p.ghost ? 0.5 : 1}
          />
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
            boxShadow: `inset 0 0 0 9999px rgba(0,0,0,0.5)`,
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
