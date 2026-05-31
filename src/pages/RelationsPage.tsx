// path: src/pages/RelationsPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useStore } from '../store/store'
// @ts-ignore
import ReactFlow, {
  Background, BackgroundVariant, Controls,
  useNodesState, useEdgesState,
  Connection, Edge as RFEdge, Node as RFNode,
  NodeTypes, EdgeTypes, MarkerType,
  Handle, Position, NodeProps, EdgeProps,
  getBezierPath, EdgeLabelRenderer, BaseEdge,
  OnConnect, OnNodesDelete, OnEdgesDelete,
  addEdge,
} from 'reactflow'
// @ts-ignore
import 'reactflow/dist/style.css'
import {
  Network, Plus, ArrowLeft, Trash2, Pencil, Check, X, Search, ExternalLink, Filter, ChevronDown, MoreHorizontal, GitMerge, LayoutGrid,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type WebTemplate =
  | 'family_tree' | 'org_hierarchy' | 'faction_web' | 'social_web'
  | 'quest_chain' | 'lore_causality' | 'trade_network' | 'territory' | 'custom'

interface TemplateConfig {
  label: string
  unionNodes: boolean
  dagreDir: 'TB' | 'LR' | null
  defaultEdgeLabels: string[]
}

const TEMPLATE_CONFIG: Record<WebTemplate, TemplateConfig> = {
  family_tree:    { label: 'Family tree',      unionNodes: true,  dagreDir: 'TB', defaultEdgeLabels: ['husband of', 'wife of', 'partner of'] },
  org_hierarchy:  { label: 'Org / hierarchy',  unionNodes: false, dagreDir: 'TB', defaultEdgeLabels: ['reports to', 'manages'] },
  faction_web:    { label: 'Faction web',      unionNodes: false, dagreDir: null, defaultEdgeLabels: ['allied with', 'rivals'] },
  social_web:     { label: 'Social web',       unionNodes: false, dagreDir: null, defaultEdgeLabels: ['knows', 'trusts', 'hates'] },
  quest_chain:    { label: 'Quest chain',      unionNodes: false, dagreDir: 'LR', defaultEdgeLabels: ['unlocks', 'requires'] },
  lore_causality: { label: 'Lore / causality', unionNodes: false, dagreDir: 'LR', defaultEdgeLabels: ['caused', 'led to'] },
  trade_network:  { label: 'Trade network',    unionNodes: false, dagreDir: null, defaultEdgeLabels: ['trades with', 'supplies'] },
  territory:      { label: 'Territory',        unionNodes: false, dagreDir: null, defaultEdgeLabels: ['controls', 'borders'] },
  custom:         { label: 'Custom',           unionNodes: false, dagreDir: null, defaultEdgeLabels: [] },
}

interface RelationWeb {
  id: number
  campaign_id: number
  name: string
  description: string
  template: WebTemplate
  node_count: number
  updated_at: string
}

interface DBRelationNode {
  id: number
  web_id: number
  article_id: number | null
  label: string
  node_type: 'person' | 'union'
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
  edge_type: 'standard' | 'person_to_union' | 'union_to_child'
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
  onCreateArticle: () => void
}

interface EdgeData {
  dbId: number
  labelFrom: string
  labelTo: string
  edgeType: 'standard' | 'person_to_union' | 'union_to_child'
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
  location: { State: [], Size: [], Plane: [], Region: [] },
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
  vendor: { Shop_Type: [], Status: [], Location: [], Owner: [] },
}

const ALL_ARTICLE_TYPES = [
  'character','playerCharacter','creature','location','faction','organization',
  'quest','item','event','culture','religion','lore','note','other','vendor',
]

const ARTICLE_TYPE_LABELS: Record<string, string> = {
  character: 'Character', playerCharacter: 'Player Character', creature: 'Creature',
  location: 'Location', faction: 'Faction', organization: 'Organization',
  quest: 'Quest', item: 'Item', event: 'Event', culture: 'Culture',
  religion: 'Religion', lore: 'Lore', note: 'Note', other: 'Other', vendor: 'Vendor',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function vitalityColor(v: string | null | undefined): string {
  if (!v) return 'transparent'
  if (v === 'Alive' || v === 'Immortal') return '#3dbf7f'
  if (v === 'Dead') return '#e05555'
  return '#8a8a8a'
}

function isDead(v: string | null | undefined): boolean {
  return v === 'Dead'
}

function dbNodeToRF(
  node: DBRelationNode,
  onCreateArticle: (nodeId: number) => void,
  trackFilters: Record<string, string[]>,
): RFNode<NodeData> {
  let parsedTracks: Record<string, string> = {}
  if (node.tracks) {
    try { parsedTracks = JSON.parse(node.tracks) } catch {}
  }
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
    type: 'relationEdge',
    data: { dbId: edge.id, labelFrom: edge.label_from, labelTo: edge.label_to, edgeType },
    markerEnd: directed
      ? { type: MarkerType.ArrowClosed, color: 'var(--border-light)', width: 14, height: 14 }
      : undefined,
  }
}

// ── Custom Node ────────────────────────────────────────────────────────────────

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
        <Handle type="target" position={Position.Top}    style={{ ...handleStyle, top: -4 }} />
        <Handle type="target" position={Position.Left}   style={{ ...handleStyle, left: -4 }} />
        ∪
        <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -4 }} />
        <Handle type="source" position={Position.Right}  style={{ ...handleStyle, right: -4 }} />
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
        fontFamily: 'var(--font-ui)',
        cursor: 'grab',
        opacity: dead ? 0.45 : 1,
        filter: dead ? 'grayscale(0.6)' : 'none',
        transition: 'opacity 0.15s, filter 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top}    style={{ ...handleStyle, top: -4 }} />
      <Handle type="target" position={Position.Left}   style={{ ...handleStyle, left: -4 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
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
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, bottom: -4 }} />
      <Handle type="source" position={Position.Right}  style={{ ...handleStyle, right: -4 }} />
    </div>
  )
}

