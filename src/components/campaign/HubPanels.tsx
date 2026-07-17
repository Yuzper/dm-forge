// path: src/components/campaign/HubPanels.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store/store'
import { Eye } from 'lucide-react'
import type { WikiHealth, Clock } from '../../types'
import { useMenuClose } from '../../hooks/useMenuClose'
import { ARTICLE_TYPE_COLORS } from '../../constants/articleTypes'
import { ClockList } from '../clocks/ClockWidget'
import { CLOCKS_INFO } from '../clocks/ClocksSection'
import { InfoHint } from '../InfoHint'

// Card chrome for the classic hub grid; `bare` panels are wrapped by the
// map hub's floating overlay shell instead and skip background + title.
const panelCardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', padding: '16px 18px',
}
const bareEmptyStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 0',
}

// ── Hub Settings ──────────────────────────────────────────────────────────────

export type HubPanelKey = 'worldMap' | 'recentlyUpdated' | 'articlesByType' | 'sessionTimeline' | 'activeQuests' | 'wikiHealth' | 'clocks'


export const HUB_PANEL_DEFAULTS: Record<HubPanelKey, boolean> = {
  worldMap: true, recentlyUpdated: true, articlesByType: true, sessionTimeline: true, activeQuests: true, wikiHealth: true, clocks: true,
}

export function loadHubPanels(campaignId: number): Record<HubPanelKey, boolean> {
  try {
    const stored = localStorage.getItem(`hub-panels-${campaignId}`)
    if (stored) return { ...HUB_PANEL_DEFAULTS, ...JSON.parse(stored) }
  } catch {}
  return { ...HUB_PANEL_DEFAULTS }
}

export function saveHubPanels(campaignId: number, panels: Record<HubPanelKey, boolean>) {
  localStorage.setItem(`hub-panels-${campaignId}`, JSON.stringify(panels))
}

const PANEL_LABELS: Record<HubPanelKey, string> = {
  worldMap: 'World map',
  recentlyUpdated: 'Recently updated',
  articlesByType: 'Articles by type',
  sessionTimeline: 'Session timeline',
  activeQuests: 'Active quests',
  wikiHealth: 'Needs attention',
  clocks: 'Ticking clocks',
}

