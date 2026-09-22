// path: src/components/relations/relationsShared.tsx
import { Fragment } from 'react'
// @ts-ignore
import {
  Edge as RFEdge, Node as RFNode,
  NodeTypes, EdgeTypes, MarkerType,
  Handle, Position, NodeProps, EdgeProps,
  getBezierPath, getSmoothStepPath, EdgeLabelRenderer, BaseEdge,
} from 'reactflow'
import { Waypoints, ChevronDown, ChevronUp, Minus, Plus as PlusIcon } from 'lucide-react'
// Multi-value tracks (Allies, Rivals, …) store a JSON array in the track slot;
// trackValues unpacks them so nodes never render raw JSON.
import { trackValues } from '../wiki/wikiConstants'
import { type FrameSpec, parseFrame, resolveFrame, frameGeometry, FrameOverlay } from './relationsFrames'

// ── Types ──────────────────────────────────────────────────────────────────────

export type WebTemplate =
  | 'family_tree' | 'org_hierarchy' | 'faction_web' | 'social_web'
  | 'quest_chain' | 'lore_causality' | 'trade_network' | 'territory' | 'custom'

export interface TemplateConfig {
  label: string
  unionNodes: boolean
  dagreDir: 'TB' | 'LR' | null
  defaultEdgeLabels: string[]
  ranked?: boolean   // rank-tier hierarchy (org/crime/religious): tiers + reports_to edges
}

// Template cards shared by the relations New-web modal and the article-side
// "Create web" flow.
export const WEB_TEMPLATES: { id: WebTemplate; label: string; desc: string }[] = [
  { id: 'family_tree',    label: 'Family tree',      desc: 'Dynasties, bloodlines' },
  { id: 'org_hierarchy',  label: 'Hierarchy',        desc: 'Ranks: crime, clergy, org' },
  { id: 'faction_web',    label: 'Faction web',      desc: 'Alliances, rivalries' },
  { id: 'social_web',     label: 'Social web',       desc: 'Personal relationships' },
  { id: 'quest_chain',    label: 'Quest chain',      desc: 'Dependencies, unlocks' },
  { id: 'lore_causality', label: 'Lore / causality', desc: 'Events, cause & effect' },
  { id: 'trade_network',  label: 'Trade network',    desc: 'Goods, routes' },
  { id: 'custom',         label: 'Custom',           desc: 'No constraints' },
]

export const TEMPLATE_CONFIG: Record<WebTemplate, TemplateConfig> = {
  family_tree:    { label: 'Family tree',      unionNodes: true,  dagreDir: 'TB', defaultEdgeLabels: ['husband of', 'wife of', 'partner of'] },
  org_hierarchy:  { label: 'Hierarchy',        unionNodes: false, dagreDir: null, defaultEdgeLabels: [], ranked: true },
  faction_web:    { label: 'Faction web',      unionNodes: false, dagreDir: null, defaultEdgeLabels: ['allied with', 'rivals'] },
  social_web:     { label: 'Social web',       unionNodes: false, dagreDir: null, defaultEdgeLabels: ['knows', 'trusts', 'hates'] },
  quest_chain:    { label: 'Quest chain',      unionNodes: false, dagreDir: 'LR', defaultEdgeLabels: ['unlocks', 'requires'] },
  lore_causality: { label: 'Lore / causality', unionNodes: false, dagreDir: 'LR', defaultEdgeLabels: ['caused', 'led to'] },
  trade_network:  { label: 'Trade network',    unionNodes: false, dagreDir: null, defaultEdgeLabels: ['trades with', 'supplies'] },
  // 'territory' is no longer offered as a manual template — it's reserved for the
  // auto-generated containment web. TB layout + containment labels suit the tree.
  territory:      { label: 'Territory',        unionNodes: false, dagreDir: 'TB', defaultEdgeLabels: ['contains', 'within'] },
  custom:         { label: 'Custom',           unionNodes: false, dagreDir: null, defaultEdgeLabels: [] },
}

export interface Rank {
  id: string
  name: string
  color: string
}

// Tier colors, highest → lowest. Presets and new ranks draw from this palette.
export const RANK_PALETTE = ['#c8a84b', '#b07de8', '#5b9fe8', '#49c185', '#e88c3a', '#7F77DD', '#d98899', '#8a8a8a']