// ── Custom Edge ────────────────────────────────────────────────────────────────

function RelationEdgeComponent({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd, selected }: EdgeProps<EdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const edgeType = data?.edgeType || 'standard'
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

// ── Modals ─────────────────────────────────────────────────────────────────────

function NewWebModal({ onClose, onCreated }: { onClose: () => void; onCreated: (web: RelationWeb) => void }) {
  const { currentCampaign } = useStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<WebTemplate>('custom')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim() || !currentCampaign) return
    setSaving(true)
    const web = await (window as any).api.createRelationWeb({
      campaign_id: currentCampaign.id, name: name.trim(), description: description.trim(), template,
    })
    onCreated(web)
  }

  const TEMPLATES: { id: WebTemplate; label: string; desc: string }[] = [
    { id: 'family_tree',    label: 'Family tree',      desc: 'Dynasties, bloodlines' },
    { id: 'org_hierarchy',  label: 'Org / hierarchy',  desc: 'Commands, ranks, guilds' },
    { id: 'faction_web',    label: 'Faction web',      desc: 'Alliances, rivalries' },
    { id: 'social_web',     label: 'Social web',       desc: 'Personal relationships' },
    { id: 'quest_chain',    label: 'Quest chain',      desc: 'Dependencies, unlocks' },
    { id: 'lore_causality', label: 'Lore / causality', desc: 'Events, cause & effect' },
    { id: 'trade_network',  label: 'Trade network',    desc: 'Goods, routes' },
    { id: 'territory',      label: 'Territory',        desc: 'Control, influence' },
    { id: 'custom',         label: 'Custom',           desc: 'No constraints' },
  ]

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
          </div>
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
      </div>
    </div>
  )
}

