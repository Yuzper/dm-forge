// path: src/components/wiki/WikiGraphView.tsx
// Whole-campaign wiki link graph: every article as a node, every [[wikiLink]]
// (and track reference) as an edge. Force-directed layout via d3-force, pan /
// zoom / click via ReactFlow. Clicking a node opens the article.

import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store/store'
// @ts-ignore
import ReactFlow, { Background, BackgroundVariant, Controls, Handle, Position, NodeProps, useNodesState, useEdgesState } from 'reactflow'
// @ts-ignore
import 'reactflow/dist/style.css'
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide } from 'd3-force'
import { ArrowLeft, Network, Search, X, LayoutGrid, Unlink, Sparkles, Plus, Minus, Clock, Target, SlidersHorizontal, RotateCcw } from 'lucide-react'
import type { LinkGraph, ArticleType } from '../../types'
import { ALL_FILTERS } from './wikiConstants'
import { ARTICLE_TYPE_COLORS } from '../../constants/articleTypes'
import { useExcludedTypes, TypeVisibilityMenu } from './TypeVisibilityMenu'
import { useMenuClose } from '../../hooks/useMenuClose'

interface LayoutNode {
  id: number          // article id, or a negative synthetic id for ghosts
  title: string
  articleType: string
  degree: number
  ghost: boolean
  updatedAt?: string  // article's last-edited timestamp (undefined for ghosts)
  x: number
  y: number
}

const nodeRadius = (degree: number) => 7 + Math.min(11, degree * 1.5)
const GHOST_COLOR = '#8a7a5a'   // muted warm gray for broken-link placeholders

// ── Force-layout tuning ──────────────────────────────────────────────────────────
// The d3-force simulation is static (pre-settled with .tick, then .stop), so these
// only shape the initial resting positions — there's no live physics to feel. They're
// exposed as adjustable params so dense or sparse campaigns can be spread out or
// pulled tighter to taste. Persisted per browser; the defaults are the original
// hardcoded values.
interface ForceParams {
  linkDistance: number   // target length of a real edge (ghost edges scale to 0.64×)
  linkStrength: number   // how rigidly edges hold that length (0–1)
  repulsion: number      // node-to-node push, applied as a negative charge
  gravityX: number       // horizontal pull toward center (0 = none)
  gravityY: number       // vertical pull toward center (0 = none)
  collide: number        // extra anti-overlap padding beyond each node's radius
}
const DEFAULT_FORCE: ForceParams = {
  linkDistance: 110, linkStrength: 0.35, repulsion: 260, gravityX: 0.06, gravityY: 0.08, collide: 30,
}
const FORCE_KEY = 'wiki-graph-force-params'
function loadForceParams(): ForceParams {
  try {
    const raw = localStorage.getItem(FORCE_KEY)
    if (raw) return { ...DEFAULT_FORCE, ...JSON.parse(raw) }   // merge so new keys pick up defaults
  } catch { /* malformed — fall through to defaults */ }
  return { ...DEFAULT_FORCE }
}

// ── Recency heat ────────────────────────────────────────────────────────────────
// When the recency lens is on, node color encodes how recently the article was
// edited — freshest = hot amber, stalest = cold slate-blue — so neglected corners
// of the wiki visibly fade. Wide hue+brightness swing (not just a tint) so it
// reads at a glance instead of blending into the rest of the palette.
const RECENCY_FRESH = [255, 149, 43]    // #ff952b — hot amber
const RECENCY_STALE = [58, 66, 92]      // #3a425c — cold slate-blue

// Percentile rank (0 = stalest, 1 = freshest) rather than raw-timestamp min/max —
// campaigns tend to have a burst of recent edits and a long flat tail of old
// articles, which washes a linear scale out to one color. Rank spreads the full
// gradient evenly across whatever nodes are actually visible.
function recencyColor(f: number | null | undefined): string {
  if (f == null) return '#8a8a8a'
  const c = RECENCY_STALE.map((sv, i) => Math.round(sv + (RECENCY_FRESH[i] - sv) * f))
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
}

// ── Custom node ────────────────────────────────────────────────────────────────

interface GraphNodeData {
  title: string
  color: string
  r: number
  degree: number
  ghost: boolean
  dim: boolean
  highlight: boolean
  recency: boolean   // recency lens active — fills solid instead of a faint tint
}