interface RankPreset { id: string; label: string; ranks: string[] }
export const RANK_PRESETS: RankPreset[] = [
  { id: 'crime',     label: 'Crime org',  ranks: ['Boss', 'Underboss', 'Consigliere', 'Capo', 'Soldier', 'Associate'] },
  { id: 'religious', label: 'Religious',  ranks: ['Pope', 'Archbishop', 'Bishop', 'High Priest', 'Priest'] },
  { id: 'corporate', label: 'Corporate',  ranks: ['CEO', 'VP', 'Director', 'Manager', 'Staff'] },
  { id: 'blank',     label: 'Blank',      ranks: [] },
]

export function makeRankId(): string {
  return `rk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function buildRanksFromPreset(names: string[]): Rank[] {
  return names.map((name, i) => ({ id: makeRankId(), name, color: RANK_PALETTE[i % RANK_PALETTE.length] }))
}

export interface RelationWeb {
  id: number
  campaign_id: number
  name: string
  description: string
  template: WebTemplate
  ranks?: string        // JSON string of Rank[]
  node_style?: string   // JSON string of NodeStyle
  article_id?: number | null
  node_count: number
  updated_at: string
}

export interface DBRelationNode {
  id: number
  web_id: number
  article_id: number | null
  label: string
  node_type: 'person' | 'union'
  rank_id?: string | null
  frame?: string | null
  pos_x: number
  pos_y: number
  article_title?: string | null
  article_type?: string | null
  vitality?: string | null
  tracks?: string | null
  portrait_image?: string | null
}

export interface DBRelationEdge {
  id: number
  web_id: number
  from_node_id: number
  to_node_id: number
  label_from: string
  label_to: string
  edge_type: 'standard' | 'person_to_union' | 'union_to_child' | 'reports_to'
  from_handle?: string | null
  to_handle?: string | null
}

// Color-by-track: tint every node by the value of one chosen track (e.g. each
// Species its own color in a family tree, or State in the territory web).
export interface ColorByConfig {
  track: string
  colors: Record<string, string>   // track value → hex color
}

// ── Node presentation ─────────────────────────────────────────────────────────
// Per-web, stored as JSON in relation_webs.node_style. 'compact' is the original
// row layout (portrait beside the text); 'card' stacks a framed portrait above
// the name and the chosen track lines.
export interface NodeStyle {
  layout: 'compact' | 'card'
  frame: FrameSpec | null   // web default; a node's own frame overrides it
  size: number              // portrait box edge, px
}

export const DEFAULT_NODE_STYLE: NodeStyle = { layout: 'compact', frame: null, size: 96 }

export function parseNodeStyle(raw: string | null | undefined): NodeStyle {
  if (!raw) return DEFAULT_NODE_STYLE
  try {
    const o = JSON.parse(raw)
    return {
      layout: o.layout === 'card' ? 'card' : 'compact',
      frame: typeof o.frame === 'string' ? parseFrame(o.frame) : (o.frame ?? null),
      size: typeof o.size === 'number' ? Math.max(48, Math.min(200, o.size)) : DEFAULT_NODE_STYLE.size,
    }
  } catch { return DEFAULT_NODE_STYLE }
}

export function serializeNodeStyle(style: NodeStyle): string {
  return JSON.stringify({ layout: style.layout, frame: style.frame, size: style.size })
}

// Roughly how much room a node takes. Auto-layout and "centre on this node"
// both need it, and a portrait card is a very different shape from a compact row.
export function nodeFootprint(style: NodeStyle, nodeType: 'person' | 'union'): { width: number; height: number } {
  if (nodeType === 'union') return { width: 26, height: 26 }
  if (style.layout === 'card') return { width: style.size + 16, height: style.size + 62 }
  return { width: 140, height: 40 }
}

// ── Cross-web bridges ─────────────────────────────────────────────────────────
// Someone who married into another family tree is already a node in both webs,
// both pointing at the same article. That shared article is the bridge — the
// backend finds them, the node just shows a badge that ghosts the other branch in.
export interface BridgeRef {
  web_id: number
  web_name: string
  web_template: string
  target_node_id: number
}

// The one bridge currently expanded (one at a time keeps the canvas readable).
export interface OpenBridge {
  nodeId: number
  webId: number
  targetNodeId: number
  webName: string
  depth: number
}

// A ghosted node belongs to another web: it's read-only scenery here, and
// clicking it jumps to where it really lives.
export interface GhostInfo {
  webId: number
  webName: string
  isAnchor: boolean
  // The node's position in its *own* web, before the branch offset. Dragging any
  // ghost re-derives one shared offset from this, which is what lets the whole
  // borrowed branch move as a rigid body with its internal layout intact.
  base: { x: number; y: number }
  onOpen: () => void
}

// trackFilters: { [articleType]: string[] } — which track keys to display per type
export interface NodeData {
  dbId: number
  label: string
  nodeType: 'person' | 'union'
  vitality: string | null
  linked: boolean
  articleId: number | null
  articleType: string | null
  portrait: string | null
  tracks: Record<string, string>
  trackFilters: Record<string, string[]>
  rankName: string | null
  rankColor: string | null
  trackColor: string | null
  style: NodeStyle
  frame: FrameSpec
  bridges: BridgeRef[]
  openBridgeWebId: number | null
  bridgeDepth: number
  ghost: GhostInfo | null
  onCreateArticle: () => void
  onToggleBridge: (bridge: BridgeRef) => void
  onBridgeDepth: (delta: number) => void
}

// Everything the canvas needs to turn a DB row into a rendered node. Bundled
// because five of these travel together through four call sites.
export interface NodeRenderCtx {
  onCreateArticle: (nodeId: number) => void
  trackFilters: Record<string, string[]>
  ranksById?: Record<string, Rank>
  colorBy?: ColorByConfig
  style?: NodeStyle
  bridges?: Record<number, BridgeRef[]>
  openBridge?: OpenBridge | null
  onToggleBridge?: (nodeId: number, bridge: BridgeRef) => void
  onBridgeDepth?: (delta: number) => void
}

export interface EdgeData {
  dbId: number
  labelFrom: string
  labelTo: string
  edgeType: 'standard' | 'person_to_union' | 'union_to_child' | 'reports_to'
  ghost?: boolean
  tether?: boolean
}

// ── Track definitions (mirrored from WikiPage) ─────────────────────────────────

export const ARTICLE_TRACKS: Partial<Record<string, Record<string, string[]>>> = {
  character: {
    Vitality: ['Alive', 'Dead', 'Unknown', 'Missing', 'Immortal'],
    Attitude: ['Friendly', 'Neutral', 'Hostile'],
    Age: [], Species: [],
    Royal_Title: ['Duke','Duchess','Lord','Lady','King','Queen','Prince','Princess','Emperor','Empress','Disowned'],
    Title: ['Professor','Captain','General','Admiral','Archmage','High Priest'],
    Location: [], Faction: [], Religion: [], Culture: [],
  },
  playerCharacter: {
    Vitality: ['Alive', 'Dead', 'Unknown', 'Retired', 'Immortal'],
    Disposition: ['Friendly', 'Neutral', 'Hostile'],
    Royalty: ['Duke','Duchess','Lord','Lady','King','Queen','Prince','Princess','Emperor','Empress','Disowned'],
    Title: ['Professor','Captain','General','Admiral','Archmage','High Priest'],
    Age: [], Species: [], Location: [], Faction: [], Religion: [], Culture: [],
  },
  creature: {
    Vitality: ['Living','Extinct','Endangered','Unknown'],
    Disposition: ['Hostile','Neutral','Friendly'],
    Creature_Type: ['Beast','Dragon','Fiend','Celestial','Fey','Undead','Aberration','Humanoid','Construct','Elemental','Giant','Monstrosity','Ooze','Plant'],
    Size: ['Tiny','Small','Medium','Large','Huge','Gargantuan'],
    Habitat: ['Forest','Desert','Mountain','Swamp','Ocean','Underdark','Urban','Arctic','Plains'],
  },
  location: { State: [], Size: [], Type: [], Age: [], Government: [], 'Ruler/Leader': [], Controlled_By: [], Plane: [], Within: [] },
  faction:  { Status: [], Type: [], Scale: [], Leader: [], HQ: [], Allies: [], Rivals: [] },
  quest: { Status: [], Type: [], Difficulty: [] },
  item:  { Status: [], Type: [], Rarity: [], Location: [] },
  event: { Status: [], Type: [], Scale: [], Location: [] },
  culture:  { Status: [] },
  religion: { Status: [], Domains: [], Leader: [], Holy_Symbol: [], Follower_Count: [], Allies: [], Rivals: [], Sacred_Sites: [] },
  lore:  { Status: [] },
  note:  { Sender: [], Intended_Recipient: [], Language: [], Date: [], Location: [] },
  other: { Status: [] },
}

export const ALL_ARTICLE_TYPES = [
  'character','playerCharacter','creature','location','faction',
  'quest','item','event','culture','religion','lore','note','other',
]

export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  character: 'Character', playerCharacter: 'Player Character', creature: 'Creature',
  location: 'Location', faction: 'Faction',
  quest: 'Quest', item: 'Item', event: 'Event', culture: 'Culture',
  religion: 'Religion', lore: 'Lore', note: 'Note', other: 'Other',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isDead(v: string | null | undefined): boolean {
  return v === 'Dead'
}

// Map a parent's union role ("husband of"/"wife of") to the child's term for them.
export function parentRoleFromUnionLabel(label: string | null | undefined): string {
  const l = (label || '').toLowerCase()
  if (l.includes('husband') || l.includes('father')) return 'father'
  if (l.includes('wife') || l.includes('mother')) return 'mother'
  return 'parent'
}

// Pick a grid-snapped spot for a new node that doesn't overlap existing ones.
// Walks an outward spiral from a base point until it finds a clear cell.
export function findFreePosition(existing: { pos_x: number; pos_y: number }[]): { x: number; y: number } {
  const STEP = 200, MIN_DIST = 170
  const baseX = 120, baseY = 120
  const clear = (x: number, y: number) =>
    !existing.some(n => Math.abs(n.pos_x - x) < MIN_DIST && Math.abs(n.pos_y - y) < MIN_DIST)
  if (clear(baseX, baseY)) return { x: baseX, y: baseY }
  // Expanding square-ring search
  for (let ring = 1; ring <= 8; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const x = baseX + dx * STEP, y = baseY + dy * STEP
        if (clear(x, y)) return { x, y }
      }
    }
  }
  // Fallback: random offset so nodes never land exactly on top of each other
  return { x: baseX + Math.round(Math.random() * 10) * 20, y: baseY + Math.round(Math.random() * 10) * 20 }
}

function buildNodeData(node: DBRelationNode, ctx: NodeRenderCtx, ghost: GhostInfo | null): NodeData {
  let parsedTracks: Record<string, string> = {}
  if (node.tracks) {
    try { parsedTracks = JSON.parse(node.tracks) } catch {}
  }
  const rank = node.rank_id ? (ctx.ranksById ?? {})[node.rank_id] : undefined
  // Colourable tracks are single-entry by construction (the picker disables any
  // track where a node holds several), so this unwraps the lone stored value.
  const colorValue = ctx.colorBy ? trackValues(parsedTracks[ctx.colorBy.track])[0] : undefined
  const style = ctx.style ?? DEFAULT_NODE_STYLE
  const bridges = ghost ? [] : (ctx.bridges?.[node.id] ?? [])
  const open = ctx.openBridge && ctx.openBridge.nodeId === node.id ? ctx.openBridge : null
  return {
    dbId: node.id,
    label: node.article_title || node.label,
    nodeType: node.node_type || 'person',
    vitality: node.vitality || null,
    linked: node.article_id !== null,
    articleId: node.article_id,
    articleType: node.article_type || null,
    // Portraits only make sense for people — characters and player characters.
    portrait: (node.article_type === 'character' || node.article_type === 'playerCharacter')
      ? node.portrait_image ?? null
      : null,
    tracks: parsedTracks,
    trackFilters: ctx.trackFilters,
    rankName: rank?.name ?? null,
    rankColor: rank?.color ?? null,
    trackColor: colorValue ? ctx.colorBy!.colors[colorValue] ?? null : null,
    style,
    frame: resolveFrame(node.frame, style.frame),
    bridges,
    openBridgeWebId: open?.webId ?? null,
    bridgeDepth: open?.depth ?? 2,
    ghost,
    onCreateArticle: () => ctx.onCreateArticle(node.id),
    onToggleBridge: (bridge: BridgeRef) => ctx.onToggleBridge?.(node.id, bridge),
    onBridgeDepth: (delta: number) => ctx.onBridgeDepth?.(delta),
  }
}

export function dbNodeToRF(node: DBRelationNode, ctx: NodeRenderCtx): RFNode<NodeData> {
  return {
    id: String(node.id),
    position: { x: node.pos_x, y: node.pos_y },
    type: 'relationNode',
    data: buildNodeData(node, ctx, null),
  }
}

// ── Ghost nodes ───────────────────────────────────────────────────────────────
// Borrowed rows from another web, drawn dimmed beside the bridged node. They
// exist only in React Flow state — never written back — so every DB-touching
// handler skips ids in this namespace.
export const GHOST_NODE_PREFIX = 'g:'
export const GHOST_EDGE_PREFIX = 'ge:'
export const isGhostId = (id: string) => id.startsWith(GHOST_NODE_PREFIX) || id.startsWith(GHOST_EDGE_PREFIX)

export function ghostNodeToRF(
  node: DBRelationNode,
  ctx: NodeRenderCtx,
  ghost: Omit<GhostInfo, 'isAnchor' | 'base'> & { anchorNodeId: number },
  offset: { dx: number; dy: number },
): RFNode<NodeData> {
  return {
    id: `${GHOST_NODE_PREFIX}${ghost.webId}:${node.id}`,
    position: { x: node.pos_x + offset.dx, y: node.pos_y + offset.dy },
    type: 'relationNode',
    // Draggable so the branch can be parked somewhere useful, but never
    // selectable or connectable — it isn't this web's to edit.
    draggable: true,
    connectable: false,
    selectable: false,
    deletable: false,
    data: buildNodeData(node, ctx, {
      webId: ghost.webId,
      webName: ghost.webName,
      isAnchor: node.id === ghost.anchorNodeId,
      base: { x: node.pos_x, y: node.pos_y },
      onOpen: ghost.onOpen,
    }),
  }
}

// The one edge that spans the two webs: this person here ↔ the same person in
// the ghosted branch. Drawn as a purple dashed tether so the branch reads as
// hanging off them rather than floating loose on the canvas.
export function bridgeTetherEdge(hostNodeId: number, webId: number, anchorNodeId: number): RFEdge<EdgeData> {
  return {
    id: `${GHOST_EDGE_PREFIX}tether:${webId}:${hostNodeId}`,
    source: String(hostNodeId),
    target: `${GHOST_NODE_PREFIX}${webId}:${anchorNodeId}`,
    sourceHandle: 'right',
    targetHandle: 'left',
    type: 'relationEdge',
    focusable: false,
    deletable: false,
    style: { stroke: '#7F77DD', strokeWidth: 1.5, strokeDasharray: '2 5' },
    data: { dbId: -1, labelFrom: '', labelTo: '', edgeType: 'standard', tether: true },
  }
}

export function ghostEdgeToRF(edge: DBRelationEdge, webId: number): RFEdge<EdgeData> {
  const base = dbEdgeToRF(edge)
  return {
    ...base,
    id: `${GHOST_EDGE_PREFIX}${webId}:${edge.id}`,
    source: `${GHOST_NODE_PREFIX}${webId}:${edge.from_node_id}`,
    target: `${GHOST_NODE_PREFIX}${webId}:${edge.to_node_id}`,
    focusable: false,
    deletable: false,
    markerEnd: undefined,
    data: { ...base.data!, ghost: true },
  }
}

export function dbEdgeToRF(edge: DBRelationEdge): RFEdge<EdgeData> {
  const edgeType = edge.edge_type || 'standard'
  const directed = edgeType !== 'standard' ? true : edge.label_from !== edge.label_to
  return {
    id: String(edge.id),
    source: String(edge.from_node_id),
    target: String(edge.to_node_id),
    sourceHandle: edge.from_handle || undefined,
    targetHandle: edge.to_handle || undefined,
    type: 'relationEdge',
    data: { dbId: edge.id, labelFrom: edge.label_from, labelTo: edge.label_to, edgeType },
    markerEnd: directed
      ? { type: MarkerType.ArrowClosed, color: 'var(--border-light)', width: 14, height: 14 }
      : undefined,
  }
}

// ── Custom Node ────────────────────────────────────────────────────────────────

// Four connection dots (top/right/bottom/left). Each side has both a source and
// a target handle sharing the side's id, so (in loose connection mode) you can
// drag from any dot to any dot and the edge renders from the exact sides used.
const HANDLE_SIDES: { id: string; position: Position; off: React.CSSProperties }[] = [
  { id: 'top',    position: Position.Top,    off: { top: -4 } },
  { id: 'right',  position: Position.Right,  off: { right: -4 } },
  { id: 'bottom', position: Position.Bottom, off: { bottom: -4 } },
  { id: 'left',   position: Position.Left,   off: { left: -4 } },
]

function FourWayHandles({ baseStyle }: { baseStyle: React.CSSProperties }) {
  return (
    <>
      {HANDLE_SIDES.map(h => (
        <Fragment key={h.id}>
          <Handle id={h.id} type="target" position={h.position} style={{ ...baseStyle, ...h.off }} />
          <Handle id={h.id} type="source" position={h.position} style={{ ...baseStyle, ...h.off }} />
        </Fragment>
      ))}
    </>
  )
}

function initials(label: string): string {
  return label.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

// The framed portrait box: track tint and plate at the bottom, portrait in the
// aperture, frame art on top.
function PortraitFrame({ data, size }: { data: NodeData; size: number }) {
  const geo = frameGeometry(data.frame)
  const pad = (geo.inset / 100) * size
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', left: pad, top: pad, right: pad, bottom: pad,
        borderRadius: geo.radius ?? 3, overflow: 'hidden',
        background: geo.plate
          ?? (data.trackColor
            ? `color-mix(in srgb, ${data.trackColor} 28%, var(--bg-elevated))`
            : 'var(--bg-elevated)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {data.portrait ? (
          <img
            src={`file://${data.portrait}`} alt="" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none' }}
          />
        ) : (
          <span style={{
            fontSize: Math.round(size * 0.3), fontWeight: 600, letterSpacing: '0.04em',
            color: 'var(--text-muted)', opacity: 0.55, userSelect: 'none',
          }}>
            {initials(data.label)}
          </span>
        )}
      </div>
      <FrameOverlay spec={data.frame} />
    </div>
  )
}