function AddNodeModal({ webId, onClose, onAdded }: {
  webId: number; onClose: () => void; onAdded: (node: DBRelationNode) => void
}) {
  const { currentCampaign } = useStore()
  // 'search' = link existing article, 'new' = create a stub node
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const [selectedArticle, setSelectedArticle] = useState<{ id: number; title: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!currentCampaign || !search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const articles = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: search.trim(), searchTitle: true, searchTags: false,
      })
      setResults(articles.slice(0, 8))
    }, 200)
  }, [search, currentCampaign])

  const handleAdd = async () => {
    if (mode === 'search' && !selectedArticle) return
    if (mode === 'new' && !name.trim()) return
    setSaving(true)
    const node = await (window as any).api.createRelationNode({
      web_id: webId,
      label: mode === 'search' ? (name.trim() || selectedArticle!.title) : name.trim(),
      article_id: mode === 'search' ? (selectedArticle?.id ?? null) : null,
      pos_x: Math.round((80 + Math.random() * 300) / 20) * 20,
      pos_y: Math.round((80 + Math.random() * 200) / 20) * 20,
    })
    onAdded(node)
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
        <div className="modal-title">Add node</div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', gap: 3, padding: 3,
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
        }}>
          <button style={tabStyle(mode === 'search')} onClick={() => { setMode('search'); setName('') }}>
            🔗 Link existing article
          </button>
          <button style={tabStyle(mode === 'new')} onClick={() => { setMode('new'); setSelectedArticle(null); setSearch('') }}>
            ✦ New node (no article yet)
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'search' ? (
            <>
              <div className="input-group">
                <label className="input-label">Search for an existing article</label>
                {selectedArticle ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3dbf7f', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{selectedArticle.title}</span>
                    <button onClick={() => { setSelectedArticle(null); setSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                      <input className="input" style={{ paddingLeft: 30 }} placeholder="Search articles…"
                        value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                    </div>
                    {results.length > 0 && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
                        {results.map(a => (
                          <button key={a.id}
                            onClick={() => { setSelectedArticle(a); setSearch('') }}
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
                  </>
                )}
              </div>
              {selectedArticle && (
                <div className="input-group">
                  <label className="input-label">Override label <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="input"
                    placeholder={`${selectedArticle.title} (default)`}
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
            disabled={saving || (mode === 'search' ? !selectedArticle : !name.trim())}>
            {saving ? 'Adding…' : 'Add node'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddUnionModal({ webId, personNodes, suggestions, onClose, onCreated }: {
  webId: number
  personNodes: DBRelationNode[]
  suggestions: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [p1, setP1] = useState<number | ''>('')
  const [p2, setP2] = useState<number | ''>('')
  const [label1, setLabel1] = useState(suggestions[0] || '')
  const [label2, setLabel2] = useState(suggestions[1] || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!p1 || !p2) return
    setSaving(true)
    setError(null)
    try {
      await (window as any).api.createUnionNode({
        web_id: webId, person1_id: p1, person2_id: p2,
        label1: label1.trim(), label2: label2.trim(),
      })
      onCreated()
    } catch (err: any) {
      console.error('createUnionNode failed:', err)
      setError(err?.message || 'Failed to create union — check the console for details.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add union</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          A union node represents a couple. Connect two people — their children then link to the union.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="input-group">
            <label className="input-label">First person</label>
            <select className="input" value={p1} onChange={e => setP1(Number(e.target.value) || '')} style={{ fontSize: 13 }}>
              <option value="">Select…</option>
              {personNodes.filter(n => n.id !== p2).map(n => <option key={n.id} value={n.id}>{n.article_title || n.label}</option>)}
            </select>
          </div>
          {p1 !== '' && (
            <div className="input-group">
              <label className="input-label">Their role <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input className="input" placeholder="husband of, wife of, partner of…" value={label1} onChange={e => setLabel1(e.target.value)} />
            </div>
          )}
          <div className="input-group">
            <label className="input-label">Second person</label>
            <select className="input" value={p2} onChange={e => setP2(Number(e.target.value) || '')} style={{ fontSize: 13 }}>
              <option value="">Select…</option>
              {personNodes.filter(n => n.id !== p1).map(n => <option key={n.id} value={n.id}>{n.article_title || n.label}</option>)}
            </select>
          </div>
          {p2 !== '' && (
            <div className="input-group">
              <label className="input-label">Their role <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input className="input" placeholder="husband of, wife of, partner of…" value={label2} onChange={e => setLabel2(e.target.value)} />
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!p1 || !p2 || saving}>
            {saving ? 'Creating…' : 'Create union'}
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
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', textAlign: 'left', color: confirmDelete ? '#ff7777' : '#e05555' }}
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

function RelationsCanvasView({ web, onBack }: { web: RelationWeb; onBack: () => void }) {
  const { currentCampaign, navigateToArticleByTitle, setRelationsOpenWebId } = useStore()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [dbNodes, setDbNodes] = useState<DBRelationNode[]>([])
  const [dbEdges, setDbEdges] = useState<DBRelationEdge[]>([])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [showAddUnion, setShowAddUnion] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null)
  const [pendingConnectionMode, setPendingConnectionMode] = useState<'standard' | 'person_to_union'>('standard')
  const [editingEdge, setEditingEdge] = useState<DBRelationEdge | null>(null)
  const [webName, setWebName] = useState(web.name)
  const [editingName, setEditingName] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // ── Track filters ─────────────────────────────────────────────────────────
  // { [articleType]: string[] } — keys to display in nodes of that type
  const [trackFilters, setTrackFilters] = useState<Record<string, string[]>>(() => {
    try {
        const saved = localStorage.getItem('relations_track_filters')
        return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  useEffect(() => {
    try {
        localStorage.setItem('relations_track_filters', JSON.stringify(trackFilters))
    } catch {}
  }, [trackFilters])

  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // Derive which article types are actually present in this web
  const articleTypesInWeb = Array.from(
    new Set(dbNodes.map(n => n.article_type).filter(Boolean) as string[])
  )

  const cfg = TEMPLATE_CONFIG[web.template] || TEMPLATE_CONFIG.custom

  // ── Use a ref so loadWebData can be called from handleTidyUp without a dep cycle ──
  const loadWebDataRef = useRef<() => void>(() => {})

  const loadWebData = useCallback(async () => {
    const data = await (window as any).api.getRelationWebData(web.id)
    setDbNodes(data.nodes)
    setDbEdges(data.edges)
    setNodes(data.nodes.map((n: DBRelationNode) => dbNodeToRF(n, handleCreateArticleRef.current, trackFilters)))
    setEdges(data.edges.map((e: DBRelationEdge) => dbEdgeToRF(e)))
  }, [web.id, trackFilters])

  useEffect(() => { loadWebDataRef.current = loadWebData }, [loadWebData])
  useEffect(() => { loadWebData() }, [web.id])

  // Re-render nodes when trackFilters change (without reloading from DB)
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const dbNode = dbNodes.find(d => String(d.id) === n.id)
      if (!dbNode) return n
      return dbNodeToRF(dbNode, handleCreateArticleRef.current, trackFilters)
    }))
  }, [trackFilters])

  const syncDerivedRelations = useCallback(async () => {
    if (web.template !== 'family_tree') return
    try { await (window as any).api.syncDerivedRelations(web.id) } catch {}
  }, [web.id, web.template])

  const handleTidyUp = useCallback(async () => {
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
  }, [dbNodes, dbEdges, cfg.dagreDir])

  // handleCreateArticle defined after loadWebData so it can call both it and syncDerivedRelations
  const handleCreateArticleRef = useRef<(nodeId: number) => void>(() => {})
  const handleCreateArticle = useCallback(async (nodeId: number) => {
    if (!currentCampaign) return
    const node = dbNodes.find(n => n.id === nodeId)
    if (!node) return
    const article = await (window as any).api.createArticle({
      campaign_id: currentCampaign.id, title: node.label, article_type: 'character',
    })
    await (window as any).api.updateRelationNode(nodeId, { article_id: article.id })
    loadWebDataRef.current()
    syncDerivedRelations()
  }, [currentCampaign, dbNodes, syncDerivedRelations])
  useEffect(() => { handleCreateArticleRef.current = handleCreateArticle }, [handleCreateArticle])

  const onNodeDragStop = useCallback(async (_evt: any, node: RFNode) => {
    await (window as any).api.updateRelationNode(Number(node.id), {
      pos_x: node.position.x, pos_y: node.position.y,
    })
  }, [])

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    const src = dbNodes.find(n => String(n.id) === connection.source)
    const tgt = dbNodes.find(n => String(n.id) === connection.target)
    // union → person: create union_to_child edge immediately, no label needed
    if (src?.node_type === 'union' && tgt?.node_type === 'person') {
      ;(async () => {
        const edge = await (window as any).api.createRelationEdge({
          web_id: web.id,
          from_node_id: Number(connection.source),
          to_node_id: Number(connection.target),
          label_from: '', label_to: '', edge_type: 'union_to_child',
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
  }, [dbNodes, web.id, syncDerivedRelations])

  const handleEdgeLabelConfirm = async (labelFrom: string, labelTo: string) => {
    if (!pendingConnection) return
    const edge = await (window as any).api.createRelationEdge({
      web_id: web.id,
      from_node_id: Number(pendingConnection.source),
      to_node_id: Number(pendingConnection.target),
      label_from: labelFrom, label_to: labelTo,
      edge_type: pendingConnectionMode,
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

  const handleNodeAdded = (node: DBRelationNode) => {
    setDbNodes(prev => [...prev, node])
    setNodes(prev => [...prev, dbNodeToRF(node, handleCreateArticle, trackFilters)])
    setShowAddNode(false)
    syncDerivedRelations()
  }

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
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Del to remove selected</span>
          {cfg.dagreDir && (
            <button onClick={handleTidyUp}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', transition: 'background var(--transition)' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <LayoutGrid size={13} /> Tidy up
            </button>
          )}
          {cfg.unionNodes && (
            <button onClick={() => setShowAddUnion(true)}
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
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowAddNode(true)}>
            <Plus size={13} /> Add node
          </button>
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
      </div>

      {/* Canvas + Detail panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_e: any, node: RFNode) => setSelectedNodeId(prev => prev === node.id ? null : node.id)}
            onEdgeDoubleClick={(_e: any, edge: RFEdge) => {
              const db = dbEdges.find(e => String(e.id) === edge.id)
              if (db) setEditingEdge(db)
            }}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            snapToGrid snapGrid={[20, 20]}
            fitView fitViewOptions={{ padding: 0.3 }}
            deleteKeyCode={['Delete', 'Backspace']}
            style={{ background: 'var(--bg-base)' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
            <Controls />
          </ReactFlow>
        </div>

        {selectedNode && (
          <div style={{ width: 240, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--bg-surface)', overflow: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: selectedNode.article_id && selectedNode.vitality ? vitalityColor(selectedNode.vitality) : 'transparent',
                  border: selectedNode.article_id && selectedNode.vitality ? 'none' : '1.5px dashed var(--border-light)',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedNode.article_title || selectedNode.label}
                </span>
              </div>
              {selectedNode.article_id ? (
                <button onClick={() => navigateToArticleByTitle(selectedNode.article_title || selectedNode.label)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#5b9fe8', fontSize: 11, padding: 0 }}>
                  <ExternalLink size={11} /> Open article
                </button>
              ) : (
                <span style={{ fontSize: 11, color: '#7F77DD', cursor: 'pointer' }}
                  onClick={() => handleCreateArticle(selectedNode.id)}>
                  + Create article
                </span>
              )}
            </div>

            {selectedNodeEdges.length > 0 && (
              <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  {web.template === 'family_tree' ? 'Family relations' : 'Edges'}
                </div>
                {web.template === 'family_tree' && selectedNodeId ? (() => {
                  const nid = Number(selectedNodeId)
                  const partners: any[] = [], children: any[] = [], parents: any[] = [], siblings: any[] = []
                  const sibIds = new Set<number>()

                  dbEdges.filter(e => e.edge_type === 'person_to_union' && e.from_node_id === nid).forEach(ue => {
                    dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === ue.to_node_id && e.from_node_id !== nid).forEach(e => {
                      const p = dbNodes.find(n => n.id === e.from_node_id)
                      if (p) partners.push({ name: p.article_title || p.label, role: ue.label_from, vitality: p.vitality })
                    })
                    dbEdges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === ue.to_node_id).forEach(e => {
                      const c = dbNodes.find(n => n.id === e.to_node_id)
                      if (c) children.push({ name: c.article_title || c.label, vitality: c.vitality })
                    })
                  })
                  dbEdges.filter(e => e.edge_type === 'union_to_child' && e.to_node_id === nid).forEach(pe => {
                    dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === pe.from_node_id).forEach(e => {
                      const p = dbNodes.find(n => n.id === e.from_node_id)
                      if (p) parents.push({ name: p.article_title || p.label, role: (e.label_from || '').replace(/ of$/i, '') || 'parent', vitality: p.vitality })
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
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: vitalityColor(item.vitality), flexShrink: 0 }} />
                          <span style={{ flex: 1, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          {item.role && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.role}</span>}
                        </div>
                      ))}
                    </div>
                  )
                  return (
                    <div>
                      <Sec label="Partners" items={partners} />
                      <Sec label="Children" items={children} />
                      <Sec label="Parents" items={parents} />
                      <Sec label="Siblings" items={siblings} />
                      {partners.length + children.length + parents.length + siblings.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No family relations yet.</div>
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
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: vitalityColor(other?.vitality), flexShrink: 0 }} />
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

      {showAddNode && <AddNodeModal webId={web.id} onClose={() => setShowAddNode(false)} onAdded={handleNodeAdded} />}
      {showAddUnion && (
        <AddUnionModal
          webId={web.id}
          personNodes={dbNodes.filter(n => n.node_type === 'person')}
          suggestions={cfg.defaultEdgeLabels}
          onClose={() => setShowAddUnion(false)}
          onCreated={async () => { setShowAddUnion(false); await loadWebData(); syncDerivedRelations() }}
        />
      )}
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
    </div>
  )
}

// ── Page Root ──────────────────────────────────────────────────────────────────

export default function RelationsPage() {
  const { relationsOpenWebId, setRelationsOpenWebId } = useStore()
  const [openWeb, setOpenWeb] = useState<RelationWeb | null>(null)
  const [loading, setLoading] = useState(false)

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
          setRelationsOpenWebId(null) // clear so back-nav works normally
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
    return <RelationsCanvasView web={openWeb} onBack={() => setOpenWeb(null)} />
  }

  return <RelationsHubView onOpenWeb={setOpenWeb} />
}