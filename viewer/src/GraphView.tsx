// Per-player wiki link graph. Nodes = visible articles; edges = the scrubbed
// link set (derived from the bundle's backlinks — both endpoints are visible by
// construction, so nothing hidden can leak in). Layout via d3-force, rendered
// as a pannable/zoomable SVG. Clicking a node opens that article.
import { useMemo, useRef, useState } from 'react'
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force'
import type { Bundle } from './types'
import { colorForType as colorFor } from './articleTypes'

const W = 1000, H = 700

interface SimNode { id: number; title: string; type: string; x?: number; y?: number }

export default function GraphView({ bundle, selectedId, onOpen }: {
  bundle: Bundle
  selectedId: number | null
  onOpen: (id: number) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const { nodes, edges, degree } = useMemo(() => {
    const nodes: SimNode[] = bundle.articles.map(a => ({ id: a.id, title: a.title, type: a.article_type }))
    const ids = new Set(nodes.map(n => n.id))
    const seen = new Set<string>()
    const edges: { source: number; target: number }[] = []
    for (const [targetStr, linkers] of Object.entries(bundle.backlinks)) {
      const target = Number(targetStr)
      if (!ids.has(target)) continue
      for (const l of linkers) {
        if (!ids.has(l.id) || l.id === target) continue
        const key = Math.min(l.id, target) + '-' + Math.max(l.id, target)
        if (seen.has(key)) continue
        seen.add(key)
        edges.push({ source: l.id, target })
      }
    }
    const degree = new Map<number, number>()
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }
    return { nodes, edges, degree }
  }, [bundle])

  // Run the simulation synchronously, then fit the result into the viewBox.
  const positioned = useMemo(() => {
    if (nodes.length === 0) return { nodes: [] as SimNode[], links: [] as any[] }
    const simNodes = nodes.map(n => ({ ...n }))
    const links = edges.map(e => ({ ...e }))
    const sim = forceSimulation(simNodes as any)
      .force('charge', forceManyBody().strength(-240))
      .force('link', forceLink(links as any).id((d: any) => d.id).distance(70).strength(0.6))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(26))
      .stop()
    const ticks = Math.min(400, Math.max(120, Math.ceil(Math.log(simNodes.length + 1) * 90)))
    for (let i = 0; i < ticks; i++) sim.tick()

    // Fit into a padded viewBox.
    const xs = simNodes.map(n => n.x!), ys = simNodes.map(n => n.y!)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const pad = 60
    const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1
    const scale = Math.min((W - pad * 2) / sx, (H - pad * 2) / sy)
    for (const n of simNodes) {
      n.x = pad + (n.x! - minX) * scale + (W - pad * 2 - sx * scale) / 2
      n.y = pad + (n.y! - minY) * scale + (H - pad * 2 - sy * scale) / 2
    }
    const byId = new Map(simNodes.map(n => [n.id, n]))
    return { nodes: simNodes, links: links.map((l: any) => ({ s: byId.get(l.source.id ?? l.source), t: byId.get(l.target.id ?? l.target) })) }
  }, [nodes, edges])

  const zoom = (factor: number) => setT(prev => {
    const k = Math.max(0.3, Math.min(4, prev.k * factor))
    // Keep the viewBox centre fixed while zooming.
    const cx = W / 2, cy = H / 2
    return { k, x: cx - (cx - prev.x) * (k / prev.k), y: cy - (cy - prev.y) * (k / prev.k) }
  })

  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 0.89) }
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId) }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const rect = svgRef.current?.getBoundingClientRect()
    const scale = rect ? W / rect.width : 1
    const dx = (e.clientX - drag.current.x) * scale, dy = (e.clientY - drag.current.y) * scale
    drag.current = { x: e.clientX, y: e.clientY }
    setT(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }
  const onUp = () => { drag.current = null }

  if (nodes.length === 0) return <div className="empty-main">No pages to graph.</div>

  return (
    <div className="graph-wrap">
      <div className="graph-toolbar">
        <button onClick={() => zoom(1.2)} title="Zoom in">+</button>
        <button onClick={() => zoom(0.83)} title="Zoom out">−</button>
        <button onClick={() => setT({ k: 1, x: 0, y: 0 })} title="Reset view">Reset</button>
      </div>
      <svg ref={svgRef} className="graph-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {positioned.links.map((l, i) => l.s && l.t && (
            <line key={i} x1={l.s.x} y1={l.s.y} x2={l.t.x} y2={l.t.y} stroke="var(--border-light)" strokeWidth={1} />
          ))}
          {positioned.nodes.map(n => {
            const r = 6 + Math.min(9, degree.get(n.id) ?? 0)
            const sel = n.id === selectedId
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`} style={{ cursor: 'pointer' }}
                onClick={() => onOpen(n.id)}>
                <circle r={r} fill={colorFor(n.type)} stroke={sel ? '#e8dcc8' : 'rgba(0,0,0,0.5)'} strokeWidth={sel ? 2.5 : 1} />
                <text x={0} y={r + 12} textAnchor="middle" fontSize={11} fill={sel ? '#e8dcc8' : '#a09070'} style={{ pointerEvents: 'none', fontFamily: 'var(--font-ui)' }}>
                  {n.title}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
