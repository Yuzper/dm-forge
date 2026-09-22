// path: src/components/relations/RelationsCanvasView.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useStore } from '../../store/store'
// @ts-ignore
import ReactFlow, {
  Background, BackgroundVariant, Controls,
  useNodesState, useEdgesState,
  Connection, Edge as RFEdge, Node as RFNode,
  OnConnect, OnNodesDelete, OnEdgesDelete,
  addEdge, ConnectionMode, SelectionMode,
} from 'reactflow'
// @ts-ignore
import 'reactflow/dist/style.css'
import {
  Network, Plus, ArrowLeft, Pencil, Check, X, ExternalLink, Filter, GitMerge, LayoutGrid,
  Users, Layers, Unlink, Link2, Palette, Hand, MousePointer2, Frame as FrameIcon, Waypoints,
} from 'lucide-react'
import {
  type Rank, type ColorByConfig, TEMPLATE_CONFIG, type RelationWeb, type DBRelationNode, type DBRelationEdge,
  type NodeStyle, type NodeRenderCtx, type BridgeRef, type OpenBridge, type NodeData,
  parentRoleFromUnionLabel, findFreePosition, RANK_PALETTE,
  parseNodeStyle, serializeNodeStyle, nodeFootprint, DEFAULT_NODE_STYLE,
  isGhostId, ghostNodeToRF, ghostEdgeToRF, bridgeTetherEdge,
  dbNodeToRF, dbEdgeToRF, NODE_TYPES, EDGE_TYPES,
} from './relationsShared'
import { parseFrame, serializeFrame, FramePicker } from './relationsFrames'
import { TrackFilterPanel, RankPanel, ColorByPanel, LinkedArticlePill, NodeStylePanel } from './relationsPanels'
import { trackValues } from '../wiki/wikiConstants'
import { SECTION_ACCENTS } from '../../constants/sections'
import {
  AddNodeModal, EdgeLabelModal, EditEdgeModal,
  CreateArticleModal, LinkArticleModal, EditUnionModal,
} from './relationsModals'
import { useContextMenu, useMenuCtx } from '../../hooks/useContextMenu'
import { buildArticleMenu, truncate } from '../../utils/contextMenus'

// Where to drop a ghosted branch: keep the other web's own arrangement intact
// and slide the whole thing to the right of the bridged node, far enough out
// that it doesn't land on top of the real tree.
function ghostBranchOffset(
  host: DBRelationNode,
  anchor: DBRelationNode,
  branchNodes: DBRelationNode[],
  realNodes: DBRelationNode[],
): { dx: number; dy: number } {
  const CLEAR_X = 190, CLEAR_Y = 120
  const dy = host.pos_y - anchor.pos_y
  for (let gap = 300; gap <= 2400; gap += 80) {
    const dx = host.pos_x + gap - anchor.pos_x
    const clash = branchNodes.some(g => realNodes.some(r =>
      Math.abs(g.pos_x + dx - r.pos_x) < CLEAR_X && Math.abs(g.pos_y + dy - r.pos_y) < CLEAR_Y))
    if (!clash) return { dx, dy }
  }
  return { dx: host.pos_x + 2400 - anchor.pos_x, dy }
}

// ── Canvas View ────────────────────────────────────────────────────────────────

