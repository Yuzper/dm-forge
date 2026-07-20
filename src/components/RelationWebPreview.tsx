// path: src/components/RelationWebPreview.tsx
// Read-only SVG minimap of a relation web, embedded inside an article.
// Clicking the canvas opens the web in the Relations view.

import { useState, useEffect, useRef } from 'react'
import { Network, ExternalLink } from 'lucide-react'

interface WebNode { id: number; label: string; pos_x: number; pos_y: number; article_id: number | null }
interface WebEdge { id: number; from_node_id: number; to_node_id: number }

const PREVIEW_H = 200
const NODE_R     = 14   // node circle radius
const PADDING    = 24

function scaleNodes(nodes: WebNode[], w: number, h: number) {
  if (nodes.length === 0) return { scaled: [], sx: 1, sy: 1, ox: 0, oy: 0 }
  const xs = nodes.map(n => n.pos_x)
  const ys = nodes.map(n => n.pos_y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const sx = (w - PADDING * 2) / rangeX
  const sy = (h - PADDING * 2) / rangeY
  const s  = Math.min(sx, sy, 1.2)   // don't over-magnify sparse webs
  const ox = PADDING + ((w - PADDING * 2) - rangeX * s) / 2 - minX * s
  const oy = PADDING + ((h - PADDING * 2) - rangeY * s) / 2 - minY * s
  return {
    scaled: nodes.map(n => ({ ...n, sx: n.pos_x * s + ox, sy: n.pos_y * s + oy })),
    sx: s, sy: s, ox, oy,
  }
}

export function RelationWebPreview({ webId, webName, onOpen }: {
  webId: number
  webName: string
  onOpen: () => void
}) {
  const [nodes, setNodes] = useState<WebNode[]>([])
  const [edges, setEdges] = useState<WebEdge[]>([])
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(containerRef.current)
    setWidth(containerRef.current.offsetWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    ;(window as any).api.getRelationWebData(webId).then(({ nodes: ns, edges: es }: any) => {
      setNodes(ns || [])
      setEdges(es || [])
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [webId])

  const { scaled } = scaleNodes(nodes, width, PREVIEW_H)
  const byId = Object.fromEntries(scaled.map(n => [n.id, n]))

  return (
    <div ref={containerRef}
      onClick={onOpen}
      title={`Open "${webName}" in Relations`}
      style={{
        position: 'relative', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', overflow: 'hidden',
        cursor: 'pointer', background: 'var(--bg-elevated)',
        height: PREVIEW_H,
        transition: 'border-color 120ms ease',
        '--hover-accent': '#7F77DD88',
      } as React.CSSProperties}
      className="hover-border-accent"
    >
      {/* Label */}
      <div style={{
        position: 'absolute', top: 8, left: 10, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        pointerEvents: 'none',
      }}>
        <Network size={11} color="#7F77DD" />
        {webName}
      </div>

      {/* Open hint */}
      <div style={{
        position: 'absolute', bottom: 8, right: 10, zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        pointerEvents: 'none',
      }}>
        <ExternalLink size={10} /> Open
      </div>

      {/* SVG canvas */}
      {loaded && (
        <svg width={width} height={PREVIEW_H} style={{ display: 'block' }}>
          {/* Edges */}
          {edges.map(e => {
            const a = byId[e.from_node_id]
            const b = byId[e.to_node_id]
            if (!a || !b) return null
            return (
              <line key={e.id}
                x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy}
                stroke="var(--border)" strokeWidth={1.5}
              />
            )
          })}
          {/* Nodes */}
          {scaled.map(n => {
            const label = n.label.length > 10 ? n.label.slice(0, 10) + '…' : n.label
            const fill = n.article_id ? '#7F77DD22' : 'var(--bg-surface)'
            const stroke = n.article_id ? '#7F77DD88' : 'var(--border-light)'
            return (
              <g key={n.id}>
                <circle cx={n.sx} cy={n.sy} r={NODE_R} fill={fill} stroke={stroke} strokeWidth={1} />
                <text
                  x={n.sx} y={n.sy + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-secondary)"
                  fontFamily="var(--font-ui)"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {label}
                </text>
              </g>
            )
          })}
          {/* Empty state */}
          {nodes.length === 0 && (
            <text x={width / 2} y={PREVIEW_H / 2 + 4} textAnchor="middle"
              fontSize={12} fill="var(--text-muted)" fontFamily="var(--font-ui)">
              Empty web
            </text>
          )}
        </svg>
      )}
    </div>
  )
}
