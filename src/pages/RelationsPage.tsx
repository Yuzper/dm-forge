// path: src/pages/RelationsPage.tsx
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { useStore } from '../store/store'
// @ts-ignore
import ReactFlow, {
  Background, BackgroundVariant, Controls,
  useNodesState, useEdgesState,
  Connection, Edge as RFEdge, Node as RFNode,
  NodeTypes, EdgeTypes, MarkerType,
  Handle, Position, NodeProps, EdgeProps,
  getBezierPath, getSmoothStepPath, EdgeLabelRenderer, BaseEdge,
  OnConnect, OnNodesDelete, OnEdgesDelete,
  addEdge, getRectOfNodes, getTransformForBounds, ConnectionMode,
} from 'reactflow'
// @ts-ignore
import 'reactflow/dist/style.css'
import { toPng, toSvg } from 'html-to-image'
import {
  Network, Plus, ArrowLeft, Trash2, Pencil, Check, X, Search, ExternalLink, Filter, ChevronDown, MoreHorizontal, GitMerge, LayoutGrid,
  Download, Unlink, Link2, Users, Layers, ChevronUp,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export type WebTemplate =
  | 'family_tree' | 'org_hierarchy' | 'faction_web' | 'social_web'
  | 'quest_chain' | 'lore_causality' | 'trade_network' | 'territory' | 'custom'

interface TemplateConfig {
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

interface Rank {
  id: string
  name: string
  color: string
}

// Tier colors, highest → lowest. Presets and new ranks draw from this palette.
const RANK_PALETTE = ['#c8a84b', '#b07de8', '#5b9fe8', '#49c185', '#e88c3a', '#7F77DD', '#d98899', '#8a8a8a']

interface RankPreset { id: string; label: string; ranks: string[] }
export const RANK_PRESETS: RankPreset[] = [
  { id: 'crime',     label: 'Crime org',  ranks: ['Boss', 'Underboss', 'Consigliere', 'Capo', 'Soldier', 'Associate'] },
  { id: 'religious', label: 'Religious',  ranks: ['Pope', 'Archbishop', 'Bishop', 'High Priest', 'Priest'] },
  { id: 'corporate', label: 'Corporate',  ranks: ['CEO', 'VP', 'Director', 'Manager', 'Staff'] },
  { id: 'blank',     label: 'Blank',      ranks: [] },
]

function makeRankId(): string {
  return `rk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function buildRanksFromPreset(names: string[]): Rank[] {
  return names.map((name, i) => ({ id: makeRankId(), name, color: RANK_PALETTE[i % RANK_PALETTE.length] }))
}

interface RelationWeb {
  id: number
  campaign_id: number
  name: string
  description: string
  template: WebTemplate
  ranks?: string   // JSON string of Rank[]
  article_id?: number | null
  node_count: number
  updated_at: string
}

interface DBRelationNode {
  id: number
  web_id: number
  article_id: number | null
  label: string
  node_type: 'person' | 'union'
  rank_id?: string | null
  pos_x: number
  pos_y: number
  article_title?: string | null
  article_type?: string | null
  vitality?: string | null
  tracks?: string | null
}

interface DBRelationEdge {
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

// trackFilters: { [articleType]: string[] } — which track keys to display per type
interface NodeData {
  dbId: number
  label: string
  nodeType: 'person' | 'union'
  vitality: string | null
  linked: boolean
  articleId: number | null
  articleType: string | null
  tracks: Record<string, string>
  trackFilters: Record<string, string[]>
  rankName: string | null
  rankColor: string | null
  onCreateArticle: () => void
}

interface EdgeData {
  dbId: number
  labelFrom: string
  labelTo: string
  edgeType: 'standard' | 'person_to_union' | 'union_to_child' | 'reports_to'
}

// ── Track definitions (mirrored from WikiPage) ─────────────────────────────────

const ARTICLE_TRACKS: Partial<Record<string, Record<string, string[]>>> = {
  character: {
    Vitality: ['Alive', 'Dead', 'Unknown', 'Missing', 'Immortal'],
    Attitude: ['Friendly', 'Neutral', 'Hostile'],
    Age: [], Royal_Title: ['Duke','Duchess','Lord','Lady','King','Queen','Prince','Princess','Emperor','Empress','Disowned'],
    Title: ['Professor','Captain','General','Admiral','Archmage','High Priest'],
    Location: [], Faction: [], Religion: [], Culture: [],
  },
  playerCharacter: {
    Vitality: ['Alive', 'Dead', 'Unknown', 'Retired', 'Immortal'],
    Disposition: ['Friendly', 'Neutral', 'Hostile'],
    Royalty: ['Duke','Duchess','Lord','Lady','King','Queen','Prince','Princess','Emperor','Empress','Disowned'],
    Title: ['Professor','Captain','General','Admiral','Archmage','High Priest'],
    Age: [], Location: [], Faction: [], Religion: [], Culture: [],
  },
  creature: {
    Vitality: ['Living','Extinct','Endangered','Unknown'],
    Disposition: ['Hostile','Neutral','Friendly'],
    Creature_Type: ['Beast','Dragon','Fiend','Celestial','Fey','Undead','Aberration','Humanoid','Construct','Elemental','Giant','Monstrosity','Ooze','Plant'],
    Size: ['Tiny','Small','Medium','Large','Huge','Gargantuan'],
    Habitat: ['Forest','Desert','Mountain','Swamp','Ocean','Underdark','Urban','Arctic','Plains'],
  },
  location: { State: [], Size: [], Plane: [], Within: [] },
  faction:  { Status: [], Scale: [], Leader: [], HQ: [], Allies: [], Rivals: [] },
  organization: { Status: [], Scale: [], Leader: [], HQ: [], Allies: [], Rivals: [] },
  quest: { Status: [], Difficulty: [] },
  item:  { Status: [], Rarity: [], Location: [] },
  event: { Status: [], Scale: [] },
  culture:  { Status: [] },
  religion: { Status: [], Leader: [], Holy_Symbol: [], Follower_Count: [], Allies: [], Rivals: [], Sacred_Sites: [] },
  lore:  { Status: [] },
  note:  { Sender: [], Intended_Recipient: [], Language: [], Date: [], Location: [] },
  other: { Status: [] },
}

export const ALL_ARTICLE_TYPES = [
  'character','playerCharacter','creature','location','faction','organization',
  'quest','item','event','culture','religion','lore','note','other',
]

export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  character: 'Character', playerCharacter: 'Player Character', creature: 'Creature',
  location: 'Location', faction: 'Faction', organization: 'Organization',
  quest: 'Quest', item: 'Item', event: 'Event', culture: 'Culture',
  religion: 'Religion', lore: 'Lore', note: 'Note', other: 'Other',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isDead(v: string | null | undefined): boolean {
  return v === 'Dead'
}

// Map a parent's union role ("husband of"/"wife of") to the child's term for them.
function parentRoleFromUnionLabel(label: string | null | undefined): string {
  const l = (label || '').toLowerCase()
  if (l.includes('husband') || l.includes('father')) return 'father'
  if (l.includes('wife') || l.includes('mother')) return 'mother'
  return 'parent'
}

// Pick a grid-snapped spot for a new node that doesn't overlap existing ones.
// Walks an outward spiral from a base point until it finds a clear cell.
function findFreePosition(existing: { pos_x: number; pos_y: number }[]): { x: number; y: number } {
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

function dbNodeToRF(
  node: DBRelationNode,
  onCreateArticle: (nodeId: number) => void,
  trackFilters: Record<string, string[]>,
  ranksById: Record<string, Rank> = {},
): RFNode<NodeData> {
  let parsedTracks: Record<string, string> = {}
  if (node.tracks) {
    try { parsedTracks = JSON.parse(node.tracks) } catch {}
  }
  const rank = node.rank_id ? ranksById[node.rank_id] : undefined
  return {
    id: String(node.id),
    position: { x: node.pos_x, y: node.pos_y },
    type: 'relationNode',
    data: {
      dbId: node.id,
      label: node.article_title || node.label,
      nodeType: node.node_type || 'person',
      vitality: node.vitality || null,
      linked: node.article_id !== null,
      articleId: node.article_id,
      articleType: node.article_type || null,
      tracks: parsedTracks,
      trackFilters,
      rankName: rank?.name ?? null,
      rankColor: rank?.color ?? null,
      onCreateArticle: () => onCreateArticle(node.id),
    },
  }
}

function dbEdgeToRF(edge: DBRelationEdge): RFEdge<EdgeData> {
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

function RelationNodeComponent({ data, selected }: NodeProps<NodeData>) {
  const handleStyle = { background: 'var(--border)', width: 7, height: 7, border: 'none' }

  // ── Union node — small circle ──
  if (data.nodeType === 'union') {
    return (
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--bg-surface)',
        border: selected ? '2px solid #7F77DD' : '1.5px solid #7F77DD',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: '#7F77DD', fontWeight: 700,
        cursor: 'grab', fontFamily: 'var(--font-ui)',
        position: 'relative',
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
    .map(key => ({ key, val: data.tracks[key] }))
    .filter(t => t.val && t.val.trim() !== '')

  return (
    <div
      style={{
        background: data.linked ? 'var(--bg-surface)' : 'transparent',
        border: selected
          ? '1.5px solid #7F77DD'
          : data.linked
          ? '0.5px solid var(--border)'
          : '1.5px dashed var(--border-light)',
        borderRadius: 6,
        padding: '8px 10px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 7,
        minWidth: 140,
        maxWidth: 180,
        position: 'relative',
        fontFamily: 'var(--font-ui)',
        cursor: 'grab',
        opacity: dead ? 0.45 : 1,
        filter: dead ? 'grayscale(0.6)' : 'none',
        transition: 'opacity 0.15s, filter 0.15s',
      }}
    >
      <FourWayHandles baseStyle={handleStyle} />
      {data.rankColor && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '6px 0 0 6px', background: data.rankColor }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        {data.rankName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: data.rankColor || 'var(--text-muted)', marginBottom: 3 }}>
            {data.rankName}
          </div>
        )}
        <div
          style={{
            fontSize: 12, fontWeight: 500,
            color: dead
              ? 'var(--text-muted)'
              : data.linked ? 'var(--text-primary)' : 'var(--text-muted)',
            fontStyle: data.linked ? 'normal' : 'italic',
            lineHeight: 1.3, wordBreak: 'break-word',
            textDecoration: dead ? 'line-through' : 'none',
          }}
        >
          {data.label}
        </div>
        {/* Track lines */}
        {trackLines.map(t => (
          <div key={t.key} style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.3 }}>
            <span style={{ opacity: 0.6 }}>{t.key.replace(/_/g, ' ')}: </span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{t.val}</span>
          </div>
        ))}
        {data.linked && data.vitality && trackLines.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{data.vitality}</div>
        )}
        {!data.linked && (
          <div
            style={{ fontSize: 10, color: '#7F77DD', marginTop: 2, cursor: 'pointer' }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); data.onCreateArticle() }}
          >
            + Create article
          </div>
        )}
      </div>
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

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd}
        style={{ stroke: selected ? '#7F77DD' : 'var(--border-light)', strokeWidth: selected ? 2 : 1.5 }}
      />
      <EdgeLabelRenderer>
        {/* Standard symmetric — single pill at midpoint */}
        {edgeType === 'standard' && labelFrom && symmetric && (
          <div style={{ ...pillBase, left: labelX, top: labelY }}>{labelFrom}</div>
        )}
        {/* Standard asymmetric — two pills, one near each end */}
        {edgeType === 'standard' && labelFrom && !symmetric && (
          <>
            <div style={{ ...pillBase, left: fromX, top: fromY }}>{labelFrom}</div>
            <div style={{ ...pillBase, left: toX,   top: toY   }}>{labelTo}</div>
          </>
        )}
        {/* Person-to-union — single pill near the person (source) */}
        {edgeType === 'person_to_union' && labelFrom && (
          <div style={{ ...pillBase, left: fromX, top: fromY, color: '#7F77DD', borderColor: '#AFA9EC' }}>{labelFrom}</div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

const NODE_TYPES: NodeTypes = { relationNode: RelationNodeComponent }
const EDGE_TYPES: EdgeTypes = { relationEdge: RelationEdgeComponent }

// ── Track Filter Panel ────────────────────────────────────────────────────────

function TrackFilterPanel({
  trackFilters,
  onChange,
  onClose,
  articleTypesInWeb,
}: {
  trackFilters: Record<string, string[]>
  onChange: (filters: Record<string, string[]>) => void
  onClose: () => void
  articleTypesInWeb: string[]
}) {
  const [openType, setOpenType] = useState<string | null>(null)

  const types = articleTypesInWeb.length > 0
    ? articleTypesInWeb
    : ALL_ARTICLE_TYPES.slice(0, 4)

  const toggleTrack = (articleType: string, key: string) => {
    const current = trackFilters[articleType] || []
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key]
    onChange({ ...trackFilters, [articleType]: next })
  }

  return (
    <div style={{
      position: 'absolute', top: 48, right: 12, zIndex: 100,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      width: 260, maxHeight: 480, overflow: 'auto',
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Track filters</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      <div style={{ padding: '4px 0 8px' }}>
        {types.map(articleType => {
          const tracks = ARTICLE_TRACKS[articleType] || {}
          const trackKeys = Object.keys(tracks)
          if (trackKeys.length === 0) return null
          const selected = trackFilters[articleType] || []
          const isOpen = openType === articleType
          return (
            <div key={articleType}>
              <button
                onClick={() => setOpenType(isOpen ? null : articleType)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
                  borderTop: '1px solid var(--border-light)', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
              >
                <span>{ARTICLE_TYPE_LABELS[articleType] || articleType}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selected.length > 0 && (
                    <span style={{ fontSize: 10, background: '#7F77DD22', color: '#7F77DD', borderRadius: 99, padding: '1px 6px' }}>
                      {selected.length}
                    </span>
                  )}
                  <ChevronDown size={12} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-muted)' }} />
                </div>
              </button>
              {isOpen && (
                <div style={{ padding: '4px 14px 8px' }}>
                  {trackKeys.map(key => {
                    const active = selected.includes(key)
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '4px 0', cursor: 'pointer',
                          fontSize: 12, color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          border: active ? '1.5px solid #7F77DD' : '1.5px solid var(--border)',
                          background: active ? '#7F77DD' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <Check size={9} color="#fff" />}
                        </div>
                        <input
                          type="checkbox" checked={active}
                          onChange={() => toggleTrack(articleType, key)}
                          style={{ display: 'none' }}
                        />
                        {key.replace(/_/g, ' ')}
                      </label>
                    )
                  })}
                  {selected.length > 0 && (
                    <button
                      onClick={() => onChange({ ...trackFilters, [articleType]: [] })}
                      style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Rank Panel ──────────────────────────────────────────────────────────────────

function RankPanel({ ranks, onChange, onClose }: {
  ranks: Rank[]
  onChange: (next: Rank[]) => void
  onClose: () => void
}) {
  const update = (id: string, patch: Partial<Rank>) => onChange(ranks.map(r => r.id === id ? { ...r, ...patch } : r))
  const remove = (id: string) => onChange(ranks.filter(r => r.id !== id))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= ranks.length) return
    const next = ranks.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = () => onChange([...ranks, { id: makeRankId(), name: 'New rank', color: RANK_PALETTE[ranks.length % RANK_PALETTE.length] }])

  const arrowBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0, lineHeight: 0 }

  return (
    <div style={{
      position: 'absolute', top: 48, right: 12, zIndex: 100,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      width: 290, maxHeight: 480, overflow: 'auto', fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Ranks <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>top = highest</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {ranks.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px 10px', lineHeight: 1.4 }}>
            No ranks yet — add tiers from highest to lowest.
          </div>
        )}
        {ranks.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...arrowBtn, opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={12} /></button>
              <button onClick={() => move(i, 1)} disabled={i === ranks.length - 1} style={{ ...arrowBtn, opacity: i === ranks.length - 1 ? 0.3 : 1 }}><ChevronDown size={12} /></button>
            </div>
            <input type="color" value={r.color} onChange={e => update(r.id, { color: e.target.value })}
              style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }} />
            <input className="input" value={r.name} onChange={e => update(r.id, { name: e.target.value })}
              style={{ flex: 1, fontSize: 12, padding: '4px 8px', minWidth: 0 }} />
            <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}><Trash2 size={12} /></button>
          </div>
        ))}
        <button onClick={add}
          style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
          <Plus size={13} /> Add rank
        </button>
      </div>
    </div>
  )
}

// ── Linked Article Pill ──────────────────────────────────────────────────────
// Small corner overlay showing which article owns this web, with a redirect
// and a way to set/change/remove the link.

function LinkedArticlePill({ webId, article, onReload }: {
  webId: number
  article: { id: number; title: string; article_type: string } | null
  onReload: () => void
}) {
  const { currentCampaign, navigateToArticleByTitle } = useStore()
  const [linking, setLinking] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!linking || !currentCampaign || !search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const arts = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: search.trim(), searchTitle: true, searchTags: false,
      })
      setResults((arts || []).slice(0, 6))
    }, 200)
  }, [search, linking, currentCampaign])

  const link = async (articleId: number) => {
    await (window as any).api.linkRelationWebArticle(webId, articleId)
    setLinking(false); setSearch(''); onReload()
  }
  const unlink = async () => {
    await (window as any).api.unlinkRelationWebArticle(webId)
    onReload()
  }

  const pillBase: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 12,
  }

  if (linking) {
    return (
      <div style={{ ...pillBase, background: 'var(--bg-elevated)', border: '1px solid var(--border)', width: 220 }}>
        <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={11} color="var(--text-muted)" />
          <input
            autoFocus
            className="ghost-input"
            style={{ flex: 1, fontSize: 12 }}
            placeholder="Search articles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setLinking(false); setSearch('') } }}
          />
          <button onClick={() => { setLinking(false); setSearch('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
            <X size={11} />
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {results.map(a => (
              <button key={a.id} onClick={() => link(a.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{a.article_type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!article) {
    return (
      <button onClick={() => setLinking(true)}
        style={{ ...pillBase, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
        title="Link this web to an article so it appears there">
        <Link2 size={11} /> Link to article
      </button>
    )
  }

  return (
    <div style={{ ...pillBase, display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <button
        onClick={() => navigateToArticleByTitle(article.title)}
        title={`Go to ${article.title}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#7F77DD'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
      >
        <ExternalLink size={11} color="#7F77DD" style={{ flexShrink: 0 }} />
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
      </button>
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
      <button onClick={() => setLinking(true)} title="Change linked article"
        style={{ display: 'flex', padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
        <Pencil size={10} />
      </button>
      <button onClick={unlink} title="Unlink article"
        style={{ display: 'flex', padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#e05555'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
        <X size={10} />
      </button>
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────────────

export function NewWebModal({ onClose, onCreated, lockedArticle }: {
  onClose: () => void
  onCreated: (web: RelationWeb) => void
  // When provided, the web is pre-linked to this article (any template) and the
  // article-search UI is hidden — used by the "Create web" flow from an article.
  lockedArticle?: { id: number; title: string }
}) {
  const { currentCampaign } = useStore()
  const [name, setName] = useState(lockedArticle?.title ?? '')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<WebTemplate>('custom')
  const [ladderId, setLadderId] = useState<string>('crime')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hierarchy webs link to an article (any type). Link an existing one, or
  // create a new one of the chosen type when none is selected.
  const [linkedArticle, setLinkedArticle] = useState<{ id: number; title: string } | null>(null)
  const [articleSearch, setArticleSearch] = useState('')
  const [articleResults, setArticleResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const [newArticleType, setNewArticleType] = useState('organization')
  const articleDebounce = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!currentCampaign || !articleSearch.trim()) { setArticleResults([]); return }
    clearTimeout(articleDebounce.current)
    articleDebounce.current = setTimeout(async () => {
      const arts = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: articleSearch.trim(), searchTitle: true, searchTags: false,
      })
      setArticleResults((arts || []).slice(0, 6))
    }, 200)
  }, [articleSearch, currentCampaign])

  const handleCreate = async () => {
    if (!name.trim() || !currentCampaign) return
    setSaving(true)
    setError(null)
    try {
      const ranked = TEMPLATE_CONFIG[template].ranked
      const ranks = ranked ? buildRanksFromPreset(RANK_PRESETS.find(p => p.id === ladderId)?.ranks ?? []) : []

      // Resolve the linked article. When locked (created from an article), that
      // article is the link for any template. Otherwise hierarchy webs link an
      // article (existing or auto-created).
      let articleId: number | null = null
      if (lockedArticle) {
        articleId = lockedArticle.id
      } else if (ranked) {
        if (linkedArticle) {
          articleId = linkedArticle.id
        } else {
          try {
            const art = await (window as any).api.createArticle({
              campaign_id: currentCampaign.id, title: name.trim(), article_type: newArticleType,
            })
            articleId = art.id
          } catch {
            // Title taken — link the existing article with that name instead.
            const matches = await (window as any).api.getArticlesList({
              campaignId: currentCampaign.id, search: name.trim(), searchTitle: true, searchTags: false,
            })
            const exact = (matches || []).find((a: any) => a.title.toLowerCase() === name.trim().toLowerCase())
            articleId = exact?.id ?? null
          }
        }
      }

      const web = await (window as any).api.createRelationWeb({
        campaign_id: currentCampaign.id, name: name.trim(), description: description.trim(), template,
        ranks: JSON.stringify(ranks), article_id: articleId,
      })
      onCreated(web)
    } catch (err: any) {
      console.error('createRelationWeb failed:', err)
      setError(err?.message || 'Failed to create web — please try again.')
      setSaving(false)
    }
  }

  const TEMPLATES = WEB_TEMPLATES

  const cfg = TEMPLATE_CONFIG[template]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">New web</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Template</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                    background: template === t.id ? 'var(--bg-elevated)' : 'transparent',
                    border: template === t.id ? '1.5px solid #7F77DD' : '1px solid var(--border)',
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Feature badges for selected template */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cfg.unionNodes && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC' }}>Union nodes</span>
            )}
            {cfg.dagreDir ? (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '0.5px solid var(--border)' }}>
                {cfg.dagreDir === 'TB' ? 'Top-down' : 'Left→right'} tidy-up
              </span>
            ) : (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '0.5px solid var(--border)' }}>Free canvas</span>
            )}
            {cfg.ranked && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC' }}>Rank tiers</span>
            )}
          </div>
          {cfg.ranked && (
            <div className="input-group">
              <label className="input-label">Starting ranks <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(editable later)</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RANK_PRESETS.map(p => (
                  <button key={p.id} onClick={() => setLadderId(p.id)}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                      background: ladderId === p.id ? 'var(--bg-elevated)' : 'transparent',
                      border: ladderId === p.id ? '1.5px solid #7F77DD' : '1px solid var(--border)',
                      color: ladderId === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {(() => {
                const preset = RANK_PRESETS.find(p => p.id === ladderId)
                return preset && preset.ranks.length > 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{preset.ranks.join(' › ')}</div>
                ) : null
              })()}
            </div>
          )}
          {lockedArticle && (
            <div className="input-group">
              <label className="input-label">Linked article</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <Network size={13} color="#7F77DD" />
                <span style={{ flex: 1, fontSize: 13 }}>{lockedArticle.title}</span>
              </div>
            </div>
          )}
          {cfg.ranked && !lockedArticle && (
            <div className="input-group">
              <label className="input-label">Linked article</label>
              {linkedArticle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <Network size={13} color="#7F77DD" />
                  <span style={{ flex: 1, fontSize: 13 }}>{linkedArticle.title}</span>
                  <button onClick={() => setLinkedArticle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input className="input" style={{ paddingLeft: 30 }} placeholder="Link an existing article…"
                      value={articleSearch} onChange={e => setArticleSearch(e.target.value)} />
                  </div>
                  {articleResults.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
                      {articleResults.map(a => (
                        <button key={a.id} onClick={() => { setLinkedArticle(a); setArticleSearch('') }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
                          {a.title}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.article_type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Or create a new</span>
                    <select className="input" value={newArticleType} onChange={e => setNewArticleType(e.target.value)} style={{ fontSize: 12, padding: '3px 6px', width: 'auto' }}>
                      {ALL_ARTICLE_TYPES.map(t => <option key={t} value={t}>{ARTICLE_TYPE_LABELS[t] || t}</option>)}
                    </select>
                    <span>named “{name.trim() || '…'}”.</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" autoFocus
              placeholder={template === 'family_tree' ? 'House Valarys bloodline…' : template === 'org_hierarchy' ? 'The King\'s council…' : 'My web…'}
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          </div>
          <div className="input-group">
            <label className="input-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" placeholder="A brief description…"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#e05555', background: 'rgba(224,85,85,0.08)', borderRadius: 6, padding: '8px 12px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

function AddNodeModal({ webId, existingNodes, onClose, onAdded, typeFilter, onTypeFilterChange }: {
  webId: number; existingNodes: DBRelationNode[]; onClose: () => void; onAdded: (nodes: DBRelationNode[]) => void
  typeFilter: string | null; onTypeFilterChange: (t: string | null) => void
}) {
  const { currentCampaign } = useStore()
  // 'search' = link existing article(s), 'new' = create a stub node
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  // Multi-select: link several existing articles as nodes in one go.
  const [selected, setSelected] = useState<{ id: number; title: string; article_type?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Articles already present as nodes — hidden from results to avoid duplicates.
  const existingArticleIds = useMemo(
    () => new Set(existingNodes.map(n => n.article_id).filter(Boolean) as number[]),
    [existingNodes],
  )

  useEffect(() => {
    if (!currentCampaign || !search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const articles = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: search.trim(), searchTitle: true, searchTags: false,
      })
      const filtered = typeFilter ? articles.filter((a: any) => a.article_type === typeFilter) : articles
      setResults(filtered.slice(0, 12))
    }, 200)
  }, [search, currentCampaign, typeFilter])

  const selectedIds = new Set(selected.map(a => a.id))
  const visibleResults = results.filter(a => !selectedIds.has(a.id) && !existingArticleIds.has(a.id))

  const toggleSelect = (a: { id: number; title: string; article_type?: string }) =>
    setSelected(prev => prev.some(s => s.id === a.id) ? prev.filter(s => s.id !== a.id) : [...prev, a])

  const handleAdd = async () => {
    if (mode === 'new') {
      if (!name.trim()) return
      setSaving(true)
      const { x, y } = findFreePosition(existingNodes)
      const node = await (window as any).api.createRelationNode({
        web_id: webId, label: name.trim(), article_id: null, pos_x: x, pos_y: y,
      })
      onAdded([node])
      return
    }
    // search mode — bulk-create one node per selected article
    if (selected.length === 0) return
    setSaving(true)
    const placed = existingNodes.map(n => ({ pos_x: n.pos_x, pos_y: n.pos_y }))
    const created: DBRelationNode[] = []
    for (const a of selected) {
      const { x, y } = findFreePosition(placed)
      const node = await (window as any).api.createRelationNode({
        web_id: webId,
        // Single selection keeps the optional label override; bulk uses titles.
        label: (selected.length === 1 && name.trim()) ? name.trim() : a.title,
        article_id: a.id,
        pos_x: x, pos_y: y,
      })
      placed.push({ pos_x: x, pos_y: y })
      created.push(node)
    }
    onAdded(created)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--bg-surface)' : 'transparent',
    border: 'none', borderRadius: 'var(--radius-sm)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add node{selected.length > 1 ? 's' : ''}</div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', gap: 3, padding: 3,
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
        }}>
          <button style={tabStyle(mode === 'search')} onClick={() => { setMode('search'); setName('') }}>
            🔗 Link existing article{selected.length !== 1 ? 's' : ''}
          </button>
          <button style={tabStyle(mode === 'new')} onClick={() => { setMode('new'); setSelected([]); setSearch('') }}>
            ✦ New node (no article yet)
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'search' ? (
            <>
              {/* Selected chips */}
              {selected.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.map(a => (
                    <span key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 99, border: '1px solid var(--border-light)', fontSize: 12 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3dbf7f', flexShrink: 0 }} />
                      {a.title}
                      <button onClick={() => toggleSelect(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="input-group">
                <label className="input-label">
                  Search for existing articles <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(select multiple)</span>
                </label>
                {/* Article type filter chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {ALL_ARTICLE_TYPES.map(t => (
                    <button key={t} onClick={() => onTypeFilterChange(typeFilter === t ? null : t)}
                      style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                        background: typeFilter === t ? '#7F77DD' : 'var(--bg-elevated)',
                        border: typeFilter === t ? '1px solid #7F77DD' : '1px solid var(--border)',
                        color: typeFilter === t ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.12s',
                      }}>
                      {ARTICLE_TYPE_LABELS[t] || t}
                    </button>
                  ))}
                  {typeFilter && (
                    <button onClick={() => onTypeFilterChange(null)}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, cursor: 'pointer', background: 'none', border: '1px solid var(--border-light)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <X size={9} /> Clear
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input className="input" style={{ paddingLeft: 30 }} placeholder={typeFilter ? `Search ${ARTICLE_TYPE_LABELS[typeFilter] || typeFilter} articles…` : 'Search articles…'}
                    value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                </div>
                {visibleResults.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {visibleResults.map(a => (
                      <button key={a.id}
                        onClick={() => toggleSelect(a)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                      >
                        <Plus size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        {a.title}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.article_type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selected.length === 1 && (
                <div className="input-group">
                  <label className="input-label">Override label <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="input"
                    placeholder={`${selected[0].title} (default)`}
                    value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()} />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="input-group">
                <label className="input-label">Node name</label>
                <input className="input" autoFocus
                  placeholder="Old Merwyn…"
                  value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', lineHeight: 1.5 }}>
                This creates a placeholder node with no linked article. You can create an article for it later directly from the node on the canvas.
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd}
            disabled={saving || (mode === 'search' ? selected.length === 0 : !name.trim())}>
            {saving
              ? 'Adding…'
              : mode === 'search' && selected.length > 1
                ? `Add ${selected.length} nodes`
                : 'Add node'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EdgeLabelModal({ onClose, onConfirm, mode = 'standard', suggestions = [] }: {
  onClose: () => void
  onConfirm: (labelFrom: string, labelTo: string) => void
  mode?: 'standard' | 'person_to_union'
  suggestions?: string[]
}) {
  const [labelFrom, setLabelFrom] = useState('')
  const [labelTo, setLabelTo] = useState('')
  const [symmetric, setSymmetric] = useState(true)

  const handleConfirm = () => {
    if (mode === 'person_to_union') { onConfirm(labelFrom.trim(), ''); return }
    if (!labelFrom.trim()) return
    onConfirm(labelFrom.trim(), symmetric ? labelFrom.trim() : labelTo.trim() || labelFrom.trim())
  }

  if (mode === 'person_to_union') {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-title">Role in union</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Your role <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input className="input" autoFocus placeholder="husband of, wife of, partner of…"
                value={labelFrom} onChange={e => setLabelFrom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()} />
              {suggestions.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setLabelFrom(s)}
                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => onConfirm('', '')}>Skip</button>
            <button className="btn btn-primary" onClick={handleConfirm}>Connect</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Define relationship</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Relationship label</label>
            <input className="input" autoFocus placeholder="Brother, Ally, Father of…"
              value={labelFrom} onChange={e => setLabelFrom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleConfirm()} />
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => setLabelFrom(s)}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Shows on both articles when symmetric</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={symmetric} onChange={e => setSymmetric(e.target.checked)} />
            Symmetric — same label on both ends
          </label>
          {!symmetric && (
            <div className="input-group">
              <label className="input-label">Reverse label <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(shown on the target article)</span></label>
              <input className="input" placeholder="Son of, Rival, Child of…"
                value={labelTo} onChange={e => setLabelTo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()} />
            </div>
          )}
          {labelFrom && (
            <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {symmetric ? (
                <><span style={{ color: 'var(--text-primary)' }}>A</span> — {labelFrom} — <span style={{ color: 'var(--text-primary)' }}>B</span><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>undirected · same label on both articles</span></>
              ) : (
                <><span style={{ color: 'var(--text-primary)' }}>A</span> → {labelFrom} → <span style={{ color: 'var(--text-primary)' }}>B</span><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>A's article: "B — {labelTo || labelFrom}"  ·  B's article: "A — {labelFrom}"</span></>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!labelFrom.trim()}>Connect</button>
        </div>
      </div>
    </div>
  )
}

function EditEdgeModal({ edge, onClose, onSave }: {
  edge: DBRelationEdge; onClose: () => void
  onSave: (labelFrom: string, labelTo: string) => void
}) {
  const [labelFrom, setLabelFrom] = useState(edge.label_from)
  const [labelTo, setLabelTo] = useState(edge.label_to)
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit relationship</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Label (from → to)</label>
            <input className="input" autoFocus value={labelFrom} onChange={e => setLabelFrom(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Reverse label (to → from)</label>
            <input className="input" value={labelTo} onChange={e => setLabelTo(e.target.value)} placeholder={labelFrom} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            onClick={() => onSave(labelFrom.trim(), labelTo.trim() || labelFrom.trim())}
            disabled={!labelFrom.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Create / Link / Union editing modals ───────────────────────────────────────

function CreateArticleModal({ node, onClose, onCreate }: {
  node: DBRelationNode
  onClose: () => void
  onCreate: (articleType: string) => Promise<void> | void
}) {
  const [articleType, setArticleType] = useState('character')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    setSaving(true)
    await onCreate(articleType)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Create article</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            A new article titled <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{node.label}</span> will be created and linked to this node.
          </div>
          <div className="input-group">
            <label className="input-label">Article type</label>
            <select className="input" autoFocus value={articleType} onChange={e => setArticleType(e.target.value)} style={{ fontSize: 13 }}>
              {ALL_ARTICLE_TYPES.map(t => (
                <option key={t} value={t}>{ARTICLE_TYPE_LABELS[t] || t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create & link'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LinkArticleModal({ node, campaignId, onClose, onLink }: {
  node: DBRelationNode
  campaignId: number
  onClose: () => void
  onLink: (articleId: number) => Promise<void> | void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const articles = await (window as any).api.getArticlesList({
        campaignId, search: search.trim(), searchTitle: true, searchTags: false,
      })
      setResults((articles || []).slice(0, 8))
    }, 200)
  }, [search, campaignId])

  const handlePick = async (id: number) => {
    setSaving(true)
    await onLink(id)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Link article</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Link <span style={{ color: 'var(--text-primary)' }}>{node.label}</span> to an existing article.
        </div>
        <div className="input-group">
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Search articles…"
              value={search} onChange={e => setSearch(e.target.value)} autoFocus disabled={saving} />
          </div>
          {results.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
              {results.map(a => (
                <button key={a.id} disabled={saving}
                  onClick={() => handlePick(a.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                >
                  {a.title}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.article_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function EditUnionModal({ unionId, dbNodes, dbEdges, onClose, onSaved, onDissolve }: {
  unionId: number
  dbNodes: DBRelationNode[]
  dbEdges: DBRelationEdge[]
  onClose: () => void
  onSaved: () => void
  onDissolve: () => void
}) {
  const personNodes = dbNodes.filter(n => n.node_type === 'person')
  const memberEdges = dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === unionId)
  const [members, setMembers] = useState(
    memberEdges.map(e => ({ edgeId: e.id, personId: e.from_node_id, role: e.label_from }))
  )
  const [saving, setSaving] = useState(false)
  const [confirmDissolve, setConfirmDissolve] = useState(false)

  const duplicate = members.length === 2 && members[0].personId === members[1].personId

  const handleSave = async () => {
    if (duplicate) return
    setSaving(true)
    await Promise.all(members.map(m =>
      (window as any).api.updateRelationEdge(m.edgeId, { from_node_id: m.personId, label_from: m.role.trim() })
    ))
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit union</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Change who is in this union or relabel their roles.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {members.map((m, i) => (
            <div key={m.edgeId} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Person {i + 1}</label>
                <select className="input" value={m.personId} style={{ fontSize: 13 }}
                  onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, personId: Number(e.target.value) } : x))}>
                  {personNodes.map(n => <option key={n.id} value={n.id}>{n.article_title || n.label}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Their role <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input" placeholder="husband of, wife of, partner of…" value={m.role}
                  onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
              </div>
            </div>
          ))}
          {duplicate && (
            <div style={{ fontSize: 12, color: '#e05555' }}>The two people in a union must be different.</div>
          )}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn"
            onClick={() => { if (!confirmDissolve) { setConfirmDissolve(true); return } onDissolve() }}
            style={{ color: confirmDissolve ? 'var(--danger-hover)' : '#e05555' }}
          >
            <Trash2 size={13} /> {confirmDissolve ? 'Confirm dissolve' : 'Dissolve union'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || duplicate}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Export menu ─────────────────────────────────────────────────────────────────

function ExportMenu({ onExport }: { onExport: (format: 'png' | 'svg') => void }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: open ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = open ? 'var(--bg-elevated)' : 'transparent'}
      >
        <Download size={13} /> Export <ChevronDown size={12} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 140, zIndex: 60, overflow: 'hidden' }}>
          {(['png', 'svg'] as const).map(fmt => (
            <button key={fmt}
              onClick={() => { setOpen(false); onExport(fmt) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', textAlign: 'left', color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
            >
              <Download size={13} /> {fmt.toUpperCase()} image
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Web Card Menu ─────────────────────────────────────────────────────────────

function WebMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); setConfirmDelete(false) }}
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 150, zIndex: 50, overflow: 'hidden' }}>
          <button
            onClick={e => { e.stopPropagation(); if (!confirmDelete) { setConfirmDelete(true); return } onDelete(); setOpen(false) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', textAlign: 'left', color: confirmDelete ? 'var(--danger-hover)' : '#e05555' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
          >
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Hub View ───────────────────────────────────────────────────────────────────

function RelationsHubView({ onOpenWeb }: { onOpenWeb: (web: RelationWeb) => void }) {
  const { currentCampaign, setView, setCampaignSubView } = useStore()
  const [webs, setWebs] = useState<RelationWeb[]>([])
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!currentCampaign) return
    ;(window as any).api.getRelationWebs(currentCampaign.id).then(setWebs)
  }, [currentCampaign?.id])



  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
            >
              <ArrowLeft size={14} /> Back
            </button>
            <Network size={22} color='#7F77DD' />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '0.03em', color: 'var(--text-primary)', margin: 0 }}>Relations</h1>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{webs.length} web{webs.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> New web
          </button>
        </div>
        <div style={{ height: 14 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {webs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, color: 'var(--text-muted)' }}>
            <Network size={32} strokeWidth={1} />
            <div style={{ fontSize: 14 }}>No webs yet — create one to start mapping relationships</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {webs.map(web => (
              <div key={web.id}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', cursor: 'pointer', transition: 'border-color var(--transition)', position: 'relative' }}
                onClick={() => onOpenWeb(web)}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-gold)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, background: 'var(--bg-elevated)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--gold)' }}>
                    <Network size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{web.name}</div>
                    {web.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{web.description}</div>
                    )}
                  </div>
                  <WebMenu onDelete={async () => {
                    await (window as any).api.deleteRelationWeb(web.id)
                    setWebs(prev => prev.filter(w => w.id !== web.id))
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 99 }}>{web.node_count} node{web.node_count !== 1 ? 's' : ''}</span>
                  {(web.template && web.template !== 'custom') && (
                    <span style={{ fontSize: 11, color: '#3C3489', padding: '2px 8px', background: '#EEEDFE', borderRadius: 99 }}>{TEMPLATE_CONFIG[web.template]?.label}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(web.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span> 
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewWebModal
          onClose={() => setShowNew(false)}
          onCreated={web => { setWebs(prev => [...prev, web]); setShowNew(false); onOpenWeb(web) }}
        />
      )}
    </div>
  )
}

// ── Canvas View ────────────────────────────────────────────────────────────────

function RelationsCanvasView({ web, onBack, focusArticleId }: { web: RelationWeb; onBack: () => void; focusArticleId?: number | null }) {
  const { currentCampaign, navigateToArticleByTitle } = useStore()
  // ReactFlow instance (captured on init) — used to pan/zoom to a deep-linked node.
  const rfRef = useRef<any>(null)
  const didFocusRef = useRef(false)

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [dbNodes, setDbNodes] = useState<DBRelationNode[]>([])
  const [dbEdges, setDbEdges] = useState<DBRelationEdge[]>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
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
    setNodes(data.nodes.map((n: DBRelationNode) => dbNodeToRF(n, handleCreateArticleRef.current, trackFilters, ranksById)))
    setEdges(data.edges.map((e: DBRelationEdge) => dbEdgeToRF(e)))
  }, [web.id, trackFilters, ranksById])

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

  // Re-render nodes when track filters or ranks change (without reloading from DB)
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const dbNode = dbNodes.find(d => String(d.id) === n.id)
      if (!dbNode) return n
      return dbNodeToRF(dbNode, handleCreateArticleRef.current, trackFilters, ranksById)
    }))
  }, [trackFilters, ranksById])

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

  const onEdgesDelete: OnEdgesDelete = useCallback(async (deletedEdges) => {
    for (const edge of deletedEdges) {
      await (window as any).api.deleteRelationEdge(Number(edge.id))
    }
    setDbEdges(prev => prev.filter(e => !deletedEdges.some(d => String(e.id) === d.id)))
    syncDerivedRelations()
  }, [syncDerivedRelations])

  const handleNodeAdded = (newNodes: DBRelationNode[]) => {
    setDbNodes(prev => [...prev, ...newNodes])
    setNodes(prev => [...prev, ...newNodes.map(n => dbNodeToRF(n, requestCreateArticle, trackFilters, ranksById))])
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
    setNodes(prev => [...prev, dbNodeToRF(node, requestCreateArticle, trackFilters, ranksById)])
  }, [dbNodes, web.id, trackFilters, requestCreateArticle])

  // Export the canvas as a PNG or SVG image of the whole graph.
  const exportImage = useCallback(async (format: 'png' | 'svg') => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!viewport || nodes.length === 0) return
    const bounds = getRectOfNodes(nodes)
    const imageWidth = Math.max(Math.round(bounds.width) + 160, 400)
    const imageHeight = Math.max(Math.round(bounds.height) + 160, 300)
    const [tx, ty, tScale] = getTransformForBounds(bounds, imageWidth, imageHeight, 0.5, 2)
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() || '#0d0b09'
    const opts: any = {
      backgroundColor: bg,
      width: imageWidth,
      height: imageHeight,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${tx}px, ${ty}px) scale(${tScale})`,
      },
    }
    try {
      const dataUrl = format === 'png'
        ? await toPng(viewport, { ...opts, pixelRatio: 2 })
        : await toSvg(viewport, opts)
      const a = document.createElement('a')
      a.download = `${(webName || 'relations').replace(/[^a-z0-9-_]+/gi, '_')}.${format}`
      a.href = dataUrl
      a.click()
    } catch (err) {
      console.error('Export failed:', err)
      setActionError('Export failed — see console for details.')
    }
  }, [nodes, webName])

  const saveWebName = async () => {
    if (!webName.trim()) { setWebName(web.name); setEditingName(false); return }
    await (window as any).api.updateRelationWeb(web.id, { name: webName.trim() })
    setEditingName(false)
  }

  useEffect(() => { if (editingName) nameRef.current?.focus() }, [editingName])

  const selectedNode = selectedNodeId ? dbNodes.find(n => String(n.id) === selectedNodeId) : null
  const selectedNodeEdges = selectedNodeId
    ? dbEdges.filter(e => String(e.from_node_id) === selectedNodeId || String(e.to_node_id) === selectedNodeId)
    : []

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'relative' }}>
        <button onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
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
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
          >
            {webName} <Pencil size={11} color="var(--text-muted)" />
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {!isTerritory && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Del to remove selected</span>
          )}
          {cfg.ranked && (
            <button
              onClick={() => setShowRankPanel(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: showRankPanel ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = showRankPanel ? 'var(--bg-elevated)' : 'transparent'}
            >
              <Layers size={13} /> Ranks
            </button>
          )}
          {(cfg.dagreDir || cfg.ranked) && (
            <button onClick={handleTidyUp}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <LayoutGrid size={13} /> Tidy up
            </button>
          )}
          {cfg.unionNodes && (
            <button onClick={addUnionNode}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid #AFA9EC', borderRadius: 'var(--radius-sm)', color: '#7F77DD', transition: 'background var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#EEEDFE'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <GitMerge size={13} /> Add union
            </button>
          )}
          {/* Filter button */}
          <button
            onClick={() => setShowFilterPanel(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              background: showFilterPanel ? 'var(--bg-elevated)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
              transition: 'background var(--transition)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = showFilterPanel ? 'var(--bg-elevated)' : 'transparent'}
          >
            <Filter size={13} />
            Tracks
            {Object.values(trackFilters).some(v => v.length > 0) && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7F77DD', flexShrink: 0 }} />
            )}
          </button>
          <ExportMenu onExport={exportImage} />
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
            onNodeClick={(_e: any, node: RFNode) => setSelectedNodeId(prev => prev === node.id ? null : node.id)}
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
                        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#5b9fe8', fontSize: 11, padding: 0 }}>
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
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#5b9fe8', fontSize: 11, padding: 0 }}>
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

// ── Page Root ──────────────────────────────────────────────────────────────────

export default function RelationsPage() {
  const { relationsOpenWebId, setRelationsOpenWebId, relationsFocusArticleId, setRelationsFocusArticleId, setHintContext } = useStore()
  useEffect(() => { setHintContext('relations'); return () => setHintContext(null) }, [setHintContext])
  const [openWeb, setOpenWeb] = useState<RelationWeb | null>(null)
  const [loading, setLoading] = useState(false)
  // Deep-link focus: select + center the node linked to this article on open.
  const [focusArticleId, setFocusArticleId] = useState<number | null>(null)

  // On mount: if the store has a pending web id, fetch and open it
  useEffect(() => {
    if (!relationsOpenWebId) return
    setLoading(true)
    ;(window as any).api.getRelationWebs
      ? (async () => {
          // We don't have a get-single endpoint, so we use the hub list and find the right one
          // The web data will be fetched inside RelationsCanvasView via getRelationWebData
          // We just need the web metadata (name etc) — synthesise a minimal object
          const id = relationsOpenWebId
          const focus = relationsFocusArticleId
          setRelationsOpenWebId(null) // clear so back-nav works normally
          setRelationsFocusArticleId(null)
          setFocusArticleId(focus)
          // Fetch the web from list to get its name
          const { currentCampaign } = useStore.getState()
          if (!currentCampaign) { setLoading(false); return }
          const webs: RelationWeb[] = await (window as any).api.getRelationWebs(currentCampaign.id)
          const web = webs.find(w => w.id === id)
          if (web) setOpenWeb(web)
          setLoading(false)
        })()
      : setLoading(false)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
      Loading…
    </div>
  )

  if (openWeb) {
    return <RelationsCanvasView key={openWeb.id} web={openWeb} focusArticleId={focusArticleId} onBack={() => { setOpenWeb(null); setFocusArticleId(null) }} />
  }

  return <RelationsHubView onOpenWeb={web => { setFocusArticleId(null); setOpenWeb(web) }} />
}