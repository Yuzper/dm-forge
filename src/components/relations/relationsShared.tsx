// path: src/components/relations/relationsShared.tsx
import { Fragment } from 'react'
// @ts-ignore
import {
  Edge as RFEdge, Node as RFNode,
  NodeTypes, EdgeTypes, MarkerType,
  Handle, Position, NodeProps, EdgeProps,
  getBezierPath, getSmoothStepPath, EdgeLabelRenderer, BaseEdge,
} from 'reactflow'

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
  ranks?: string   // JSON string of Rank[]
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
  onCreateArticle: () => void
}

export interface EdgeData {
  dbId: number
  labelFrom: string
  labelTo: string
  edgeType: 'standard' | 'person_to_union' | 'union_to_child' | 'reports_to'
}

// ── Track definitions (mirrored from WikiPage) ─────────────────────────────────

export const ARTICLE_TRACKS: Partial<Record<string, Record<string, string[]>>> = {
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

export function dbNodeToRF(
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
      // Portraits only make sense for people — characters and player characters.
      portrait: (node.article_type === 'character' || node.article_type === 'playerCharacter')
        ? node.portrait_image ?? null
        : null,
      tracks: parsedTracks,
      trackFilters,
      rankName: rank?.name ?? null,
      rankColor: rank?.color ?? null,
      onCreateArticle: () => onCreateArticle(node.id),
    },
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
      {data.portrait && (
        <img
          src={`file://${data.portrait}`}
          alt=""
          draggable={false}
          style={{
            width: 32, height: 32, borderRadius: '50%', objectFit: 'cover',
            border: '1px solid var(--border-light)', flexShrink: 0,
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

export const NODE_TYPES: NodeTypes = { relationNode: RelationNodeComponent }
export const EDGE_TYPES: EdgeTypes = { relationEdge: RelationEdgeComponent }