// Badges for the other webs this person also lives in. Clicking one ghosts that
// branch in; the stepper then widens or narrows how many generations come along.
function BridgeBadges({ data }: { data: NodeData }) {
  if (data.ghost || data.bridges.length === 0) return null
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const stepStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 13, height: 13, padding: 0, cursor: 'pointer',
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 3,
    color: '#7F77DD',
  }
  return (
    <div style={{
      marginTop: 6, paddingTop: 5, borderTop: '1px solid var(--border-light)',
      display: 'flex', flexDirection: 'column', gap: 3, width: '100%',
    }}>
      {data.bridges.map(b => {
        const open = data.openBridgeWebId === b.web_id
        return (
          <div key={b.web_id} style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
            <button
              onMouseDown={stop}
              onClick={e => { stop(e); data.onToggleBridge(b) }}
              title={open ? `Hide the ${b.web_name} branch` : `Show this person's branch of ${b.web_name}`}
              style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4,
                background: open ? 'rgba(127,119,221,0.15)' : 'transparent',
                border: `1px solid ${open ? '#AFA9EC' : 'var(--border)'}`,
                borderRadius: 99, padding: '1px 6px', fontSize: 9, cursor: 'pointer',
                color: open ? '#7F77DD' : 'var(--text-muted)', fontFamily: 'var(--font-ui)',
              }}
            >
              <Waypoints size={9} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {b.web_name}
              </span>
              {open ? <ChevronUp size={9} style={{ flexShrink: 0 }} /> : <ChevronDown size={9} style={{ flexShrink: 0 }} />}
            </button>
            {open && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }} onMouseDown={stop}>
                <button style={stepStyle} title="Fewer generations"
                  onClick={e => { stop(e); data.onBridgeDepth(-1) }}><Minus size={8} /></button>
                <span style={{ fontSize: 9, color: 'var(--text-secondary)', minWidth: 6, textAlign: 'center' }}>{data.bridgeDepth}</span>
                <button style={stepStyle} title="More generations"
                  onClick={e => { stop(e); data.onBridgeDepth(1) }}><PlusIcon size={8} /></button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RelationNodeComponent({ data, selected }: NodeProps<NodeData>) {
  const ghost = data.ghost
  const card = data.style.layout === 'card' && data.nodeType === 'person'
  // Ghosts still need their four handles: React Flow resolves an edge's
  // sourceHandle/targetHandle by id and silently drops the edge when the handle
  // isn't in the DOM, which would leave the borrowed branch as loose boxes with
  // no lines between them. So render them, just invisible and untouchable.
  const handleStyle = ghost
    ? { background: 'transparent', width: 1, height: 1, border: 'none', opacity: 0, pointerEvents: 'none' as const }
    : { background: 'var(--border)', width: 7, height: 7, border: 'none' }

  // ── Union node — small circle ──
  if (data.nodeType === 'union') {
    return (
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--bg-surface)',
        border: selected ? '2px solid #7F77DD' : `1.5px ${ghost ? 'dashed' : 'solid'} #7F77DD`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: '#7F77DD', fontWeight: 700,
        cursor: 'grab', fontFamily: 'var(--font-ui)',
        position: 'relative', opacity: ghost ? 0.4 : 1,
      }}>
        ∪
        <FourWayHandles baseStyle={handleStyle} />
      </div>
    )
  }

  // ── Person node ──
  const dead = isDead(data.vitality)

  // Which tracks to show for this node's article type
  const typeFilters = data.articleType ? (data.trackFilters[data.articleType] || []) : []
  const trackLines = typeFilters
    .map(key => ({ key, val: trackValues(data.tracks[key]).join(', ') }))
    .filter(t => t.val !== '')

  const radius = card ? 8 : 6
  const shellStyle: React.CSSProperties = {
    background: data.trackColor
      ? `color-mix(in srgb, ${data.trackColor} 16%, var(--bg-surface))`
      : data.linked || card ? 'var(--bg-surface)' : 'transparent',
    border: selected
      ? '1.5px solid #7F77DD'
      : ghost
      ? '1.5px dashed var(--border-light)'
      : data.trackColor
      ? `1.5px solid color-mix(in srgb, ${data.trackColor} 65%, transparent)`
      : data.linked
      ? '0.5px solid var(--border)'
      : '1.5px dashed var(--border-light)',
    borderRadius: radius,
    position: 'relative',
    fontFamily: 'var(--font-ui)',
    cursor: 'grab',
    opacity: ghost ? 0.5 : dead ? 0.45 : 1,
    filter: dead ? 'grayscale(0.6)' : 'none',
    transition: 'opacity 0.15s, filter 0.15s',
  }

  const nameStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 500,
    color: dead ? 'var(--text-muted)' : data.linked ? 'var(--text-primary)' : 'var(--text-muted)',
    fontStyle: data.linked ? 'normal' : 'italic',
    lineHeight: 1.3, wordBreak: 'break-word',
    textDecoration: dead ? 'line-through' : 'none',
  }

  const TrackLines = () => (
    <>
      {trackLines.map(t => (
        <div key={t.key} style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>
          <span style={{ opacity: 0.6 }}>{t.key.replace(/_/g, ' ')}: </span>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{t.val}</span>
        </div>
      ))}
    </>
  )

  const CreateArticleLink = () => data.linked || ghost ? null : (
    <div
      style={{ fontSize: 10, color: '#7F77DD', marginTop: 2, cursor: 'pointer' }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); data.onCreateArticle() }}
    >
      + Create article
    </div>
  )

  // A ghost's whole job is to be clickable — it opens the web it came from.
  const ghostClick = ghost ? { onClick: (e: React.MouseEvent) => { e.stopPropagation(); ghost.onOpen() } } : {}

  // ── Card layout — framed portrait, name, then the chosen tracks ──
  if (card) {
    const size = data.style.size
    return (
      <div
        {...ghostClick}
        title={ghost ? `${data.label} — drag to move the branch, click to open ${ghost.webName}` : undefined}
        style={{ ...shellStyle, width: size + 16, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <FourWayHandles baseStyle={handleStyle} />
        {data.rankColor && (
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: `${radius}px 0 0 ${radius}px`, background: data.rankColor }} />
        )}
        <PortraitFrame data={data} size={size} />
        {data.rankName && (
          <div style={{ marginTop: 5, fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: data.rankColor || 'var(--text-muted)' }}>
            {data.rankName}
          </div>
        )}
        <div style={{ ...nameStyle, marginTop: data.rankName ? 1 : 6, textAlign: 'center', width: '100%' }}>
          {data.label}
        </div>
        <div style={{ width: '100%', textAlign: 'center' }}>
          <TrackLines />
          <CreateArticleLink />
        </div>
        {ghost?.isAnchor && <GhostTag webName={ghost.webName} />}
        <BridgeBadges data={data} />
      </div>
    )
  }

  // ── Compact layout — portrait beside the text ──
  return (
    <div
      {...ghostClick}
      title={ghost ? `${data.label} — drag to move the branch, click to open ${ghost.webName}` : undefined}
      style={{
        ...shellStyle,
        padding: '8px 10px',
        display: 'flex', alignItems: 'flex-start', gap: 8,
        minWidth: 140, maxWidth: data.portrait ? 210 : 180,
      }}
    >
      <FourWayHandles baseStyle={handleStyle} />
      {data.rankColor && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: `${radius}px 0 0 ${radius}px`, background: data.rankColor }} />
      )}
      {data.portrait && (
        <img
          src={`file://${data.portrait}`}
          alt=""
          draggable={false}
          style={{
            width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
            border: `1.5px solid ${data.trackColor ?? 'var(--border-light)'}`, flexShrink: 0,
            userSelect: 'none', pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {data.rankName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: data.rankColor || 'var(--text-muted)', marginBottom: 3 }}>
            {data.rankName}
          </div>
        )}
        <div style={nameStyle}>{data.label}</div>
        <TrackLines />
        {/* Vitality has no implicit line of its own — it shows only when the DM
            ticks Vitality in Track filters, like any other track. (It still
            drives the dead styling above regardless.) */}
        <CreateArticleLink />
        {ghost?.isAnchor && <GhostTag webName={ghost.webName} />}
        <BridgeBadges data={data} />
      </div>
    </div>
  )
}

