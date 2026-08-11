// path: src/components/wiki/ArticleRelationsPanel.tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store/store'
import { Plus, Network, ChevronRight, ExternalLink, Skull } from 'lucide-react'
import type { ArticleType } from '../../types'
import { NewWebModal } from '../relations/relationsModals'
import { sidebarSectionLabel } from './wikiConstants'
import { ARTICLE_TYPE_COLORS } from '../../constants/articleTypes'
import { useArticleContextMenu } from '../../hooks/useContextMenu'

// ── Article Relations Panel ────────────────────────────────────────────────────

interface ArticleRelationRow {
  edge_id: number
  web_id: number
  web_name: string
  from_node_id: number
  to_node_id: number
  from_article_id: number | null
  to_article_id: number | null
  from_article_title: string | null
  to_article_title: string | null
  from_node_label: string
  to_node_label: string
  from_vitality: string | null
  to_vitality: string | null
  label_from: string
  label_to: string
  is_rank?: boolean
}

// List the relation webs linked to this article, and create a new one (any
// template) pre-linked to it via the shared New-web modal.
// Article-type-specific suggestion for what a web living inside this article could map.
function webSectionHint(articleType: ArticleType): string {
  switch (articleType) {
    case 'faction':
      return 'Map a structure within this faction — its chain of command, ranks, cells, or alliances and rivalries between members.'
    case 'religion':
      return 'Map a structure within this faith — its clergy hierarchy, sects, holy orders, or pantheon of deities.'
    case 'location':
      return 'Map a structure rooted in this place — the ruling council or court, the noble houses, or the guilds and factions that operate here.'
    case 'character':
    case 'playerCharacter':
      return 'Map this character’s personal web — their household and retinue, family tree, or circle of allies and rivals.'
    case 'culture':
      return 'Map the social fabric of this culture — its clans, castes, or kinship and lineage ties.'
    case 'creature':
      return 'Map a structure for this creature — a pack, swarm, hive, or brood and its hierarchy.'
    case 'quest':
      return 'Map this quest’s shape — its branching steps, dependencies, or the factions pulling its strings.'
    default:
      return 'Add an optional hierarchy, family tree, or other relation web tied to this article.'
  }
}

export function RelationWebsSection({ articleId, articleTitle, articleType, canCreate, webs, loaded, onReload, onOpenWeb }: {
  articleId: number
  articleTitle: string
  articleType: ArticleType
  canCreate: boolean
  webs: any[]
  loaded: boolean
  onReload: () => void
  onOpenWeb: (webId: number) => void
}) {
  const [showCreate, setShowCreate] = useState(false)

  if (!loaded) return null
  // In read mode with no linked webs, show nothing — creation is edit-only.
  if (!canCreate && webs.length === 0) return null

  const btnStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px',
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left',
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={sidebarSectionLabel}>Webs</div>
      {canCreate && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 8 }}>
          {webSectionHint(articleType)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {webs.map(w => (
          <button key={w.id} style={btnStyle} onClick={() => onOpenWeb(w.id)}
            className="hover-bg-elevated">
            <Network size={13} color="#7F77DD" />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.node_count} node{w.node_count !== 1 ? 's' : ''}</span>
          </button>
        ))}
        {canCreate && (
          <button style={{ ...btnStyle, borderStyle: 'dashed', justifyContent: 'center', color: '#7F77DD' }}
            onClick={() => setShowCreate(true)}
            className="hover-bg-elevated">
            <Plus size={13} /> Create web
          </button>
        )}
      </div>
      {showCreate && (
        <NewWebModal
          lockedArticle={{ id: articleId, title: articleTitle }}
          onClose={() => setShowCreate(false)}
          onCreated={(w: any) => { setShowCreate(false); onReload(); onOpenWeb(w.id) }}
        />
      )}
    </div>
  )
}

// Named member count: article-backed members (characters with Faction/Religion → this).
export function MemberCountSection({ articleId, followerEstimate }: { articleId: number; followerEstimate?: string }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!articleId) return
    ;(window as any).api.getArticleMemberCount(articleId).then((c: number) => setCount(c))
  }, [articleId])
  if (count === null) return null
  const est = (followerEstimate || '').trim()
  if (!est && count === 0) return null
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Followers</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
        {est ? est : '—'}<span style={{ color: 'var(--text-muted)' }}> · {count} named</span>
      </span>
    </div>
  )
}