export default function RelationsCanvasView({ web, onBack, focusArticleId, onOpenWeb }: {
  web: RelationWeb
  onBack: () => void
  focusArticleId?: number | null
  // Jump to another web (a ghosted branch's home), optionally centred on an article.
  onOpenWeb?: (webId: number, focusArticleId: number | null) => void
}) {
  const { currentCampaign, navigateToArticleByTitle } = useStore()
  const showMenu = useContextMenu()
  const menuCtx = useMenuCtx()
  // ReactFlow instance (captured on init) — used to pan/zoom to a deep-linked node.
  const rfRef = useRef<any>(null)
  const didFocusRef = useRef(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [dbNodes, setDbNodes] = useState<DBRelationNode[]>([])
  const [dbEdges, setDbEdges] = useState<DBRelationEdge[]>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  // Marquee mode: left-drag draws a selection box instead of panning.
  const [selectMode, setSelectMode] = useState(false)
  const [showAddNode, setShowAddNode] = useState(false)
  const [addNodeTypeFilter, setAddNodeTypeFilter] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null)
  const [pendingConnectionMode, setPendingConnectionMode] = useState<'standard' | 'person_to_union'>('standard')
  const [editingEdge, setEditingEdge] = useState<DBRelationEdge | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creatingArticleFor, setCreatingArticleFor] = useState<DBRelationNode | null>(null)
  const [linkingArticleFor, setLinkingArticleFor] = useState<DBRelationNode | null>(null)
  const [editingUnion, setEditingUnion] = useState<DBRelationNode | null>(null)
  const [webName, setWebName] = useState(web.name)
  const [editingName, setEditingName] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // ── Track filters ─────────────────────────────────────────────────────────
  // { [articleType]: string[] } — keys to display in nodes of that type
  const trackFiltersKey = `relations_track_filters_${web.id}`
  const [trackFilters, setTrackFilters] = useState<Record<string, string[]>>(() => {
    try {
        const saved = localStorage.getItem(trackFiltersKey)
        return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  useEffect(() => {
    try {
        localStorage.setItem(trackFiltersKey, JSON.stringify(trackFilters))
    } catch {}
  }, [trackFilters, trackFiltersKey])

  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // ── Color by track ──────────────────────────────────────────────────────────
  // One chosen track colors every node by its value; per-web persistence.
  const colorByKey = `relations_color_by_${web.id}`
  const [colorBy, setColorBy] = useState<{ track: string | null; colors: Record<string, string> }>(() => {
    try {
      const saved = localStorage.getItem(colorByKey)
      return saved ? JSON.parse(saved) : { track: null, colors: {} }
    } catch { return { track: null, colors: {} } }
  })

  useEffect(() => {
    try { localStorage.setItem(colorByKey, JSON.stringify(colorBy)) } catch {}
  }, [colorBy, colorByKey])

  const [showColorPanel, setShowColorPanel] = useState(false)

  // ── Linked article (one-to-one web↔article) ─────────────────────────────────
  const [linkedArticle, setLinkedArticle] = useState<{ id: number; title: string; article_type: string } | null>(null)

  const reloadLinkedArticle = useCallback(async () => {
    const art = await (window as any).api.getRelationWebArticles(web.id)
    setLinkedArticle(art ?? null)
  }, [web.id])

  useEffect(() => { reloadLinkedArticle() }, [web.id])

  // ── Ranks (hierarchy webs) ──────────────────────────────────────────────────
  const [ranks, setRanks] = useState<Rank[]>(() => {
    try { return JSON.parse(web.ranks || '[]') } catch { return [] }
  })
  const ranksById = useMemo(() => Object.fromEntries(ranks.map(r => [r.id, r])) as Record<string, Rank>, [ranks])
  const [showRankPanel, setShowRankPanel] = useState(false)

  const saveRanks = useCallback(async (next: Rank[]) => {
    setRanks(next)
    try { await (window as any).api.updateRelationWeb(web.id, { ranks: JSON.stringify(next) }) } catch {}
  }, [web.id])

  // ── Node style (compact rows vs framed portrait cards) ──────────────────────
  const [nodeStyle, setNodeStyle] = useState<NodeStyle>(() => parseNodeStyle(web.node_style))
  const [showStylePanel, setShowStylePanel] = useState(false)

  const saveNodeStyle = useCallback(async (next: NodeStyle) => {
    setNodeStyle(next)
    try { await (window as any).api.updateRelationWeb(web.id, { node_style: serializeNodeStyle(next) }) } catch {}
  }, [web.id])

  // ── Cross-web bridges ───────────────────────────────────────────────────────
  // People who also appear in another web (married in, seconded to another
  // order…). Derived from the shared article, so there's nothing to wire up.
  const [bridges, setBridges] = useState<Record<number, BridgeRef[]>>({})
  const [openBridge, setOpenBridge] = useState<OpenBridge | null>(null)
  const [ghostNodes, setGhostNodes] = useState<RFNode[]>([])
  const [ghostEdges, setGhostEdges] = useState<RFEdge[]>([])

  // Where each ghosted branch sits, keyed by "<hostNodeId>:<targetWebId>". Seeded
  // by auto-placement, then overwritten as the DM drags the branch about, so it
  // stays put across depth changes and re-expansions for the rest of the session.
  const ghostOffsetsRef = useRef<Record<string, { dx: number; dy: number }>>({})
  const openBridgeRef = useRef<OpenBridge | null>(null)
  openBridgeRef.current = openBridge
  // Set while a ghost is actually being dragged, so releasing the drag doesn't
  // also fire the click that navigates to the other web.
  const ghostDraggedRef = useRef(false)

  const reloadBridges = useCallback(async () => {
    try {
      const rows: any[] = await (window as any).api.getRelationBridges(web.id)
      const byNode: Record<number, BridgeRef[]> = {}
      for (const r of rows) {
        (byNode[r.node_id] ||= []).push({
          web_id: r.web_id, web_name: r.web_name, web_template: r.web_template, target_node_id: r.target_node_id,
        })
      }
      setBridges(byNode)
    } catch { setBridges({}) }
  }, [web.id])

  // Derive which article types are actually present in this web
  const articleTypesInWeb = Array.from(
    new Set(dbNodes.map(n => n.article_type).filter(Boolean) as string[])
  )

  // Track keys usable for coloring — any key holding a plain value on some node.
  // A key is flagged `multi` when some node holds several entries for it (Allies,
  // Domains…): a node can only take one colour, so those are offered but disabled
  // rather than silently colouring by an arbitrary entry.
  const availableColorTracks = useMemo(() => {
    const hasMulti = new Map<string, boolean>()
    for (const n of dbNodes) {
      if (!n.tracks) continue
      try {
        for (const [k, v] of Object.entries(JSON.parse(n.tracks))) {
          // Date pickers ({...} payloads) and milestones are never colourable.
          if (typeof v !== 'string' || v.startsWith('{')) continue
          if (k.endsWith('_Date') || k === 'Timeline_Milestones') continue
          const vals = trackValues(v)
          if (vals.length === 0) continue
          hasMulti.set(k, (hasMulti.get(k) ?? false) || vals.length > 1)
        }
      } catch {}
    }
    return Array.from(hasMulti.entries())
      .map(([key, multi]) => ({ key, multi }))
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [dbNodes])

  // A track saved earlier can become multi-entry later — treat it as unselected
  // so the canvas never colours from a track the picker now disables.
  const selectedIsMulti = colorBy.track
    ? availableColorTracks.find(t => t.key === colorBy.track)?.multi ?? false
    : false

  // Distinct values (with node counts) of the chosen track in this web.
  const colorTrackValues = useMemo(() => {
    if (!colorBy.track || selectedIsMulti) return [] as [string, number][]
    const counts = new Map<string, number>()
    for (const n of dbNodes) {
      if (!n.tracks) continue
      try {
        // trackValues unwraps the single-entry array a multi-value track stores,
        // so the legend shows "Death" rather than a raw ["Death"] string.
        for (const entry of trackValues(JSON.parse(n.tracks)[colorBy.track])) {
          counts.set(entry, (counts.get(entry) ?? 0) + 1)
        }
      } catch {}
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [dbNodes, colorBy.track, selectedIsMulti])

  // Saved picks layered over palette auto-assignment, so every value present
  // gets a color immediately and user choices persist.
  const effectiveColorBy = useMemo<ColorByConfig | undefined>(() => {
    if (!colorBy.track || selectedIsMulti) return undefined
    const colors: Record<string, string> = {}
    colorTrackValues.forEach(([v], i) => {
      colors[v] = colorBy.colors[v] ?? RANK_PALETTE[i % RANK_PALETTE.length]
    })
    return { track: colorBy.track, colors }
  }, [colorBy, colorTrackValues, selectedIsMulti])

  const cfg = TEMPLATE_CONFIG[web.template] || TEMPLATE_CONFIG.custom
  // The territory web is auto-generated from location "Located within" links, so
  // its structure is read-only here — only repositioning (which persists) is allowed.
  const isTerritory = web.template === 'territory'

  // Expanding a bridge is exclusive — two ghosted branches at once turns the
  // canvas into soup, so opening one closes the other.
  const toggleBridge = useCallback((nodeId: number, bridge: BridgeRef) => {
    setOpenBridge(prev =>
      prev && prev.nodeId === nodeId && prev.webId === bridge.web_id
        ? null
        : {
            nodeId, webId: bridge.web_id, targetNodeId: bridge.target_node_id,
            webName: bridge.web_name, depth: prev?.depth ?? 2,
          })
  }, [])

  const bumpBridgeDepth = useCallback((delta: number) => {
    setOpenBridge(prev => prev ? { ...prev, depth: Math.max(1, Math.min(6, prev.depth + delta)) } : prev)
  }, [])

  // Everything a node needs to render itself, in one bag.
  const renderCtx = useMemo<NodeRenderCtx>(() => ({
    onCreateArticle: (nodeId: number) => handleCreateArticleRef.current(nodeId),
    trackFilters,
    ranksById,
    colorBy: effectiveColorBy,
    style: nodeStyle,
    bridges,
    openBridge,
    onToggleBridge: toggleBridge,
    onBridgeDepth: bumpBridgeDepth,
  }), [trackFilters, ranksById, effectiveColorBy, nodeStyle, bridges, openBridge, toggleBridge, bumpBridgeDepth])

  // Callbacks fired from React Flow (node added, union spawned) build nodes
  // outside of render, so they read the context through a ref.
  const renderCtxRef = useRef(renderCtx)
  renderCtxRef.current = renderCtx

  // ── Use a ref so loadWebData can be called from handleTidyUp without a dep cycle ──
  const loadWebDataRef = useRef<() => void>(() => {})

  const loadWebData = useCallback(async () => {
    const data = await (window as any).api.getRelationWebData(web.id)
    setDbNodes(data.nodes)
    setDbEdges(data.edges)
    setNodes(prev => [
      ...data.nodes.map((n: DBRelationNode) => dbNodeToRF(n, renderCtxRef.current)),
      ...prev.filter((n: RFNode) => isGhostId(n.id)),
    ])
    setEdges(prev => [
      ...data.edges.map((e: DBRelationEdge) => dbEdgeToRF(e)),
      ...prev.filter((e: RFEdge) => isGhostId(e.id)),
    ])
  }, [web.id])

  useEffect(() => { loadWebDataRef.current = loadWebData }, [loadWebData])
  useEffect(() => { loadWebData(); reloadBridges() }, [web.id])

  // Deep-link: once nodes are loaded, select + center the node linked to the
  // focus article (set when opening the web from an article's sidebar).
  const focusOnArticleNode = useCallback(() => {
    if (!focusArticleId || didFocusRef.current) return
    const target = dbNodes.find(n => n.article_id === focusArticleId)
    if (!target || !rfRef.current) return
    didFocusRef.current = true
    setSelectedNodeId(String(target.id))
    const fp = nodeFootprint(nodeStyle, target.node_type || 'person')
    rfRef.current.setCenter(target.pos_x + fp.width / 2, target.pos_y + fp.height / 2, { zoom: 1.2, duration: 600 })
  }, [focusArticleId, dbNodes, nodeStyle])

  useEffect(() => { focusOnArticleNode() }, [focusOnArticleNode])

  // Re-render nodes when track filters, ranks, coloring, style or bridges change
  // (without reloading from DB)
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const dbNode = dbNodes.find(d => String(d.id) === n.id)
      if (!dbNode) return n
      return { ...dbNodeToRF(dbNode, renderCtx), selected: n.selected, position: n.position }
    }))
  }, [renderCtx, dbNodes])

  // ── Ghosted branch ──────────────────────────────────────────────────────────
  // Fetch the slice of the other web around the bridged person and drop it onto
  // the canvas as read-only scenery. Ghosts live only in React Flow state.
  useEffect(() => {
    if (!openBridge) { setGhostNodes([]); setGhostEdges([]); return }
    let cancelled = false
    ;(async () => {
      const branch = await (window as any).api.getRelationGhostBranch(
        openBridge.webId, openBridge.targetNodeId, openBridge.depth,
      )
      if (cancelled) return
      const host = dbNodes.find(n => n.id === openBridge.nodeId)
      const anchor = branch?.nodes?.find((n: DBRelationNode) => n.id === openBridge.targetNodeId)
      if (!branch || !host || !anchor) { setGhostNodes([]); setGhostEdges([]); return }

      const offsetKey = `${openBridge.nodeId}:${openBridge.webId}`
      const remembered = ghostOffsetsRef.current[offsetKey]
      const offset = remembered ?? ghostBranchOffset(host, anchor, branch.nodes, dbNodes)
      ghostOffsetsRef.current[offsetKey] = offset
      setGhostNodes(branch.nodes.map((n: DBRelationNode) => ghostNodeToRF(n, renderCtx, {
        webId: openBridge.webId,
        webName: openBridge.webName,
        anchorNodeId: openBridge.targetNodeId,
        onOpen: () => {
          // A drag ends in a click; don't treat that as "take me to that web".
          if (ghostDraggedRef.current) return
          onOpenWeb?.(openBridge.webId, n.article_id ?? null)
        },
      }, offset)))
      // The borrowed branch plus one tether from the real person to their double
      // in the other web — without it the ghosts read as an unrelated island.
      setGhostEdges([
        ...branch.edges.map((e: DBRelationEdge) => ghostEdgeToRF(e, openBridge.webId)),
        bridgeTetherEdge(openBridge.nodeId, openBridge.webId, openBridge.targetNodeId),
      ])

      // A branch parked off-screen looks like nothing happened, so bring the
      // person and everything ghosted in beside them into view together. Only on
      // first placement — once it has been dragged somewhere, leave the camera be.
      if (rfRef.current && !remembered) {
        const style = renderCtx.style ?? undefined
        const box = (n: { pos_x: number; pos_y: number; node_type?: string }, dx = 0, dy = 0) => {
          const fp = nodeFootprint(style ?? DEFAULT_NODE_STYLE, (n.node_type as any) || 'person')
          return { x1: n.pos_x + dx, y1: n.pos_y + dy, x2: n.pos_x + dx + fp.width, y2: n.pos_y + dy + fp.height }
        }
        const boxes = [box(host), ...branch.nodes.map((n: DBRelationNode) => box(n, offset.dx, offset.dy))]
        const x1 = Math.min(...boxes.map(b => b.x1)), y1 = Math.min(...boxes.map(b => b.y1))
        const x2 = Math.max(...boxes.map(b => b.x2)), y2 = Math.max(...boxes.map(b => b.y2))
        rfRef.current.fitBounds(
          { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
          { padding: 0.12, duration: 500 },
        )
      }
    })()
    return () => { cancelled = true }
  }, [openBridge, dbNodes, renderCtx, onOpenWeb])

  // A bridge that vanished (the article was unlinked, or the other web deleted)
  // must not leave its ghosts stranded on the canvas.
  useEffect(() => {
    if (!openBridge) return
    const still = (bridges[openBridge.nodeId] ?? []).some(b => b.web_id === openBridge.webId)
    if (!still) setOpenBridge(null)
  }, [bridges, openBridge])

  // Ghosts have to sit in the same arrays React Flow writes back to. It reports
  // measured node dimensions *through* onNodesChange, so a node kept outside
  // useNodesState never receives its width/height — and React Flow silently
  // skips every edge attached to an unmeasured node. Merging here (rather than
  // concatenating at render time) keeps that round-trip intact, and running only
  // when the ghost set itself changes preserves the dimensions already applied.
  useEffect(() => {
    setNodes(prev => [...prev.filter((n: RFNode) => !isGhostId(n.id)), ...ghostNodes])
  }, [ghostNodes])

  useEffect(() => {
    setEdges(prev => [...prev.filter((e: RFEdge) => !isGhostId(e.id)), ...ghostEdges])
  }, [ghostEdges])

  const syncDerivedRelations = useCallback(async () => {
    // Family trees derive relations; hierarchies derive the leader track. Both
    // run through the same backend handler (each no-ops for other templates).
    if (web.template !== 'family_tree' && web.template !== 'org_hierarchy') return
    try { await (window as any).api.syncDerivedRelations(web.id) } catch {}
  }, [web.id, web.template])

  // Tier layout for ranked hierarchy webs: rows by rank order, x ordered within
  // each row near the (primary) superior. Unranked nodes drop to the bottom row.
  const handleTierLayout = useCallback(async () => {
    const fp = nodeFootprint(nodeStyle, 'person')
    const ROW_H = fp.height + 90, COL_W = fp.width + 60, baseY = 80
    const persons = dbNodes.filter(n => n.node_type === 'person')
    const tierOf = (n: DBRelationNode) => {
      const idx = ranks.findIndex(r => r.id === n.rank_id)
      return idx === -1 ? ranks.length : idx
    }
    const superiorX = (n: DBRelationNode) => {
      const sup = dbEdges
        .filter(e => e.edge_type === 'reports_to' && e.from_node_id === n.id)
        .map(e => dbNodes.find(m => m.id === e.to_node_id))
        .filter(Boolean) as DBRelationNode[]
      if (!sup.length) return n.pos_x
      return sup.reduce((s, m) => s + m.pos_x, 0) / sup.length
    }
    const tiers: Record<number, DBRelationNode[]> = {}
    persons.forEach(n => { const t = tierOf(n); (tiers[t] ||= []).push(n) })
    const updates: { id: number; pos_x: number; pos_y: number }[] = []
    Object.keys(tiers).map(Number).sort((a, b) => a - b).forEach((t, rowIdx) => {
      const row = tiers[t].slice().sort((a, b) => superiorX(a) - superiorX(b))
      const totalW = (row.length - 1) * COL_W
      row.forEach((n, i) => {
        updates.push({
          id: n.id,
          pos_x: Math.round((600 + i * COL_W - totalW / 2) / 20) * 20,
          pos_y: baseY + rowIdx * ROW_H,
        })
      })
    })
    await Promise.all(updates.map(u => (window as any).api.updateRelationNode(u.id, { pos_x: u.pos_x, pos_y: u.pos_y })))
    loadWebDataRef.current()
  }, [dbNodes, dbEdges, ranks, nodeStyle])

  const handleTidyUp = useCallback(async () => {
    if (cfg.ranked) return handleTierLayout()
    if (!cfg.dagreDir) return
    try {
      const dagre = (await import('dagre' as any)).default ?? (await import('dagre' as any))
      const g = new dagre.graphlib.Graph()
      g.setDefaultEdgeLabel(() => ({}))
      g.setGraph({ rankdir: cfg.dagreDir, rankSep: nodeStyle.layout === 'card' ? 110 : 80, nodeSep: 40 })
      dbNodes.forEach(n => g.setNode(String(n.id), nodeFootprint(nodeStyle, n.node_type || 'person')))
      dbEdges.forEach(e => g.setEdge(String(e.from_node_id), String(e.to_node_id)))
      dagre.layout(g)
      await Promise.all(dbNodes.map(n => {
        const gn = g.node(String(n.id))
        const fp = nodeFootprint(nodeStyle, n.node_type || 'person')
        return (window as any).api.updateRelationNode(n.id, {
          pos_x: gn.x - fp.width / 2,
          pos_y: gn.y - fp.height / 2,
        })
      }))
      loadWebDataRef.current()
    } catch (err) { console.error('Tidy up failed:', err) }
  }, [dbNodes, dbEdges, cfg.dagreDir, cfg.ranked, handleTierLayout, nodeStyle])

  // Inline "+ Create article" opens a modal to pick the article type first.
  const handleCreateArticleRef = useRef<(nodeId: number) => void>(() => {})
  const requestCreateArticle = useCallback((nodeId: number) => {
    const node = dbNodes.find(n => n.id === nodeId)
    if (node) { setActionError(null); setCreatingArticleFor(node) }
  }, [dbNodes])
  useEffect(() => { handleCreateArticleRef.current = requestCreateArticle }, [requestCreateArticle])

  const doCreateArticle = useCallback(async (nodeId: number, articleType: string) => {
    if (!currentCampaign) return
    const node = dbNodes.find(n => n.id === nodeId)
    if (!node) return
    setActionError(null)
    try {
      const article = await (window as any).api.createArticle({
        campaign_id: currentCampaign.id, title: node.label, article_type: articleType,
      })
      await (window as any).api.updateRelationNode(nodeId, { article_id: article.id })
    } catch {
      // Title likely already exists (articles are unique per campaign) — link the
      // existing article instead of leaving the node silently unlinked.
      const matches = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: node.label, searchTitle: true, searchTags: false,
      })
      const exact = (matches || []).find((a: any) => a.title.toLowerCase() === node.label.trim().toLowerCase())
      if (exact) {
        await (window as any).api.updateRelationNode(nodeId, { article_id: exact.id })
      } else {
        setCreatingArticleFor(null)
        setActionError(`Couldn't create an article for "${node.label}". A different article with that name may already exist.`)
        return
      }
    }
    setCreatingArticleFor(null)
    loadWebDataRef.current()
    reloadBridges()
    syncDerivedRelations()
  }, [currentCampaign, dbNodes, syncDerivedRelations, reloadBridges])

  // Link / unlink an existing article on a node.
  const linkArticle = useCallback(async (nodeId: number, articleId: number) => {
    await (window as any).api.updateRelationNode(nodeId, { article_id: articleId })
    setLinkingArticleFor(null)
    loadWebDataRef.current()
    reloadBridges()
    syncDerivedRelations()
  }, [syncDerivedRelations, reloadBridges])

  // Per-node frame override. '' falls back to the web's default frame.
  const saveNodeFrame = useCallback(async (nodeId: number, raw: string) => {
    await (window as any).api.updateRelationNode(nodeId, { frame: raw })
    setDbNodes(prev => prev.map(n => n.id === nodeId ? { ...n, frame: raw } : n))
  }, [])

  const unlinkArticle = useCallback(async (nodeId: number) => {
    await (window as any).api.updateRelationNode(nodeId, { article_id: null })
    loadWebDataRef.current()
    reloadBridges()
    syncDerivedRelations()
  }, [syncDerivedRelations, reloadBridges])

  // Ghosts move as one rigid body. React Flow only moves the node under the
  // cursor, so the shared offset is re-derived from that node's own base
  // position and every other ghost is repositioned from its own base — which
  // keeps the other web's internal arrangement exactly as its DM left it.
  const onNodeDragStart = useCallback((_evt: any, node: RFNode) => {
    if (isGhostId(node.id)) ghostDraggedRef.current = false
  }, [])

  const onNodeDrag = useCallback((_evt: any, node: RFNode<NodeData>) => {
    const base = node.data?.ghost?.base
    if (!isGhostId(node.id) || !base) return
    ghostDraggedRef.current = true
    const dx = node.position.x - base.x
    const dy = node.position.y - base.y
    const ob = openBridgeRef.current
    if (ob) ghostOffsetsRef.current[`${ob.nodeId}:${ob.webId}`] = { dx, dy }
    setNodes(prev => prev.map((n: RFNode<NodeData>) => {
      if (!isGhostId(n.id) || n.id === node.id) return n
      const b = n.data?.ghost?.base
      return b ? { ...n, position: { x: b.x + dx, y: b.y + dy } } : n
    }))
  }, [setNodes])

  const onNodeDragStop = useCallback(async (_evt: any, node: RFNode) => {
    // Ghost positions are presentation only — never written back to the DB.
    if (isGhostId(node.id)) return
    await (window as any).api.updateRelationNode(Number(node.id), {
      pos_x: node.position.x, pos_y: node.position.y,
    })
  }, [])

  // Dragging any node of a multi-selection moves the whole set, so every one of
  // them needs its new position written — React Flow reports the group here
  // rather than through onNodeDragStop.
  const onSelectionDragStop = useCallback(async (_evt: any, dragged: RFNode[]) => {
    await Promise.all(dragged.filter(n => !isGhostId(n.id)).map(n => (window as any).api.updateRelationNode(Number(n.id), {
      pos_x: n.position.x, pos_y: n.position.y,
    })))
  }, [])

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    // Ignore self-loops and duplicate connections between the same pair.
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const s = Number(connection.source), t = Number(connection.target)
    const alreadyConnected = dbEdges.some(e =>
      (e.from_node_id === s && e.to_node_id === t) ||
      (e.from_node_id === t && e.to_node_id === s)
    )
    if (alreadyConnected) return
    const src = dbNodes.find(n => String(n.id) === connection.source)
    const tgt = dbNodes.find(n => String(n.id) === connection.target)
    // Ranked hierarchy: connecting two people makes a reports_to edge immediately
    // (no label). Stored subordinate → superior; rank order decides direction,
    // falling back to the drag direction when ranks are equal/unset.
    if (cfg.ranked && src?.node_type === 'person' && tgt?.node_type === 'person') {
      const rankIdx = (n: DBRelationNode) => {
        const i = ranks.findIndex(r => r.id === n.rank_id)
        return i === -1 ? Infinity : i
      }
      let fromId = s, toId = t
      if (rankIdx(src) < rankIdx(tgt)) {
        // src is the higher rank (superior) → flip so the subordinate is `from`
        fromId = t; toId = s
      }
      ;(async () => {
        // Subordinate sits below its superior, so route the line subordinate-top
        // → superior-bottom for a clean vertical org-chart connector.
        const edge = await (window as any).api.createRelationEdge({
          web_id: web.id, from_node_id: fromId, to_node_id: toId,
          label_from: '', label_to: '', edge_type: 'reports_to',
          from_handle: 'top', to_handle: 'bottom',
        })
        setDbEdges(prev => [...prev, edge])
        setEdges(prev => addEdge({ ...dbEdgeToRF(edge) }, prev))
        syncDerivedRelations()
      })()
      return
    }
    // union → person: create union_to_child edge immediately, no label needed
    if (src?.node_type === 'union' && tgt?.node_type === 'person') {
      ;(async () => {
        const edge = await (window as any).api.createRelationEdge({
          web_id: web.id,
          from_node_id: Number(connection.source),
          to_node_id: Number(connection.target),
          label_from: '', label_to: '', edge_type: 'union_to_child',
          from_handle: connection.sourceHandle || '', to_handle: connection.targetHandle || '',
        })
        setDbEdges(prev => [...prev, edge])
        setEdges(prev => addEdge({ ...dbEdgeToRF(edge) }, prev))
        syncDerivedRelations()
      })()
      return
    }
    const mode: 'standard' | 'person_to_union' =
      (src?.node_type === 'person' && tgt?.node_type === 'union') ? 'person_to_union' : 'standard'
    setPendingConnectionMode(mode)
    setPendingConnection(connection)
  }, [dbNodes, dbEdges, web.id, syncDerivedRelations, cfg.ranked, ranks])

  const handleEdgeLabelConfirm = async (labelFrom: string, labelTo: string) => {
    if (!pendingConnection) return
    const edge = await (window as any).api.createRelationEdge({
      web_id: web.id,
      from_node_id: Number(pendingConnection.source),
      to_node_id: Number(pendingConnection.target),
      label_from: labelFrom, label_to: labelTo,
      edge_type: pendingConnectionMode,
      from_handle: pendingConnection.sourceHandle || '', to_handle: pendingConnection.targetHandle || '',
    })
    setDbEdges(prev => [...prev, edge])
    setEdges(prev => addEdge({ ...dbEdgeToRF(edge) }, prev))
    setPendingConnection(null)
    syncDerivedRelations()
  }

  const onNodesDelete: OnNodesDelete = useCallback(async (rawDeleted) => {
    // Ghosts belong to another web — they can't be deleted from here.
    const deletedNodes = rawDeleted.filter((n: RFNode) => !isGhostId(n.id))
    if (deletedNodes.length === 0) return
    for (const node of deletedNodes) {
      await (window as any).api.deleteRelationNode(Number(node.id))
    }
    setDbNodes(prev => prev.filter(n => !deletedNodes.some(d => String(n.id) === d.id)))
    setDbEdges(prev => prev.filter(e => !deletedNodes.some(d =>
      String(e.from_node_id) === d.id || String(e.to_node_id) === d.id
    )))
    setSelectedNodeId(null)
    reloadBridges()
    syncDerivedRelations()
  }, [syncDerivedRelations, reloadBridges])

  // ── Node context menu ───────────────────────────────────────────────────────
  // A node is either a linked article — in which case it gets the same menu as
  // every other article surface — or a bare label the DM has not filled in yet.
  const onNodeContextMenu = useCallback((e: React.MouseEvent, rf: RFNode) => {
    const node = dbNodes.find(n => String(n.id) === rf.id)
    if (!node) return
    const removeItem = !isTerritory && {
      label: 'Remove from web',
      click: () => void onNodesDelete([rf]),
    }

    if (node.article_id) {
      showMenu(e, () => buildArticleMenu(
        { id: node.article_id!, title: node.article_title || node.label, article_type: node.article_type ?? undefined },
        menuCtx,
        {
          inWebId: web.id,
          extra: [
            !isTerritory && { label: 'Unlink article', click: () => void unlinkArticle(node.id) },
            removeItem,
          ],
        },
      ))
      return
    }

    showMenu(e, [
      { label: `Create article for “${truncate(node.label)}”`, enabled: !isTerritory, click: () => requestCreateArticle(node.id) },
      { label: 'Link an existing article…', enabled: !isTerritory, click: () => setLinkingArticleFor(node) },
      ...(removeItem ? [{ type: 'separator' as const }, removeItem] : []),
    ])
  }, [dbNodes, isTerritory, web.id, menuCtx, showMenu, onNodesDelete, unlinkArticle, requestCreateArticle])

  const onEdgesDelete: OnEdgesDelete = useCallback(async (rawDeleted) => {
    const deletedEdges = rawDeleted.filter((e: RFEdge) => !isGhostId(e.id))
    if (deletedEdges.length === 0) return
    for (const edge of deletedEdges) {
      await (window as any).api.deleteRelationEdge(Number(edge.id))
    }
    setDbEdges(prev => prev.filter(e => !deletedEdges.some(d => String(e.id) === d.id)))
    syncDerivedRelations()
  }, [syncDerivedRelations])

  const handleNodeAdded = (newNodes: DBRelationNode[]) => {
    setDbNodes(prev => [...prev, ...newNodes])
    setNodes(prev => [...prev, ...newNodes.map(n => dbNodeToRF(n, renderCtxRef.current))])
    setShowAddNode(false)
    reloadBridges()
    syncDerivedRelations()
  }

  // Spawn a bare union node — connect partners and children to it manually.
  const addUnionNode = useCallback(async () => {
    const { x, y } = findFreePosition(dbNodes)
    const node = await (window as any).api.createRelationNode({
      web_id: web.id, label: '∪', node_type: 'union', pos_x: x, pos_y: y,
    })
    setDbNodes(prev => [...prev, node])
    setNodes(prev => [...prev, dbNodeToRF(node, renderCtxRef.current)])
  }, [dbNodes, web.id])

  const saveWebName = async () => {
    if (!webName.trim()) { setWebName(web.name); setEditingName(false); return }
    await (window as any).api.updateRelationWeb(web.id, { name: webName.trim() })
    // Renaming here happens away from the hub, so publish for the tab label.
    useStore.getState().publishLocationNames('relations', {
      ...useStore.getState().locationNames.relations, [web.id]: webName.trim(),
    })
    setEditingName(false)
  }

  useEffect(() => { if (editingName) nameRef.current?.focus() }, [editingName])

  const selectedNode = selectedNodeId ? dbNodes.find(n => String(n.id) === selectedNodeId) : null
  // React Flow owns multi-selection, so the count is read off the nodes rather
  // than tracked alongside it.
  const selectedCount = nodes.filter((n: RFNode) => n.selected).length
  const selectedNodeEdges = selectedNodeId
    ? dbEdges.filter(e => String(e.from_node_id) === selectedNodeId || String(e.to_node_id) === selectedNodeId)
    : []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'relative' }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
          className="hover-text"
        >
          <ArrowLeft size={14} /> Relations
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input ref={nameRef} value={webName} onChange={e => setWebName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveWebName(); if (e.key === 'Escape') { setWebName(web.name); setEditingName(false) } }}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-ui)' }}
            />
            <button onClick={saveWebName} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3dbf7f', display: 'flex', padding: 2 }}><Check size={14} /></button>
            <button onClick={() => { setWebName(web.name); setEditingName(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={14} /></button>
          </div>
        ) : (
          <button onClick={() => setEditingName(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', padding: '3px 6px', borderRadius: 4 }}
            className="hover-bg-elevated"
          >
            {webName} <Pencil size={11} color="var(--text-muted)" />
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: selectedCount > 1 ? '#7F77DD' : 'var(--text-muted)' }}>
            {selectedCount > 1
              ? `${selectedCount} selected · drag to move${isTerritory ? '' : ', Del to remove'}`
              : isTerritory ? '' : 'Del to remove selected'}
          </span>

          {/* Pan ↔ Select. Shift+drag marquees in either mode; this makes the
              marquee the primary drag when you're rearranging a big web. */}
          <button
            onClick={() => setSelectMode(v => !v)}
            title={selectMode
              ? 'Select mode — drag to select, middle or right button to pan'
              : 'Pan mode — drag to pan, Shift+drag to select'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12,
              cursor: 'pointer', background: selectMode ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${selectMode ? '#AFA9EC' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              color: selectMode ? '#7F77DD' : 'var(--text-secondary)',
              transition: 'background var(--transition)',
            }}
            className="hover-bg-elevated"
          >
            {selectMode ? <MousePointer2 size={13} /> : <Hand size={13} />}
            {selectMode ? 'Select' : 'Pan'}
          </button>
          {cfg.ranked && (
            <button
              onClick={() => setShowRankPanel(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: showRankPanel ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
              className="hover-bg-elevated"
            >
              <Layers size={13} /> Ranks
            </button>
          )}
          {(cfg.dagreDir || cfg.ranked) && (
            <button onClick={handleTidyUp}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
              className="hover-bg-elevated"
            >
              <LayoutGrid size={13} /> Tidy up
            </button>
          )}
          {cfg.unionNodes && (
            <button onClick={addUnionNode}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #AFA9EC', borderRadius: 'var(--radius-sm)', color: '#7F77DD', transition: 'background var(--transition)', '--hover-accent': '#EEEDFE' } as React.CSSProperties}
              className="hover-accent-bg"
            >
              <GitMerge size={13} /> Add union
            </button>
          )}
          {/* Node style (compact rows ↔ framed portrait cards) */}
          <button
            onClick={() => { setShowStylePanel(v => !v); setShowColorPanel(false); setShowFilterPanel(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              background: showStylePanel ? 'var(--bg-elevated)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              transition: 'background var(--transition)',
            }}
            className="hover-bg-elevated"
          >
            <FrameIcon size={13} />
            Style
            {nodeStyle.layout === 'card' && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7F77DD', flexShrink: 0 }} />
            )}
          </button>
          {/* Color-by-track button */}
          <button
            onClick={() => { setShowColorPanel(v => !v); setShowFilterPanel(false); setShowStylePanel(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              background: showColorPanel ? 'var(--bg-elevated)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              transition: 'background var(--transition)',
            }}
            className="hover-bg-elevated"
          >
            <Palette size={13} />
            Color
            {colorBy.track && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7F77DD', flexShrink: 0 }} />
            )}
          </button>
          {/* Filter button */}
          <button
            onClick={() => { setShowFilterPanel(v => !v); setShowColorPanel(false); setShowStylePanel(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              background: showFilterPanel ? 'var(--bg-elevated)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              transition: 'background var(--transition)',
            }}
            className="hover-bg-elevated"
          >
            <Filter size={13} />
            Tracks
            {Object.values(trackFilters).some(v => v.length > 0) && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7F77DD', flexShrink: 0 }} />
            )}
          </button>
          {!isTerritory && (
            <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowAddNode(true)}>
              <Plus size={13} /> Add node
            </button>
          )}
        </div>

        {/* Filter panel */}
        {showFilterPanel && (
          <TrackFilterPanel
            trackFilters={trackFilters}
            onChange={setTrackFilters}
            onClose={() => setShowFilterPanel(false)}
            articleTypesInWeb={articleTypesInWeb}
          />
        )}

        {/* Rank panel */}
        {showRankPanel && (
          <RankPanel ranks={ranks} onChange={saveRanks} onClose={() => setShowRankPanel(false)} />
        )}

        {/* Node style panel */}
        {showStylePanel && (
          <NodeStylePanel
            style={nodeStyle}
            onChange={saveNodeStyle}
            onClose={() => setShowStylePanel(false)}
          />
        )}

        {/* Color-by-track panel */}
        {showColorPanel && (
          <ColorByPanel
            availableTracks={availableColorTracks}
            track={colorBy.track}
            values={colorTrackValues}
            colors={effectiveColorBy?.colors ?? {}}
            onSelectTrack={t => setColorBy(prev => ({ ...prev, track: t }))}
            onSetColor={(v, c) => setColorBy(prev => ({ ...prev, colors: { ...prev.colors, [v]: c } }))}
            onClose={() => setShowColorPanel(false)}
          />
        )}
      </div>

      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', background: 'rgba(224,85,85,0.1)', borderBottom: '1px solid rgba(224,85,85,0.3)', color: '#e05555', fontSize: 12, flexShrink: 0 }}>
          <span style={{ flex: 1 }}>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e05555', display: 'flex', padding: 2 }}><X size={13} /></button>
        </div>
      )}

      {/* Canvas + Detail panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {web.template === 'territory' ? (
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
              fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}>
              <Network size={11} color="#7F77DD" />
              Read-only · add places via each location’s “Located within” field
            </div>
          ) : (
            <LinkedArticlePill
              webId={web.id}
              article={linkedArticle}
              onReload={reloadLinkedArticle}
            />
          )}
          <ReactFlow
            nodes={nodes} edges={edges}
            onInit={(inst: any) => { rfRef.current = inst; focusOnArticleNode() }}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={isTerritory ? undefined : onConnect}
            onNodesDelete={isTerritory ? undefined : onNodesDelete} onEdgesDelete={isTerritory ? undefined : onEdgesDelete}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onSelectionDragStop={onSelectionDragStop}
            // Select mode turns a left-drag on empty canvas into a marquee and
            // moves panning onto the middle and right buttons. Shift+drag
            // marquees in either mode, so the toggle is a convenience, not the
            // only way in.
            selectionOnDrag={selectMode}
            panOnDrag={selectMode ? [1, 2] : true}
            selectionMode={SelectionMode.Partial}
            // Stated rather than left to React Flow's defaults, so the hint and
            // the behaviour can't drift: Shift or Ctrl+Shift drags a marquee,
            // Ctrl (or Cmd) click adds a node to the selection.
            selectionKeyCode={['Shift', 'Control+Shift']}
            multiSelectionKeyCode={['Control', 'Meta']}
            onNodeClick={(_e: any, node: RFNode) => { if (isGhostId(node.id)) return; setSelectedNodeId(prev => prev === node.id ? null : node.id) }}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeDoubleClick={isTerritory ? undefined : (_e: any, edge: RFEdge) => {
              const db = dbEdges.find(e => String(e.id) === edge.id)
              if (db) setEditingEdge(db)
            }}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            connectionMode={ConnectionMode.Loose}
            nodesConnectable={!isTerritory}
            snapToGrid snapGrid={[20, 20]}
            fitView fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={isTerritory ? null : ['Delete', 'Backspace']}
            style={{ background: 'var(--bg-base)' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
            <Controls />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div style={{ width: 240, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--bg-surface)', overflow: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              {selectedNode.node_type === 'union' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <Users size={13} color="#7F77DD" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Union</span>
                  </div>
                  <button onClick={() => setEditingUnion(selectedNode)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#7F77DD', fontSize: 11, padding: 0 }}>
                    <Pencil size={11} /> Edit union
                  </button>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedNode.article_title || selectedNode.label}
                    </span>
                  </div>
                  {selectedNode.article_id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => navigateToArticleByTitle(selectedNode.article_title || selectedNode.label)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: SECTION_ACCENTS['wiki'], fontSize: 11, padding: 0 }}>
                        <ExternalLink size={11} /> Open article
                      </button>
                      {!isTerritory && (
                        <button onClick={() => unlinkArticle(selectedNode.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 0 }}>
                          <Unlink size={11} /> Unlink
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => requestCreateArticle(selectedNode.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7F77DD', fontSize: 11, padding: 0 }}>
                        <Plus size={11} /> Create article
                      </button>
                      <button onClick={() => setLinkingArticleFor(selectedNode)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: SECTION_ACCENTS['wiki'], fontSize: 11, padding: 0 }}>
                        <Link2 size={11} /> Link existing
                      </button>
                    </div>
                  )}
                  {cfg.ranked && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Rank</div>
                      <select
                        className="input"
                        value={selectedNode.rank_id || ''}
                        style={{ fontSize: 12, padding: '5px 8px' }}
                        onChange={async e => {
                          await (window as any).api.updateRelationNode(selectedNode.id, { rank_id: e.target.value })
                          loadWebDataRef.current()
                          syncDerivedRelations()
                        }}
                      >
                        <option value="">— Unranked —</option>
                        {ranks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Per-node frame — only meaningful once the web draws cards */}
                  {nodeStyle.layout === 'card' && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Frame</div>
                      <FramePicker
                        value={parseFrame(selectedNode.frame) ?? nodeStyle.frame ?? { id: 'none' }}
                        inheriting={!selectedNode.frame}
                        allowInherit
                        onInherit={() => saveNodeFrame(selectedNode.id, '')}
                        onChange={spec => saveNodeFrame(selectedNode.id, serializeFrame(spec))}
                      />
                    </div>
                  )}
                  {/* Other webs this person also lives in */}
                  {(bridges[selectedNode.id] ?? []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Also in</div>
                      {(bridges[selectedNode.id] ?? []).map(b => (
                        <div key={b.web_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                          <Waypoints size={11} color="#7F77DD" style={{ flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.web_name}</span>
                          <button
                            onClick={() => toggleBridge(selectedNode.id, b)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7F77DD', fontSize: 10, padding: 0 }}
                          >
                            {openBridge?.nodeId === selectedNode.id && openBridge.webId === b.web_id ? 'Hide' : 'Ghost'}
                          </button>
                          <button
                            onClick={() => onOpenWeb?.(b.web_id, selectedNode.article_id ?? null)}
                            title="Open that web"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}
                          >
                            <ExternalLink size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {selectedNodeEdges.length > 0 && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  {selectedNode.node_type === 'union' ? 'Union members' : web.template === 'family_tree' ? 'Family relations' : cfg.ranked ? 'Reporting' : 'Edges'}
                </div>
                {selectedNode.node_type === 'union' ? (() => {
                  const uid = Number(selectedNodeId)
                  const members = dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === uid)
                    .map(e => ({ node: dbNodes.find(n => n.id === e.from_node_id), role: e.label_from }))
                  const uchildren = dbEdges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === uid)
                    .map(e => dbNodes.find(n => n.id === e.to_node_id))
                  const Row = ({ name, role }: { name: string; role?: string }) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', fontSize: 12 }}>
                      <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      {role && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{role}</span>}
                    </div>
                  )
                  return (
                    <div>
                      {members.map((m, i) => <Row key={`m${i}`} name={m.node?.article_title || m.node?.label || '?'} role={m.role} />)}
                      {uchildren.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Children</div>
                          {uchildren.map((c, i) => <Row key={`c${i}`} name={c?.article_title || c?.label || '?'} />)}
                        </div>
                      )}
                      <button onClick={() => setEditingUnion(selectedNode)}
                        style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, padding: '4px 8px' }}>
                        <Pencil size={11} /> Edit union
                      </button>
                    </div>
                  )
                })() : web.template === 'family_tree' && selectedNodeId ? (() => {
                  const nid = Number(selectedNodeId)
                  const partners: any[] = [], children: any[] = [], parents: any[] = [], siblings: any[] = []
                  const sibIds = new Set<number>()

                  dbEdges.filter(e => e.edge_type === 'person_to_union' && e.from_node_id === nid).forEach(ue => {
                    dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === ue.to_node_id && e.from_node_id !== nid).forEach(e => {
                      const p = dbNodes.find(n => n.id === e.from_node_id)
                      // Partner's own role in the union (from this person's perspective).
                      if (p) partners.push({ name: p.article_title || p.label, role: (e.label_from || '').replace(/ of$/i, '').trim() || 'partner', vitality: p.vitality })
                    })
                    dbEdges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === ue.to_node_id).forEach(e => {
                      const c = dbNodes.find(n => n.id === e.to_node_id)
                      if (c) children.push({ name: c.article_title || c.label, vitality: c.vitality })
                    })
                  })
                  dbEdges.filter(e => e.edge_type === 'union_to_child' && e.to_node_id === nid).forEach(pe => {
                    dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === pe.from_node_id).forEach(e => {
                      const p = dbNodes.find(n => n.id === e.from_node_id)
                      // From the child's perspective: "mother"/"father", not the union role.
                      if (p) parents.push({ name: p.article_title || p.label, role: parentRoleFromUnionLabel(e.label_from), vitality: p.vitality })
                    })
                    dbEdges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === pe.from_node_id && e.to_node_id !== nid).forEach(e => {
                      if (!sibIds.has(e.to_node_id)) { sibIds.add(e.to_node_id); const s = dbNodes.find(n => n.id === e.to_node_id); if (s) siblings.push({ name: s.article_title || s.label, vitality: s.vitality }) }
                    })
                  })

                  const Sec = ({ label, items }: { label: string; items: any[] }) => items.length === 0 ? null : (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                      {items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', fontSize: 12 }}>
                          <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          {item.role && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.role}</span>}
                        </div>
                      ))}
                    </div>
                  )
                  // Typed standard edges drawn inside the family tree (e.g.
                  // "Family Friend", "Disowned") aren't part of the union graph,
                  // so surface them here alongside the derived family relations.
                  const standardEdges = selectedNodeEdges.filter(e => e.edge_type === 'standard' || !e.edge_type)
                  return (
                    <div>
                      <Sec label="Partners" items={partners} />
                      <Sec label="Children" items={children} />
                      <Sec label="Parents" items={parents} />
                      <Sec label="Siblings" items={siblings} />
                      {standardEdges.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Other relationships</div>
                          {standardEdges.map(edge => {
                            const isFrom = String(edge.from_node_id) === selectedNodeId
                            const otherId = isFrom ? edge.to_node_id : edge.from_node_id
                            const other = dbNodes.find(n => n.id === otherId)
                            const directed = edge.label_from !== edge.label_to
                            return (
                              <div key={edge.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 12 }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{other?.article_title || other?.label || '?'}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{isFrom ? edge.label_from : edge.label_to}{directed ? ' →' : ''}</span>
                                <button onClick={() => setEditingEdge(edge)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
                                  <Pencil size={10} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {partners.length + children.length + parents.length + siblings.length + standardEdges.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No family relations yet.</div>
                      )}
                    </div>
                  )
                })() : cfg.ranked && selectedNodeId ? (() => {
                  const nid = Number(selectedNodeId)
                  const superiors = dbEdges.filter(e => e.edge_type === 'reports_to' && e.from_node_id === nid)
                    .map(e => dbNodes.find(n => n.id === e.to_node_id)).filter(Boolean) as DBRelationNode[]
                  const reports = dbEdges.filter(e => e.edge_type === 'reports_to' && e.to_node_id === nid)
                    .map(e => dbNodes.find(n => n.id === e.from_node_id)).filter(Boolean) as DBRelationNode[]
                  const Sec = ({ label, items }: { label: string; items: DBRelationNode[] }) => items.length === 0 ? null : (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                      {items.map(n => (
                        <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', fontSize: 12 }}>
                          <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.article_title || n.label}</span>
                        </div>
                      ))}
                    </div>
                  )
                  // Typed standard edges drawn in the hierarchy (e.g. "Rival",
                  // "Mentor") aren't reporting lines, so surface them separately.
                  const standardEdges = selectedNodeEdges.filter(e => e.edge_type === 'standard' || !e.edge_type)
                  return (
                    <div>
                      <Sec label="Reports to" items={superiors} />
                      <Sec label="Oversees" items={reports} />
                      {standardEdges.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Other relationships</div>
                          {standardEdges.map(edge => {
                            const isFrom = String(edge.from_node_id) === selectedNodeId
                            const otherId = isFrom ? edge.to_node_id : edge.from_node_id
                            const other = dbNodes.find(n => n.id === otherId)
                            const directed = edge.label_from !== edge.label_to
                            return (
                              <div key={edge.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 12 }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{other?.article_title || other?.label || '?'}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{isFrom ? edge.label_from : edge.label_to}{directed ? ' →' : ''}</span>
                                <button onClick={() => setEditingEdge(edge)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
                                  <Pencil size={10} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {superiors.length + reports.length + standardEdges.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No reporting lines yet. Drag from this node to a superior.</div>
                      )}
                    </div>
                  )
                })() : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {selectedNodeEdges.filter(e => e.edge_type === 'standard' || !e.edge_type).map(edge => {
                      const isFrom = String(edge.from_node_id) === selectedNodeId
                      const otherId = isFrom ? edge.to_node_id : edge.from_node_id
                      const other = dbNodes.find(n => n.id === otherId)
                      const directed = edge.label_from !== edge.label_to
                      return (
                        <div key={edge.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                            {other?.article_title || other?.label || '?'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {isFrom ? edge.label_from : edge.label_to}{directed ? ' →' : ''}
                          </span>
                          <button onClick={() => setEditingEdge(edge)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
                            <Pencil size={10} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedNodeEdges.length === 0 && (
              <div style={{ padding: '14px', fontSize: 12, color: 'var(--text-muted)' }}>
                Drag from a handle to connect this node to another.
              </div>
            )}
          </div>
        )}
      </div>

      {showAddNode && <AddNodeModal webId={web.id} existingNodes={dbNodes} onClose={() => setShowAddNode(false)} onAdded={handleNodeAdded} typeFilter={addNodeTypeFilter} onTypeFilterChange={setAddNodeTypeFilter} />}
      {pendingConnection && (
        <EdgeLabelModal
          mode={pendingConnectionMode}
          suggestions={cfg.defaultEdgeLabels}
          onClose={() => setPendingConnection(null)}
          onConfirm={handleEdgeLabelConfirm}
        />
      )}
      {editingEdge && (
        <EditEdgeModal edge={editingEdge} onClose={() => setEditingEdge(null)}
          onSave={async (lf, lt) => {
            await (window as any).api.updateRelationEdge(editingEdge.id, { label_from: lf, label_to: lt })
            setDbEdges(prev => prev.map(e => e.id === editingEdge.id ? { ...e, label_from: lf, label_to: lt } : e))
            setEdges(prev => prev.map(e => e.id === String(editingEdge.id) ? dbEdgeToRF({ ...editingEdge, label_from: lf, label_to: lt }) : e))
            setEditingEdge(null)
            syncDerivedRelations()
          }}
        />
      )}
      {creatingArticleFor && (
        <CreateArticleModal
          node={creatingArticleFor}
          onClose={() => setCreatingArticleFor(null)}
          onCreate={(type) => doCreateArticle(creatingArticleFor.id, type)}
        />
      )}
      {linkingArticleFor && currentCampaign && (
        <LinkArticleModal
          node={linkingArticleFor}
          campaignId={currentCampaign.id}
          onClose={() => setLinkingArticleFor(null)}
          onLink={(articleId) => linkArticle(linkingArticleFor.id, articleId)}
        />
      )}
      {editingUnion && (
        <EditUnionModal
          unionId={editingUnion.id}
          dbNodes={dbNodes}
          dbEdges={dbEdges}
          onClose={() => setEditingUnion(null)}
          onSaved={async () => { setEditingUnion(null); await loadWebData(); syncDerivedRelations() }}
          onDissolve={async () => {
            await (window as any).api.deleteRelationNode(editingUnion.id)
            setEditingUnion(null)
            setSelectedNodeId(null)
            await loadWebData()
            syncDerivedRelations()
          }}
        />
      )}
    </div>
  )
}