// Names the web a ghosted branch was borrowed from, on its anchor node.
function GhostTag({ webName }: { webName: string }) {
  return (
    <div style={{
      marginTop: 5, display: 'flex', alignItems: 'center', gap: 3,
      fontSize: 9, color: '#7F77DD', maxWidth: '100%',
    }}>
      <Waypoints size={9} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{webName}</span>
    </div>
  )
}

// ── Custom Edge ────────────────────────────────────────────────────────────────

function RelationEdgeComponent({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd, selected }: EdgeProps<EdgeData>) {
  const edgeType = data?.edgeType || 'standard'
  // Reporting lines use stepped/elbow connectors (classic org-chart look);
  // everything else uses curved bezier paths.
  const [edgePath, labelX, labelY] = edgeType === 'reports_to'
    ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8 })
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })

  const labelFrom = data?.labelFrom || ''
  const labelTo   = data?.labelTo   || ''
  const symmetric = !labelTo || labelFrom === labelTo

  // Interpolated positions: 28% and 72% along the straight-line for two-pill labels
  const fromX = sourceX + (targetX - sourceX) * 0.28
  const fromY = sourceY + (targetY - sourceY) * 0.28
  const toX   = sourceX + (targetX - sourceX) * 0.72
  const toY   = sourceY + (targetY - sourceY) * 0.72

  const pillBase: React.CSSProperties = {
    position: 'absolute',
    background: 'var(--bg-surface)', border: '0.5px solid var(--border)',
    borderRadius: 99, padding: '2px 8px', fontSize: 10,
    color: 'var(--text-secondary)', pointerEvents: 'none',
    whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)',
    transform: 'translate(-50%, -50%)',
  }

  // Borrowed edges are drawn faint and dashed, and drop their labels — the
  // ghosted branch is context, not something to read in detail.
  const isGhost  = data?.ghost === true
  const isTether = data?.tether === true

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd}
        style={isTether
          ? { stroke: '#7F77DD', strokeWidth: 1.5, strokeDasharray: '2 5', opacity: 0.8 }
          : {
              stroke: selected ? '#7F77DD' : 'var(--border-light)',
              strokeWidth: selected ? 2 : 1.5,
              ...(isGhost ? { strokeDasharray: '4 4', opacity: 0.45 } : {}),
            }}
      />
      <EdgeLabelRenderer>
        {/* Standard symmetric — single pill at midpoint */}
        {!isGhost && edgeType === 'standard' && labelFrom && symmetric && (
          <div style={{ ...pillBase, left: labelX, top: labelY }}>{labelFrom}</div>
        )}
        {/* Standard asymmetric — two pills, one near each end */}
        {!isGhost && edgeType === 'standard' && labelFrom && !symmetric && (
          <>
            <div style={{ ...pillBase, left: fromX, top: fromY }}>{labelFrom}</div>
            <div style={{ ...pillBase, left: toX,   top: toY   }}>{labelTo}</div>
          </>
        )}
        {/* Person-to-union — single pill near the person (source) */}
        {!isGhost && edgeType === 'person_to_union' && labelFrom && (
          <div style={{ ...pillBase, left: fromX, top: fromY, color: '#7F77DD', borderColor: '#AFA9EC' }}>{labelFrom}</div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

export const NODE_TYPES: NodeTypes = { relationNode: RelationNodeComponent }
export const EDGE_TYPES: EdgeTypes = { relationEdge: RelationEdgeComponent }