export function HubSettingsMenu({ panels, onChange }: {
  panels: Record<HubPanelKey, boolean>
  onChange: (k: HubPanelKey, v: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useMenuClose(open, ref, setOpen)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Customise hub"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)' }}
      >
        <Eye size={11} /> Customise
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 190, zIndex: 50, overflow: 'hidden' }}>
          {(Object.keys(PANEL_LABELS) as HubPanelKey[]).map((key, i) => (
            <div key={key}>
              {i === 1 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}
              <button
                onClick={() => onChange(key, !panels[key])}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left', transition: 'background 80ms' }}
                className="hover-bg"
              >
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${panels[key] ? 'var(--gold)' : 'var(--border)'}`, background: panels[key] ? 'var(--gold)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 120ms' }}>
                  {panels[key] && <span style={{ fontSize: 9, color: '#000', fontWeight: 700, lineHeight: 1 }}>✓</span>}
                </div>
                {PANEL_LABELS[key]}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Recently Updated Panel ─────────────────────────────────────────────────────

export function RecentlyUpdatedPanel({ bare = false }: { bare?: boolean } = {}) {
  const { currentCampaign, openArticle, setView } = useStore()
  const [items, setItems] = useState<{ id: number; title: string; article_type: string; updated_at: string }[]>([])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((list: any[]) => {
      const sorted = [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setItems(sorted.slice(0, 6))
    })
  }, [currentCampaign?.id])

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  if (items.length === 0) return bare ? <div style={bareEmptyStyle}>No articles yet</div> : null

  return (
    <div style={bare ? undefined : panelCardStyle}>
      {!bare && <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>Recently updated</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((item, i) => (
          <button key={item.id} onClick={() => { openArticle(item.id); setView('wiki') }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', background: 'none', border: 'none', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            className="hover-opacity"
          >
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ARTICLE_TYPE_COLORS[item.article_type] ?? 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(item.updated_at)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Active Quests Panel ────────────────────────────────────────────────────────

export function ActiveQuestsPanel({ bare = false }: { bare?: boolean } = {}) {
  const { currentCampaign, openArticle, setView } = useStore()
  const [quests, setQuests] = useState<{
    id: number; title: string; updated_at: string
    type: string; substeps: any[]; questGiver: string; playerCharacter: string
  }[]>([])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id, type: 'quest' }).then((list: any[]) => {
      const active = list
        .map(a => {
          let tracks: any = {}, substeps: any[] = []
          try { tracks = JSON.parse(a.tracks || '{}') } catch {}
          try { substeps = JSON.parse((a as any).substeps || '[]') } catch {}
          return {
            id: a.id, title: a.title, updated_at: a.updated_at,
            status: tracks.Status || '',
            type: tracks.Type || '',
            questGiver: tracks.Quest_Giver || '',
            playerCharacter: tracks.Player_Character || '',
            substeps,
          }
        })
        .filter(q => q.status === 'Active')
        .sort((a, b) => {
          // Main first, then by recent update
          const aMain = a.type === 'Main' ? 0 : 1
          const bMain = b.type === 'Main' ? 0 : 1
          if (aMain !== bMain) return aMain - bMain
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })
      setQuests(active)
    })
  }, [currentCampaign?.id])

  const QUEST_TYPE_COLORS: Record<string, string> = {
    Main: '#e88c3a', Side: '#5b9fe8', Personal: '#9b7de8', Faction: '#49c185',
  }

  if (quests.length === 0) return bare ? <div style={bareEmptyStyle}>No active quests</div> : null

  return (
    <div style={bare ? undefined : panelCardStyle}>
      {!bare && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Active quests</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{quests.length}</div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {quests.map((q, i) => {
          const total = q.substeps.length
          const done  = q.substeps.filter(s => s.status === 'complete').length
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0
          const color = QUEST_TYPE_COLORS[q.type] ?? 'var(--text-muted)'

          return (
            <button key={q.id} onClick={() => { openArticle(q.id); setView('wiki') }}
              style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 0', background: 'none', border: 'none', borderBottom: i < quests.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              className="hover-opacity"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                {q.type && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: color + '18', border: `1px solid ${color}44`, color, flexShrink: 0 }}>
                    {q.type}
                  </span>
                )}
                {total > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{done}/{total}</span>
                )}
              </div>
              {q.playerCharacter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 15, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span>for</span>
                  <span style={{ color: '#9b7de8' }}>{q.playerCharacter}</span>
                </div>
              )}
              {total > 0 && (
                <div style={{ marginLeft: 15, height: 2, background: 'var(--border-light)', borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#49c185' : color, transition: 'width 200ms' }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Wiki Health Panel ──────────────────────────────────────────────────────────

// Explains how each list is derived — kept in sync with the `articles:health`
// backend rules (electron/main/ipc/articles.ts). The 100-char figure is that
// handler's stub threshold; "No connections" mirrors the wiki graph's "unlinked".
export const HEALTH_INFO = [
  'How this list is built:',
  '',
  '• Empty or short — under 100 characters of text and no structured content (statblock, quest steps, item details, etc.).',
  '',
  "• No connections — no [[links]] or track references to or from another article. Creatures are excluded, since bestiary entries usually aren't linked in a wiki.",
  '',
  "• Broken links — [[links]] pointing to an article that doesn't exist yet.",
].join('\n')

export function WikiHealthPanel({ bare = false }: { bare?: boolean } = {}) {
  const { currentCampaign, openArticle, setView } = useStore()
  const [health, setHealth] = useState<WikiHealth | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesHealth(currentCampaign.id).then(setHealth)
  }, [currentCampaign?.id])

  if (!health) return null

  const total = health.stubs.length + health.orphans.length + health.broken.length
  const goToArticle = (id: number) => { openArticle(id); setView('wiki') }

  const SECTION_LIMIT = 4
  const section = (
    key: string, label: string,
    items: { render: () => React.ReactNode; onClick: () => void; itemKey: string | number }[],
  ) => {
    if (items.length === 0) return null
    const shown = expanded[key] ? items : items.slice(0, SECTION_LIMIT)
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          {label} · {items.length}
        </div>
        {shown.map(item => (
          <button key={item.itemKey} onClick={item.onClick} className="hover-opacity"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            {item.render()}
          </button>
        ))}
        {items.length > SECTION_LIMIT && !expanded[key] && (
          <button onClick={() => setExpanded(e => ({ ...e, [key]: true }))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}
          >
            +{items.length - SECTION_LIMIT} more
          </button>
        )}
      </div>
    )
  }

  const titleStyle: React.CSSProperties = { flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const tagStyle: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }
  const dot = (color: string) => (
    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
  )

  return (
    <div style={bare ? undefined : panelCardStyle}>
      {!bare && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Needs attention</div>
            <InfoHint text={HEALTH_INFO} />
          </div>
          {total > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total}</div>}
        </div>
      )}

      {total === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#49c185' }}>
          <span>✓</span> Wiki looks healthy
        </div>
      ) : (
        <>
          {section('stubs', 'Empty or short', health.stubs.map(s => ({
            itemKey: s.id,
            onClick: () => goToArticle(s.id),
            render: () => (<>
              {dot(ARTICLE_TYPE_COLORS[s.article_type] ?? 'var(--text-muted)')}
              <span style={titleStyle}>{s.title}</span>
              <span style={tagStyle}>{s.textLen === 0 ? 'empty' : 'short'}</span>
            </>),
          })))}

          {section('orphans', 'No connections', health.orphans.map(o => ({
            itemKey: o.id,
            onClick: () => goToArticle(o.id),
            render: () => (<>
              {dot(ARTICLE_TYPE_COLORS[o.article_type] ?? 'var(--text-muted)')}
              <span style={titleStyle}>{o.title}</span>
              <span style={tagStyle}>unlinked</span>
            </>),
          })))}

          {section('broken', 'Broken links', health.broken.map(b => ({
            itemKey: b.title,
            onClick: () => goToArticle(b.sources[0].id),
            render: () => (<>
              {dot('#e05555')}
              <span style={{ ...titleStyle, color: '#e05555' }} title={`Referenced in: ${b.sources.map(s => s.title).join(', ')}`}>
                [[{b.title}]]
              </span>
              <span style={tagStyle}>in {b.sources.length} article{b.sources.length !== 1 ? 's' : ''}</span>
            </>),
          })))}
        </>
      )}
    </div>
  )
}

// ── Ticking Clocks Panel ───────────────────────────────────────────────────────
// Campaign-wide progress clocks (Blades-style fronts): what's advancing
// off-screen. Active clocks sorted closest-to-completion first (backend order);
// tickable directly from the hub. Completed clocks collapse behind a toggle.

export function ClocksPanel({ bare = false }: { bare?: boolean } = {}) {
  const { currentCampaign, openArticle, setView } = useStore()
  const [clocks, setClocks] = useState<Clock[]>([])
  const [showDone, setShowDone] = useState(false)

  const reload = () => {
    if (currentCampaign) window.api.getClocks(currentCampaign.id).then(setClocks)
  }
  useEffect(reload, [currentCampaign?.id])

  if (!currentCampaign) return null
  const active = clocks.filter(c => c.status !== 'completed')
  const done = clocks.filter(c => c.status === 'completed')

  const articleChip = (c: Clock) => c.article_title ? (
    <button
      onClick={() => { openArticle(c.article_id!); setView('wiki') }}
      title={`Go to ${c.article_title}`}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        fontSize: 10.5, color: ARTICLE_TYPE_COLORS[c.article_type ?? ''] ?? 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130,
      }}
    >
      · {c.article_title}
    </button>
  ) : null

  const list = (items: Clock[]) => (
    <ClockList
      clocks={items}
      renderMeta={articleChip}
      onTick={(c, filled) => window.api.updateClock(c.id, { filled }).then(reload)}
      onRename={(c, name) => window.api.updateClock(c.id, { name }).then(reload)}
      onDelete={c => window.api.deleteClock(c.id).then(reload)}
      onCreate={(name, segments) =>
        window.api.createClock({ campaign_id: currentCampaign.id, name, segments }).then(reload)}
    />
  )

  const body = (
    <>
      {list(active)}
      {done.length > 0 && (
        <>
          <button
            onClick={() => setShowDone(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: 'var(--text-muted)', padding: '6px 0 0', textAlign: 'left' }}
          >
            {showDone ? '▾' : '▸'} {done.length} completed
          </button>
          {showDone && <div style={{ marginTop: 6, opacity: 0.65 }}>{list(done)}</div>}
        </>
      )}
    </>
  )

  if (bare) return body

  return (
    <div style={panelCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Ticking clocks</div>
          <InfoHint text={CLOCKS_INFO} />
        </div>
        {active.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{active.length}</div>}
      </div>
      {body}
    </div>
  )
}

// ── Articles By Type Panel ─────────────────────────────────────────────────────

export function ArticlesByTypePanel({ bare = false }: { bare?: boolean } = {}) {
  const { currentCampaign } = useStore()
  const [counts, setCounts] = useState<{ type: string; count: number; color: string }[]>([])

  useEffect(() => {
    if (!currentCampaign) return
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((list: any[]) => {
      const map: Record<string, number> = {}
      list.forEach((a: any) => { map[a.article_type] = (map[a.article_type] ?? 0) + 1 })
      const sorted = Object.entries(map)
        .map(([type, count]) => ({ type, count, color: ARTICLE_TYPE_COLORS[type] ?? '#8a8a8a' }))
        .sort((a, b) => b.count - a.count)
      setCounts(sorted)
    })
  }, [currentCampaign?.id])

  if (counts.length === 0) return bare ? <div style={bareEmptyStyle}>No articles yet</div> : null
  const max = Math.max(...counts.map(c => c.count))

  return (
    <div style={bare ? undefined : panelCardStyle}>
      {!bare && <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>Articles by type</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {counts.map(({ type, count, color }) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 72, flexShrink: 0, textTransform: 'capitalize' }}>{type}</span>
            <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 99, height: 5 }}>
              <div style={{ width: `${Math.round(count / max * 100)}%`, height: 5, borderRadius: 99, background: color }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