// Derived, read-only affiliations for characters/PCs. The faction/org/religion
// articles that own a web this character is a node in. Webs are the source of
// truth — these fields are computed, never stored, so they can't drift.
export function AffiliationsSection({ articleId }: { articleId: number }) {
  const { navigateToArticleByTitle } = useStore()
  const articleMenu = useArticleContextMenu()
  const [items, setItems] = useState<{ id: number; title: string; article_type: string }[]>([])

  useEffect(() => {
    if (!articleId) return
    ;(window as any).api.getArticleAffiliations(articleId).then((a: any[]) => setItems(a || []))
  }, [articleId])

  const religion = items.find(a => a.article_type === 'religion')
  const factions = items.filter(a => a.article_type === 'faction')
  if (!religion && factions.length === 0) return null

  const chip = (a: { id: number; title: string; article_type: string }) => {
    const color = ARTICLE_TYPE_COLORS[a.article_type] || '#8a8a8a'
    return (
      <button
        key={a.id}
        onClick={() => navigateToArticleByTitle(a.title)}
        onContextMenu={articleMenu(a)}
        title={`Go to ${a.title}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          border: `1px solid ${color}44`, background: `${color}12`, color,
          '--hover-accent': `${color}22`,
        } as React.CSSProperties}
        className="hover-accent-bg"
      >
        <ExternalLink size={10} /> {a.title}
      </button>
    )
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={sidebarSectionLabel}>Affiliations</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
        From relation webs
      </div>
      {religion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: factions.length ? 8 : 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 56, flexShrink: 0 }}>Religion</span>
          {chip(religion)}
        </div>
      )}
      {factions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 56, flexShrink: 0, paddingTop: 3 }}>
            Faction{factions.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {factions.map(chip)}
          </div>
        </div>
      )}
    </div>
  )
}

// Derived, read-only geography for a location: the containment path up the
// "Within" chain (root-first) plus the locations nested directly inside it.
export function GeographySection({ articleId, reloadKey }: { articleId: number; reloadKey?: unknown }) {
  const { navigateToArticleByTitle } = useStore()
  const articleMenu = useArticleContextMenu()
  const [data, setData] = useState<{ ancestors: { id: number; title: string }[]; children: { id: number; title: string }[] }>({ ancestors: [], children: [] })

  useEffect(() => {
    if (!articleId) return
    ;(window as any).api.getArticleGeography(articleId).then((d: any) => setData(d || { ancestors: [], children: [] }))
  }, [articleId, reloadKey])

  const { ancestors, children } = data
  if (ancestors.length === 0 && children.length === 0) return null

  const color = ARTICLE_TYPE_COLORS.location || '#c8a84b'
  const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    fontSize: 12, color, fontWeight: 500, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  const chip = (c: { id: number; title: string }) => (
    <button key={c.id} onClick={() => navigateToArticleByTitle(c.title)} onContextMenu={articleMenu({ ...c, article_type: 'location' })} title={`Go to ${c.title}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px',
        borderRadius: 99, fontSize: 11, cursor: 'pointer',
        border: `1px solid ${color}44`, background: `${color}12`, color,
        '--hover-accent': `${color}22`,
      } as React.CSSProperties}
      className="hover-accent-bg">
      {c.title}
    </button>
  )

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={sidebarSectionLabel}>Geography</div>

      {ancestors.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: children.length ? 10 : 0 }}>
          {ancestors.map((a, i) => (
            <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
              <button onClick={() => navigateToArticleByTitle(a.title)} onContextMenu={articleMenu({ ...a, article_type: 'location' })} title={`Go to ${a.title}`} style={linkStyle}
                className="hover-underline">
                {a.title}
              </button>
            </span>
          ))}
          <ChevronRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>here</span>
        </div>
      )}

      {children.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Contains <span style={{ fontWeight: 400 }}>· {children.length}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {children.map(chip)}
          </div>
        </div>
      )}
    </div>
  )
}

export function ArticleRelationsPanel({
  articleId,
  onOpenWeb,
}: {
  articleId: number
  onOpenWeb: (webId: number) => void
}) {
  const { currentCampaign } = useStore()
  const [rows, setRows] = useState<ArticleRelationRow[]>([])

  useEffect(() => {
    if (!currentCampaign || !articleId) return
    ;(window as any).api.getArticleRelations(articleId, currentCampaign.id).then(setRows)
  }, [articleId, currentCampaign?.id])

  if (rows.length === 0) return null

  // Group by web
  const byWeb = rows.reduce<Record<number, { webName: string; rows: ArticleRelationRow[] }>>(
    (acc, row) => {
      if (!acc[row.web_id]) acc[row.web_id] = { webName: row.web_name, rows: [] }
      acc[row.web_id].rows.push(row)
      return acc
    },
    {}
  )

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 16px 4px' }}>
        <div style={sidebarSectionLabel}>Relations</div>
      </div>
      {Object.entries(byWeb).map(([webIdStr, { webName, rows: webRows }]) => (
        <div key={webIdStr}>
          <button
            onClick={() => onOpenWeb(Number(webIdStr))}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 16px 3px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '1px solid var(--border-light)', transition: 'color var(--transition)', textAlign: 'left' }}
            className="hover-text-secondary"
          >
            <Network size={10} /> {webName}
          </button>
          {webRows.map(row => {
            // Rank is an attribute of the current article, not a link — render it as a label line.
            if (row.is_rank) {
              return (
                <div key={row.edge_id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 16px' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{row.to_node_label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>rank</span>
                </div>
              )
            }
            const isFrom = row.from_article_id === articleId
            const otherName = isFrom
              ? (row.to_article_title || row.to_node_label)
              : (row.from_article_title || row.from_node_label)
            const relationLabel = isFrom ? row.label_to : row.label_from
            const otherLinked = isFrom ? row.to_article_id !== null : row.from_article_id !== null
            const otherVitality = isFrom ? row.to_vitality : row.from_vitality
            const dead = otherVitality === 'Dead'

            return (
              <div
                key={row.edge_id}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 16px', cursor: 'default' }}
              >
                {dead && <Skull size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: otherLinked ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: otherLinked ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {otherName}
                </span>
                {relationLabel && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{relationLabel}</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ height: 8 }} />
    </div>
  )
}
