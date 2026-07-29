// World map view. Renders the shared map image with the player's visible POIs
// pinned on top (positioned by percentage, kept a constant screen size in a
// non-transformed overlay). Pan by dragging, zoom with the wheel/buttons;
// clicking a pin opens its linked article.
import { useRef, useState } from 'react'
import type { Bundle, PShape } from './types'

// Percent coords → screen coords, matching the pin maths below.
function screenPoints(shape: PShape, nat: { w: number; h: number }, t: { k: number; x: number; y: number }) {
  try {
    const pts = JSON.parse(shape.points || '[]')
    if (!Array.isArray(pts)) return []
    return pts.map((p: any) => ({
      x: t.x + (p.x / 100 * nat.w) * t.k,
      y: t.y + (p.y / 100 * nat.h) * t.k,
    }))
  } catch {
    return []
  }
}

export default function MapView({ bundle, onOpen }: {
  bundle: Bundle
  onOpen: (id: number) => void
}) {
  const maps = bundle.maps ?? []
  const [mapIdx, setMapIdx] = useState(0)
  const map = maps[mapIdx]

  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const fit = () => {
    const vp = viewportRef.current?.getBoundingClientRect()
    const img = imgRef.current
    if (!vp || !img) return
    const w = img.naturalWidth, h = img.naturalHeight
    const k = Math.min(vp.width / w, vp.height / h) * 0.96
    setNat({ w, h })
    setT({ k, x: (vp.width - w * k) / 2, y: (vp.height - h * k) / 2 })
  }

  const zoomAt = (mx: number, my: number, factor: number) => setT(p => {
    const k = Math.max(0.1, Math.min(6, p.k * factor))
    return { k, x: mx - (mx - p.x) * (k / p.k), y: my - (my - p.y) * (k / p.k) }
  })
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = viewportRef.current!.getBoundingClientRect()
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89)
  }
  const buttonZoom = (factor: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect) zoomAt(rect.width / 2, rect.height / 2, factor)
  }
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture(e.pointerId) }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    drag.current = { x: e.clientX, y: e.clientY }
    setT(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }
  const onUp = () => { drag.current = null }

  if (!map) return <div className="empty-main">No map shared with you.</div>

  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        {maps.length > 1 && (
          <select value={mapIdx} onChange={e => { setMapIdx(Number(e.target.value)); setNat(null) }}>
            {maps.map((m, i) => <option key={m.id} value={i}>{m.name}</option>)}
          </select>
        )}
        <button onClick={() => buttonZoom(1.2)} title="Zoom in">+</button>
        <button onClick={() => buttonZoom(0.83)} title="Zoom out">−</button>
        <button onClick={fit} title="Fit to view">Fit</button>
      </div>

      <div className="map-viewport" ref={viewportRef}
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        <img ref={imgRef} className="map-img" src={map.image} alt={map.name} draggable={false} onLoad={fit}
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transformOrigin: '0 0' }} />
        {nat && (
          <div className="map-overlay">
            {/* Regions paint under the pins. Largest first, so a district drawn
                inside a kingdom stays clickable on top of it. */}
            {(map.shapes ?? []).length > 0 && (
              <svg className="map-shapes" width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {[...(map.shapes ?? [])]
                  .map(s => ({ s, pts: screenPoints(s, nat, t) }))
                  .filter(({ s, pts }) => pts.length >= (s.shape_type === 'ellipse' ? 2 : 3))
                  .sort((a, b) => {
                    const area = (pts: { x: number; y: number }[]) => {
                      const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
                      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
                    }
                    return area(b.pts) - area(a.pts)
                  })
                  .map(({ s, pts }) => {
                    const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
                    const clickable = s.articleId != null
                    const common = {
                      fill: s.fill_color,
                      fillOpacity: s.fill_opacity,
                      stroke: s.stroke_color,
                      strokeWidth: s.stroke_width,
                      strokeDasharray: s.stroke_style === 'dashed' ? '7 5' : undefined,
                      strokeLinejoin: 'round' as const,
                      style: {
                        pointerEvents: (clickable ? 'all' : 'none') as 'all' | 'none',
                        cursor: clickable ? 'pointer' : undefined,
                      },
                      onClick: clickable ? () => onOpen(s.articleId!) : undefined,
                    }
                    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
                    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
                    return (
                      <g key={s.id}>
                        {s.shape_type === 'ellipse'
                          ? <ellipse cx={cx} cy={cy}
                              rx={(Math.max(...xs) - Math.min(...xs)) / 2}
                              ry={(Math.max(...ys) - Math.min(...ys)) / 2}
                              {...common}><title>{s.label}</title></ellipse>
                          : <polygon points={pts.map(p => `${p.x},${p.y}`).join(' ')} {...common}>
                              <title>{s.label}</title>
                            </polygon>}
                        {s.show_label === 1 && s.label && (
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                            pointerEvents="none"
                            style={{
                              fontSize: 13, fontFamily: 'var(--font-ui)', fontWeight: 600,
                              fill: '#fff', paintOrder: 'stroke',
                              stroke: 'rgba(0,0,0,0.75)', strokeWidth: 3, strokeLinejoin: 'round',
                              userSelect: 'none',
                            }}>
                            {s.label}
                          </text>
                        )}
                      </g>
                    )
                  })}
              </svg>
            )}
            {map.pois.map(p => {
              const sx = t.x + (p.x / 100 * nat.w) * t.k
              const sy = t.y + (p.y / 100 * nat.h) * t.k
              const r = Math.max(9, Math.min(18, p.size))
              return (
                <button key={p.id} className="map-poi" style={{ left: sx, top: sy }}
                  onClick={() => p.articleId != null && onOpen(p.articleId)} title={p.label}>
                  <span className="map-dot" style={{ width: r, height: r, background: p.color, opacity: p.opacity }} />
                  <span className="map-poi-label">{p.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