// Invisible centered handles so edges run node-center to node-center.
const hiddenHandle: React.CSSProperties = {
  left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  width: 1, height: 1, minWidth: 0, minHeight: 0,
  opacity: 0, border: 'none', pointerEvents: 'none',
}

// Fixed node width so the circle center sits at a known offset (NODE_W / 2)
// from the ReactFlow position — positions are pre-shifted by that in rfNodes.
export const NODE_W = 120

function WikiGraphNode({ data }: NodeProps<GraphNodeData>) {
  return (
    <div style={{
      width: NODE_W, display: 'flex', flexDirection: 'column', alignItems: 'center',
      opacity: data.dim ? 0.12 : 1, transition: 'opacity 120ms ease',
      cursor: 'pointer', fontFamily: 'var(--font-ui)',
    }}>
      <div style={{
        position: 'relative',
        width: data.r * 2, height: data.r * 2, borderRadius: '50%',
        // Ghosts are hollow with a dashed outline — a "missing article" placeholder.
        // Recency mode fills solid (it's a single hue axis, needs the saturation
        // to read) — type mode stays a faint tint since hue alone distinguishes it.
        background: data.ghost ? 'transparent'
          : data.color + (data.recency ? (data.highlight ? 'ff' : 'd9') : (data.highlight ? '55' : '2e')),
        border: `${data.recency ? 2 : 1.5}px ${data.ghost ? 'dashed' : 'solid'} ${data.color}`,
        boxShadow: data.highlight ? `0 0 10px ${data.color}66` : data.recency ? `0 0 6px ${data.color}40` : 'none',
        transition: 'box-shadow 120ms ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {data.ghost && <Plus size={Math.min(data.r, 10)} color={data.color} strokeWidth={2.5} />}
        <Handle type="target" position={Position.Top} style={hiddenHandle} isConnectable={false} />
        <Handle type="source" position={Position.Top} style={hiddenHandle} isConnectable={false} />
      </div>
      <div style={{
        fontSize: 10, marginTop: 3, lineHeight: 1.25, textAlign: 'center',
        color: data.ghost ? data.color : data.highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontStyle: data.ghost ? 'italic' : 'normal',
        maxWidth: NODE_W, overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
        wordBreak: 'break-word',
      }}>
        {data.title}
      </div>
    </div>
  )
}

const GRAPH_NODE_TYPES = { wikiNode: WikiGraphNode }

type EdgeKind = 'real' | 'ghost' | 'mention'

function edgeStyle(kind: EdgeKind, dim: boolean, hot: boolean): React.CSSProperties {
  const base: React.CSSProperties = { transition: 'opacity 120ms ease' }
  if (kind === 'ghost') return {
    ...base, stroke: hot ? GHOST_COLOR : GHOST_COLOR, strokeWidth: 1,
    strokeDasharray: '4 3', opacity: dim ? 0.05 : hot ? 0.75 : 0.35,
  }
  if (kind === 'mention') return {
    ...base, stroke: '#3fa89b', strokeWidth: 1,
    strokeDasharray: '1 4', strokeLinecap: 'round', opacity: dim ? 0.05 : hot ? 0.85 : 0.4,
  }
  return {
    ...base, stroke: hot ? 'var(--gold)' : 'var(--border-light)',
    strokeWidth: hot ? 1.5 : 1, opacity: dim ? 0.06 : hot ? 0.9 : 0.45,
  }
}

// ── Force-layout panel ───────────────────────────────────────────────────────────
// Toolbar popover with a slider per force param + a reset-to-defaults link. Mirrors
// TypeVisibilityMenu's button/dropdown shape so it sits consistently in the toolbar.

function ForcePanel({ force, setForce }: {
  force: ForceParams
  setForce: (updater: (prev: ForceParams) => ForceParams) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useMenuClose(open, ref, setOpen)

  const keys = Object.keys(DEFAULT_FORCE) as (keyof ForceParams)[]
  const isDefault = keys.every(k => force[k] === DEFAULT_FORCE[k])

  const row = (label: string, key: keyof ForceParams, min: number, max: number, step: number, fmt?: (v: number) => string) => (
    <label key={key} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 40px', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={force[key]}
        onChange={e => { const v = Number(e.target.value); setForce(p => ({ ...p, [key]: v })) }}
        style={{ accentColor: 'var(--gold)', width: '100%', cursor: 'pointer' }} />
      <span style={{ textAlign: 'right', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {fmt ? fmt(force[key]) : force[key]}
      </span>
    </label>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Adjust force-layout parameters"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
          border: `1px solid ${!isDefault ? 'var(--border-gold)' : 'var(--border-light)'}`,
          background: open ? 'var(--bg-elevated)' : 'transparent',
          color: !isDefault ? 'var(--gold)' : 'var(--text-muted)',
          fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
        }}>
        <SlidersHorizontal size={11} /> Layout
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 100,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          width: 258, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Force layout
            </span>
            <button onClick={() => setForce(() => ({ ...DEFAULT_FORCE }))} disabled={isDefault}
              title="Restore default layout parameters"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
                fontSize: 10.5, color: isDefault ? 'var(--text-muted)' : 'var(--gold)',
                cursor: isDefault ? 'default' : 'pointer', opacity: isDefault ? 0.5 : 1,
              }}
              className={isDefault ? '' : 'hover-gold'}>
              <RotateCcw size={11} /> Reset
            </button>
          </div>
          {row('Link length', 'linkDistance', 40, 300, 5)}
          {row('Link pull', 'linkStrength', 0, 1, 0.05, v => v.toFixed(2))}
          {row('Repulsion', 'repulsion', 20, 800, 10)}
          {row('Gravity X', 'gravityX', 0, 0.4, 0.01, v => v.toFixed(2))}
          {row('Gravity Y', 'gravityY', 0, 0.4, 0.01, v => v.toFixed(2))}
          {row('Spacing', 'collide', 0, 80, 2)}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Re-settles the graph as you drag. Shapes resting positions only.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────────

export default function WikiGraphView({ onSwitchToList, onCreateArticle, initialFocusId = null }: {
  onSwitchToList: () => void
  onCreateArticle: (title: string) => void
  initialFocusId?: number | null   // deep-link: focus this article once loaded
}) {
  const { currentCampaign, openArticle, setView, setCampaignSubView, setHintContext } = useStore()
  useEffect(() => { setHintContext('wiki-graph'); return () => setHintContext(null) }, [setHintContext])

  const [graph, setGraph] = useState<LinkGraph | null>(null)
  const [layout, setLayout] = useState<LayoutNode[]>([])   // real article nodes + ghost nodes
  const [links, setLinks] = useState<{ from: number; to: number }[]>([])       // real edges
  const [ghostLinks, setGhostLinks] = useState<{ from: number; to: number }[]>([]) // article → ghost
  const [loaded, setLoaded] = useState(false)
  const [typeFilter, setTypeFilter] = useState<ArticleType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [hoverId, setHoverId] = useState<number | null>(null)
  // Overlays: ghost nodes for broken links (on), unlinked-mention suggestions
  // (off — can be noisy), and an orphan-only focus toggle (transient).
  const [showGhosts, setShowGhosts] = useState(() => localStorage.getItem('wiki-graph-ghosts') !== 'off')
  const [showMentions, setShowMentions] = useState(() => localStorage.getItem('wiki-graph-mentions') === 'on')
  const [orphanOnly, setOrphanOnly] = useState(false)
  const toggleGhosts = () => setShowGhosts(v => { localStorage.setItem('wiki-graph-ghosts', v ? 'off' : 'on'); return !v })
  const toggleMentions = () => setShowMentions(v => { localStorage.setItem('wiki-graph-mentions', v ? 'off' : 'on'); return !v })
  // Recency lens: recolor nodes by last-edited age instead of by article type.
  const [recencyOn, setRecencyOn] = useState(() => localStorage.getItem('wiki-graph-recency') === 'on')
  const toggleRecency = () => setRecencyOn(v => { localStorage.setItem('wiki-graph-recency', v ? 'off' : 'on'); return !v })
  // Adjustable force-layout params (see ForceParams). Persisted so a tuned layout
  // survives reloads; changing any of them re-runs the simulation below.
  const [force, setForce] = useState<ForceParams>(loadForceParams)
  useEffect(() => { localStorage.setItem(FORCE_KEY, JSON.stringify(force)) }, [force])
  // Focus mode: double-click a node to isolate its N-hop neighborhood. Depth is
  // adjustable from the focus pill; Esc or the pill's × clears it.
  const [focusId, setFocusId] = useState<number | null>(null)
  const [focusDepth, setFocusDepth] = useState(1)
  const [rfInstance, setRfInstance] = useState<any>(null)
  // Disambiguate single-click (open article) from double-click (focus): a click
  // schedules the open, a double-click cancels it and focuses instead.
  const clickTimer = useRef<any>(null)
  // Article types removed from the graph entirely (not just dimmed) — dropped
  // before the force layout runs, so it re-settles without them. Shared control;
  // creatures are excluded by default here (usually a bestiary, rarely linked).
  const { excluded: excludedTypes, toggle: toggleTypeExcluded, clear: clearExcludedTypes } = useExcludedTypes(
    'wiki-graph-excluded-types',
    () => localStorage.getItem('wiki-graph-creatures') === 'shown' ? new Set() : new Set(['creature']),
  )
  // A hidden type can't remain the active highlight filter.
  useEffect(() => {
    if (typeFilter !== 'all' && excludedTypes.has(typeFilter)) setTypeFilter('all')
  }, [excludedTypes, typeFilter])

  // Fetch the raw graph once per campaign.
  useEffect(() => {
    if (!currentCampaign) return
    let cancelled = false
    setLoaded(false)
    setGraph(null)
    window.api.getArticleLinkGraph(currentCampaign.id).then((g: LinkGraph) => {
      if (!cancelled) setGraph(g)
    })
    return () => { cancelled = true }
  }, [currentCampaign?.id])

  // Visible article ids (after type exclusion) — mentions are filtered to these.
  const visibleIds = useMemo(
    () => new Set((graph?.nodes ?? []).filter(n => !excludedTypes.has(n.article_type)).map(n => n.id)),
    [graph, excludedTypes],
  )
  const visibleMentions = useMemo(
    () => (graph?.mentions ?? []).filter(e => visibleIds.has(e.from) && visibleIds.has(e.to)),
    [graph, visibleIds],
  )

  // Run the force layout. Re-runs when type exclusion or the ghost toggle change
  // what's laid out. Ghost nodes get negative synthetic ids and are positioned by
  // the same simulation (via ghost edges to their referencing articles).
  useEffect(() => {
    if (!graph) return
    const nodes = graph.nodes.filter(n => !excludedTypes.has(n.article_type))
    const idSet = new Set(nodes.map(n => n.id))
    const edges = graph.edges.filter(e => idSet.has(e.from) && idSet.has(e.to))
    const degree = new Map<number, number>()
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
    }

    // Ghost nodes for broken links whose source article is still visible.
    const gLinks: { from: number; to: number }[] = []
    const ghostSim: any[] = []
    if (showGhosts) {
      let gid = -1
      for (const g of graph.ghosts) {
        const sources = g.sources.filter(id => idSet.has(id))
        if (sources.length === 0) continue
        const id = gid--
        ghostSim.push({ id, title: g.title, articleType: '', degree: 0, ghost: true, updatedAt: undefined })
        for (const s of sources) gLinks.push({ from: s, to: id })
      }
    }

    const simNodes: any[] = [
      ...nodes.map(n => ({ id: n.id, title: n.title, articleType: n.article_type, degree: degree.get(n.id) ?? 0, ghost: false, updatedAt: n.updated_at })),
      ...ghostSim,
    ]
    const simLinks: any[] = [...edges, ...gLinks].map(e => ({ source: e.from, target: e.to }))
    forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d: any) => d.id).distance((l: any) => l.target?.ghost || l.source?.ghost ? force.linkDistance * 0.64 : force.linkDistance).strength(force.linkStrength))
      .force('charge', forceManyBody().strength(-force.repulsion))
      .force('x', forceX(0).strength(force.gravityX))
      .force('y', forceY(0).strength(force.gravityY))
      .force('collide', forceCollide().radius((d: any) => nodeRadius(d.degree) + force.collide))
      .stop()
      .tick(300)
    setLayout(simNodes.map(n => ({ id: n.id, title: n.title, articleType: n.articleType, degree: n.degree, ghost: n.ghost, updatedAt: n.updatedAt, x: n.x, y: n.y })))
    setLinks(edges)
    setGhostLinks(gLinks)
    setLoaded(true)
  }, [graph, excludedTypes, showGhosts, force])

  // Adjacency for hover highlighting — spans real, ghost, and (when shown)
  // mention edges so hovering any node lights everything connected to it.
  const neighbors = useMemo(() => {
    const m = new Map<number, Set<number>>()
    const add = (a: number, b: number) => {
      if (!m.has(a)) m.set(a, new Set())
      if (!m.has(b)) m.set(b, new Set())
      m.get(a)!.add(b); m.get(b)!.add(a)
    }
    for (const e of links) add(e.from, e.to)
    for (const e of ghostLinks) add(e.from, e.to)
    if (showMentions) for (const e of visibleMentions) add(e.from, e.to)
    return m
  }, [links, ghostLinks, showMentions, visibleMentions])

  // Percentile rank (0 = stalest, 1 = freshest) of each article's last edit
  // among the currently visible ones — drives the recency lens.
  const recencyRank = useMemo(() => {
    const entries = layout.filter(n => !n.ghost && n.updatedAt)
      .map(n => ({ id: n.id, t: Date.parse(n.updatedAt!) }))
      .filter(e => !Number.isNaN(e.t))
      .sort((a, b) => a.t - b.t)
    const m = new Map<number, number>()
    entries.forEach((e, i) => m.set(e.id, entries.length > 1 ? i / (entries.length - 1) : 1))
    return m
  }, [layout])

  // Focus neighborhood: BFS out from the focused node over the same adjacency
  // used for hover, capped at focusDepth hops. Empty when nothing is focused.
  const focusSet = useMemo(() => {
    if (focusId == null) return null
    const seen = new Set<number>([focusId])
    let frontier = [focusId]
    for (let d = 0; d < focusDepth; d++) {
      const next: number[] = []
      for (const id of frontier) for (const nb of neighbors.get(id) ?? []) {
        if (!seen.has(nb)) { seen.add(nb); next.push(nb) }
      }
      frontier = next
      if (!frontier.length) break
    }
    return seen
  }, [focusId, focusDepth, neighbors])

  // Deep-link focus (from global search): apply once the layout contains the
  // node. Skipped silently if the article's type is excluded from the graph.
  useEffect(() => {
    if (initialFocusId == null || !loaded) return
    if (layout.some(n => n.id === initialFocusId)) {
      setFocusDepth(1)
      setFocusId(initialFocusId)
    }
  }, [initialFocusId, loaded])

  // Drop focus if its node leaves the layout (e.g. its type gets hidden).
  useEffect(() => {
    if (focusId != null && !layout.some(n => n.id === focusId)) setFocusId(null)
  }, [layout, focusId])

  // Esc clears focus.
  useEffect(() => {
    if (focusId == null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusId])

  // Frame the focus neighborhood when entering focus or changing depth.
  useEffect(() => {
    if (!rfInstance || focusId == null || !focusSet) return
    rfInstance.fitView({ nodes: [...focusSet].map(id => ({ id: String(id) })), padding: 0.3, duration: 450 })
  }, [focusId, focusDepth, rfInstance])

  // ReactFlow owns the node/edge state — rebuilding the arrays from scratch on
  // every hover made it re-measure everything (nodes/edges flashed in and out).
  // Instead the graph is built once per load, and hover/filter changes patch
  // only the entries whose styling actually changed.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    setRfNodes(layout.map(n => ({
      id: String(n.id),
      type: 'wikiNode',
      // Shift so the simulated point is the circle's center, not the box corner.
      position: { x: n.x - NODE_W / 2, y: n.y - nodeRadius(n.degree) },
      data: {
        title: n.title,
        color: n.ghost ? GHOST_COLOR
          : recencyOn ? recencyColor(recencyRank.get(n.id))
          : ARTICLE_TYPE_COLORS[n.articleType] ?? '#8a8a8a',
        r: nodeRadius(n.degree),
        degree: n.degree,
        ghost: n.ghost,
        dim: false,
        highlight: false,
        recency: recencyOn && !n.ghost,
      } satisfies GraphNodeData,
    })))
    const mk = (e: { from: number; to: number }, i: number, kind: EdgeKind) => ({
      id: `${kind[0]}${i}`,
      source: String(e.from),
      target: String(e.to),
      type: 'straight',
      data: { kind, dim: false, hot: false },
      style: edgeStyle(kind, false, false),
    })
    setRfEdges([
      ...links.map((e, i) => mk(e, i, 'real')),
      ...ghostLinks.map((e, i) => mk(e, i, 'ghost')),
      ...(showMentions ? visibleMentions.map((e, i) => mk(e, i, 'mention')) : []),
    ])
  }, [layout, links, ghostLinks, showMentions, visibleMentions, recencyOn, recencyRank])

  useEffect(() => {
    const q = search.toLowerCase()
    const dimById = new Map<number, boolean>()
    for (const n of layout) {
      let dim: boolean
      if (n.ghost) {
        // Ghosts have no type — hide them under any type filter or orphan focus.
        dim = typeFilter !== 'all' || orphanOnly || (!!q && !n.title.toLowerCase().includes(q))
      } else {
        const filteredOut =
          !((typeFilter === 'all' || n.articleType === typeFilter) && (!q || n.title.toLowerCase().includes(q)))
        const orphanDim = orphanOnly && n.degree > 0
        dim = filteredOut || orphanDim
      }
      const hoverDim = hoverId != null && n.id !== hoverId && !(neighbors.get(hoverId)?.has(n.id))
      const focusDim = focusSet != null && !focusSet.has(n.id)
      dimById.set(n.id, dim || hoverDim || focusDim)
    }
    setRfNodes(prev => prev.map((n: any) => {
      const id = Number(n.id)
      const dim = dimById.get(id) ?? false
      const highlight = hoverId === id
      if (n.data.dim === dim && n.data.highlight === highlight) return n
      return { ...n, data: { ...n.data, dim, highlight } }
    }))
    setRfEdges(prev => prev.map((e: any) => {
      const dim = (dimById.get(Number(e.source)) ?? false) || (dimById.get(Number(e.target)) ?? false)
      const hot = hoverId != null && (Number(e.source) === hoverId || Number(e.target) === hoverId)
      if (e.data?.dim === dim && e.data?.hot === hot) return e
      return { ...e, data: { ...e.data, dim, hot }, style: edgeStyle(e.data.kind, dim, hot) }
    }))
  }, [layout, neighbors, typeFilter, search, hoverId, orphanOnly, focusSet, recencyOn, recencyRank])

  const articleNodes = useMemo(() => layout.filter(n => !n.ghost), [layout])
  const linkedCount = useMemo(() => articleNodes.filter(n => n.degree > 0).length, [articleNodes])
  const hiddenCount = useMemo(
    () => graph ? graph.nodes.filter(n => excludedTypes.has(n.article_type)).length : 0,
    [graph, excludedTypes],
  )
  const ghostCount = useMemo(
    () => graph ? graph.ghosts.filter(g => g.sources.some(id => visibleIds.has(id))).length : 0,
    [graph, visibleIds],
  )
  const unlinkedCount = articleNodes.length - linkedCount

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', transition: 'color var(--transition)' }}
              className="hover-text">
              <ArrowLeft size={14} /> Back
            </button>
            <Network size={22} color="var(--gold)" />
            <h1 style={{ fontSize: 22, letterSpacing: '0.05em' }}>Wiki Graph</h1>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {articleNodes.length} article{articleNodes.length !== 1 ? 's' : ''} · {links.length} link{links.length !== 1 ? 's' : ''}
              {unlinkedCount > 0 && (
                <>
                  ·
                  <button
                    onClick={() => setOrphanOnly(v => !v)}
                    title={orphanOnly ? 'Show all articles' : 'Highlight only unconnected articles'}
                    style={{
                      background: orphanOnly ? 'var(--gold-glow)' : 'none', border: 'none', cursor: 'pointer',
                      color: orphanOnly ? 'var(--gold)' : 'var(--text-muted)', fontSize: 12, padding: '1px 6px',
                      borderRadius: 99, textDecoration: 'underline', textUnderlineOffset: 2,
                    }}
                    className={orphanOnly ? '' : 'hover-gold'}>
                    {unlinkedCount} unlinked
                  </button>
                </>
              )}
              {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={onSwitchToList}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', transition: 'all 120ms' }}
              className="hover-gold-border">
              <LayoutGrid size={13} /> List view
            </button>
            <button className="btn btn-primary" onClick={() => onCreateArticle('')}>
              <Plus size={15} /> New Article
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 30, paddingRight: search ? 28 : 10, fontSize: 13, height: 32 }}
              placeholder="Highlight by title…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {ALL_FILTERS.filter(f => !excludedTypes.has(f.value)).map(f => {
              const Icon = f.icon; const active = typeFilter === f.value
              const color = f.value === 'all' ? 'var(--gold)' : f.color
              return (
                <button key={f.value} onClick={() => setTypeFilter(f.value as any)} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
                  border: `1px solid ${active ? color : 'var(--border-light)'}`,
                  background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
                  color: active ? color : 'var(--text-muted)',
                  fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
                }}>
                  <Icon size={10} /> {f.label}
                </button>
              )
            })}
          </div>
          {(ghostCount > 0 || visibleMentions.length > 0 || showMentions) && (
            <>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)', flexShrink: 0 }} />
              {ghostCount > 0 && (
                <button
                  onClick={toggleGhosts}
                  title="Show placeholder nodes for [[links]] pointing at articles that don't exist yet"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
                    border: `1px solid ${showGhosts ? GHOST_COLOR : 'var(--border-light)'}`,
                    background: showGhosts ? `color-mix(in srgb, ${GHOST_COLOR} 14%, transparent)` : 'transparent',
                    color: showGhosts ? GHOST_COLOR : 'var(--text-muted)',
                    fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
                  }}>
                  <Unlink size={11} /> Broken links
                  <span style={{ fontSize: 10, background: 'color-mix(in srgb, ' + GHOST_COLOR + ' 22%, transparent)', borderRadius: 99, padding: '0 6px' }}>{ghostCount}</span>
                </button>
              )}
              {(visibleMentions.length > 0 || showMentions) && (
                <button
                  onClick={toggleMentions}
                  title="Suggest connections: article titles mentioned in prose but not yet linked"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
                    border: `1px solid ${showMentions ? '#3fa89b' : 'var(--border-light)'}`,
                    background: showMentions ? 'color-mix(in srgb, #3fa89b 14%, transparent)' : 'transparent',
                    color: showMentions ? '#3fa89b' : 'var(--text-muted)',
                    fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
                  }}>
                  <Sparkles size={11} /> Suggestions
                  {visibleMentions.length > 0 && <span style={{ fontSize: 10, background: 'color-mix(in srgb, #3fa89b 22%, transparent)', borderRadius: 99, padding: '0 6px' }}>{visibleMentions.length}</span>}
                </button>
              )}
            </>
          )}
          {articleNodes.length > 0 && (
            <>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)', flexShrink: 0 }} />
              <button
                onClick={toggleRecency}
                title="Recency lens: color nodes by last edited — fresh work glows amber, neglected corners turn cold"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99,
                  border: `1px solid ${recencyOn ? '#ff952b' : 'var(--border-light)'}`,
                  background: recencyOn ? 'color-mix(in srgb, #ff952b 14%, transparent)' : 'transparent',
                  color: recencyOn ? '#ff952b' : 'var(--text-muted)',
                  fontSize: 11, cursor: 'pointer', transition: 'all 120ms ease',
                }}>
                <Clock size={11} /> Recency
              </button>
            </>
          )}
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-light)', flexShrink: 0 }} />
          <ForcePanel force={force} setForce={setForce} />
          <TypeVisibilityMenu excluded={excludedTypes} onToggle={toggleTypeExcluded} onClear={clearExcludedTypes} />
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!loaded ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Building graph…
          </div>
        ) : layout.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-muted)' }}>
            <Network size={40} strokeWidth={1} color="var(--border-light)" />
            <div style={{ fontSize: 13 }}>No articles yet — the graph appears as your wiki grows.</div>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={GRAPH_NODE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            onInit={setRfInstance}
            onNodeClick={(_e: any, node: any) => {
              // Defer the open briefly so a double-click (focus) can cancel it.
              if (clickTimer.current) clearTimeout(clickTimer.current)
              const id = Number(node.id)
              const title = node.data.title
              clickTimer.current = setTimeout(() => {
                clickTimer.current = null
                if (id < 0) onCreateArticle(title)   // ghost → create the missing article
                else openArticle(id)
              }, 220)
            }}
            onNodeDoubleClick={(_e: any, node: any) => {
              if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
              const id = Number(node.id)
              setFocusDepth(1)
              setFocusId(prev => (prev === id ? null : id))   // double-click focus node again → clear
            }}
            onNodeMouseEnter={(_e: any, node: any) => setHoverId(Number(node.id))}
            onNodeMouseLeave={() => setHoverId(null)}
            fitView fitViewOptions={{ padding: 0.15 }}
            minZoom={0.08}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--bg-base)' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}

        {loaded && articleNodes.length > 0 && links.length === 0 && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 99, padding: '4px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
            No links yet — connect articles with [[wiki links]] to grow the web
          </div>
        )}

        {/* Focus pill — active when a node's neighborhood is isolated */}
        {loaded && focusId != null && focusSet && (() => {
          const fn = layout.find(n => n.id === focusId)
          const stepBtn: React.CSSProperties = {
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
            borderRadius: '50%', border: '1px solid var(--border-light)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer', padding: 0,
          }
          return (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-gold)', borderRadius: 99, padding: '5px 8px 5px 14px', fontSize: 12, boxShadow: 'var(--shadow-md)' }}>
              <Target size={13} color="var(--gold)" style={{ flexShrink: 0 }} />
              <span style={{ color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Focus: <span style={{ color: 'var(--text-primary)' }}>{fn?.title ?? '—'}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Depth</span>
                <button style={{ ...stepBtn, opacity: focusDepth <= 1 ? 0.4 : 1, cursor: focusDepth <= 1 ? 'default' : 'pointer' }}
                  disabled={focusDepth <= 1} onClick={() => setFocusDepth(d => Math.max(1, d - 1))} className="hover-gold-border">
                  <Minus size={12} />
                </button>
                <span style={{ minWidth: 12, textAlign: 'center', color: 'var(--gold)', fontWeight: 600 }}>{focusDepth}</span>
                <button style={{ ...stepBtn, opacity: focusDepth >= 5 ? 0.4 : 1, cursor: focusDepth >= 5 ? 'default' : 'pointer' }}
                  disabled={focusDepth >= 5} onClick={() => setFocusDepth(d => Math.min(5, d + 1))} className="hover-gold-border">
                  <Plus size={12} />
                </button>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
                {focusSet.size} shown
              </span>
              <button onClick={() => setFocusId(null)} title="Clear focus (Esc)"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                className="hover-text">
                <X size={14} />
              </button>
            </div>
          )
        })()}

        {/* Legend — only for the overlays whose meaning isn't obvious */}
        {loaded && ((showGhosts && ghostCount > 0) || (showMentions && visibleMentions.length > 0) || (recencyOn && recencyRank.size > 0)) && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 5, background: 'color-mix(in srgb, var(--bg-elevated) 92%, transparent)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', pointerEvents: 'none' }}>
            {recencyOn && recencyRank.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ width: 26, height: 8, borderRadius: 99, background: `linear-gradient(90deg, rgb(${RECENCY_STALE.join(',')}), rgb(${RECENCY_FRESH.join(',')}))` }} />
                Recency — stale → freshly edited
              </div>
            )}
            {showGhosts && ghostCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-muted)' }}>
                <svg width="26" height="12"><circle cx="6" cy="6" r="5" fill="none" stroke={GHOST_COLOR} strokeWidth="1.5" strokeDasharray="3 2" /><line x1="12" y1="6" x2="26" y2="6" stroke={GHOST_COLOR} strokeWidth="1" strokeDasharray="4 3" /></svg>
                Broken link — article doesn't exist (click to create)
              </div>
            )}
            {showMentions && visibleMentions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-muted)' }}>
                <svg width="26" height="12"><line x1="0" y1="6" x2="26" y2="6" stroke="#3fa89b" strokeWidth="1.5" strokeDasharray="1 4" strokeLinecap="round" /></svg>
                Mentioned in text but not linked
              </div>
            )}
          </div>
        )}

        {/* Interaction hints — always present so double-click-to-focus stays discoverable */}
        {loaded && articleNodes.length > 0 && (
          <div style={{
            position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 8,
            background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', border: '1px solid var(--border)',
            borderRadius: 99, padding: '5px 12px', fontSize: 10.5, color: 'var(--text-muted)', pointerEvents: 'none',
          }}>
            <span>Click to open</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Double-click to focus</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Hover to trace links</span>
          </div>
        )}
      </div>
    </div>
  )
}
