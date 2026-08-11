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
  Users, Layers, Unlink, Link2, Palette, Hand, MousePointer2,
} from 'lucide-react'
import {
  type Rank, type ColorByConfig, TEMPLATE_CONFIG, type RelationWeb, type DBRelationNode, type DBRelationEdge,
  parentRoleFromUnionLabel, findFreePosition, RANK_PALETTE,
  dbNodeToRF, dbEdgeToRF, NODE_TYPES, EDGE_TYPES,
} from './relationsShared'
import { TrackFilterPanel, RankPanel, ColorByPanel, LinkedArticlePill } from './relationsPanels'
import { trackValues } from '../wiki/wikiConstants'
import { SECTION_ACCENTS } from '../../constants/sections'
import {
  AddNodeModal, EdgeLabelModal, EditEdgeModal,
  CreateArticleModal, LinkArticleModal, EditUnionModal,
} from './relationsModals'
import { useContextMenu, useMenuCtx } from '../../hooks/useContextMenu'
import { buildArticleMenu, truncate } from '../../utils/contextMenus'

// ── Canvas View ────────────────────────────────────────────────────────────────

export default function RelationsCanvasView({ web, onBack, focusArticleId }: { web: RelationWeb; onBack: () => void; focusArticleId?: number | null }) {
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

  // ── Use a ref so loadWebData can be called from handleTidyUp without a dep cycle ──
  const loadWebDataRef = useRef<() => void>(() => {})

  const loadWebData = useCallback(async () => {
    const data = await (window as any).api.getRelationWebData(web.id)
    setDbNodes(data.nodes)
    setDbEdges(data.edges)
    setNodes(data.nodes.map((n: DBRelationNode) => dbNodeToRF(n, handleCreateArticleRef.current, trackFilters, ranksById, effectiveColorBy)))
    setEdges(data.edges.map((e: DBRelationEdge) => dbEdgeToRF(e)))
  }, [web.id, trackFilters, ranksById, effectiveColorBy])

  useEffect(() => { loadWebDataRef.current = loadWebData }, [loadWebData])
  useEffect(() => { loadWebData() }, [web.id])

  // Deep-link: once nodes are loaded, select + center the node linked to the
  // focus article (set when opening the web from an article's sidebar).
  const focusOnArticleNode = useCallback(() => {
    if (!focusArticleId || didFocusRef.current) return
    const target = dbNodes.find(n => n.article_id === focusArticleId)
    if (!target || !rfRef.current) return
    didFocusRef.current = true
    setSelectedNodeId(String(target.id))
    // Center on the node's middle (node footprint ≈ 160×60).
    rfRef.current.setCenter(target.pos_x + 80, target.pos_y + 30, { zoom: 1.2, duration: 600 })
  }, [focusArticleId, dbNodes])

  useEffect(() => { focusOnArticleNode() }, [focusOnArticleNode])

  // Re-render nodes when track filters, ranks or coloring change (without reloading from DB)
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const dbNode = dbNodes.find(d => String(d.id) === n.id)
      if (!dbNode) return n
      return dbNodeToRF(dbNode, handleCreateArticleRef.current, trackFilters, ranksById, effectiveColorBy)
    }))
  }, [trackFilters, ranksById, effectiveColorBy])

  const syncDerivedRelations = useCallback(async () => {
    // Family trees derive relations; hierarchies derive the leader track. Both
    // run through the same backend handler (each no-ops for other templates).
    if (web.template !== 'family_tree' && web.template !== 'org_hierarchy') return
    try { await (window as any).api.syncDerivedRelations(web.id) } catch {}
  }, [web.id, web.template])

  // Tier layout for ranked hierarchy webs: rows by rank order, x ordered within
  // each row near the (primary) superior. Unranked nodes drop to the bottom row.
  const handleTierLayout = useCallback(async () => {
    const ROW_H = 130, COL_W = 200, baseY = 80
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
  }, [dbNodes, dbEdges, ranks])

  const handleTidyUp = useCallback(async () => {
    if (cfg.ranked) return handleTierLayout()
    if (!cfg.dagreDir) return
    try {
      const dagre = (await import('dagre' as any)).default ?? (await import('dagre' as any))
      const g = new dagre.graphlib.Graph()
      g.setDefaultEdgeLabel(() => ({}))
      g.setGraph({ rankdir: cfg.dagreDir, rankSep: 80, nodeSep: 40 })
      dbNodes.forEach(n => g.setNode(String(n.id), {
        width:  n.node_type === 'union' ? 26 : 140,
        height: n.node_type === 'union' ? 26 : 40,
      }))
      dbEdges.forEach(e => g.setEdge(String(e.from_node_id), String(e.to_node_id)))
      dagre.layout(g)
      await Promise.all(dbNodes.map(n => {
        const gn = g.node(String(n.id))
        return (window as any).api.updateRelationNode(n.id, {
          pos_x: gn.x - (n.node_type === 'union' ? 13 : 70),
          pos_y: gn.y - (n.node_type === 'union' ? 13 : 20),
        })
      }))
      loadWebDataRef.current()
    } catch (err) { console.error('Tidy up failed:', err) }
  }, [dbNodes, dbEdges, cfg.dagreDir, cfg.ranked, handleTierLayout])

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
    syncDerivedRelations()
  }, [currentCampaign, dbNodes, syncDerivedRelations])

  // Link / unlink an existing article on a node.
  const linkArticle = useCallback(async (nodeId: number, articleId: number) => {
    await (window as any).api.updateRelationNode(nodeId, { article_id: articleId })
    setLinkingArticleFor(null)
    loadWebDataRef.current()
    syncDerivedRelations()
  }, [syncDerivedRelations])

  const unlinkArticle = useCallback(async (nodeId: number) => {
    await (window as any).api.updateRelationNode(nodeId, { article_id: null })
    loadWebDataRef.current()
    syncDerivedRelations()
  }, [syncDerivedRelations])

  const onNodeDragStop = useCallback(async (_evt: any, node: RFNode) => {
    await (window as any).api.updateRelationNode(Number(node.id), {
      pos_x: node.position.x, pos_y: node.position.y,
    })
  }, [])

  // Dragging any node of a multi-selection moves the whole set, so every one of
  // them needs its new position written — React Flow reports the group here
  // rather than through onNodeDragStop.
  const onSelectionDragStop = useCallback(async (_evt: any, dragged: RFNode[]) => {
    await Promise.all(dragged.map(n => (window as any).api.updateRelationNode(Number(n.id), {
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

  const onNodesDelete: OnNodesDelete = useCallback(async (deletedNodes) => {
    for (const node of deletedNodes) {
      await (window as any).api.deleteRelationNode(Number(node.id))
    }
    setDbNodes(prev => prev.filter(n => !deletedNodes.some(d => String(n.id) === d.id)))
    setDbEdges(prev => prev.filter(e => !deletedNodes.some(d =>
      String(e.from_node_id) === d.id || String(e.to_node_id) === d.id
    )))
    setSelectedNodeId(null)
    syncDerivedRelations()
  }, [syncDerivedRelations])

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

  const onEdgesDelete: OnEdgesDelete = useCallback(async (deletedEdges) => {
    for (const edge of deletedEdges) {
      await (window as any).api.deleteRelationEdge(Number(edge.id))
    }
    setDbEdges(prev => prev.filter(e => !deletedEdges.some(d => String(e.id) === d.id)))
    syncDerivedRelations()
  }, [syncDerivedRelations])

  const handleNodeAdded = (newNodes: DBRelationNode[]) => {
    setDbNodes(prev => [...prev, ...newNodes])
    setNodes(prev => [...prev, ...newNodes.map(n => dbNodeToRF(n, requestCreateArticle, trackFilters, ranksById, effectiveColorBy))])
    setShowAddNode(false)
    syncDerivedRelations()
  }

  // Spawn a bare union node — connect partners and children to it manually.
  const addUnionNode = useCallback(async () => {
    const { x, y } = findFreePosition(dbNodes)
    const node = await (window as any).api.createRelationNode({
      web_id: web.id, label: '∪', node_type: 'union', pos_x: x, pos_y: y,
    })
    setDbNodes(prev => [...prev, node])
    setNodes(prev => [...prev, dbNodeToRF(node, requestCreateArticle, trackFilters, ranksById, effectiveColorBy)])
  }, [dbNodes, web.id, trackFilters, ranksById, effectiveColorBy, requestCreateArticle])

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
          {/* Color-by-track button */}
          <button
            onClick={() => { setShowColorPanel(v => !v); setShowFilterPanel(false) }}
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
            onClick={() => { setShowFilterPanel(v => !v); setShowColorPanel(false) }}
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
            onNodeClick={(_e: any, node: RFNode) => setSelectedNodeId(prev => prev === node.id ? null : node.id)}
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
