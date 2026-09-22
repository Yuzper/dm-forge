// path: src/components/campaign/HubPanels.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store/store'
import { Eye, MapPin } from 'lucide-react'
import type { Clock } from '../../types'
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

// Recently-updated, articles-by-type and wiki-health used to live here too.
// They answered questions about the wiki, not about the world, so they moved
// into WikiPage's own toolbar (counts on the type pills, a sort, and a
// "Needs attention" filter over the card grid) and left the hub to the map.
export type HubPanelKey = 'worldMap' | 'activeQuests' | 'clocks'


export const HUB_PANEL_DEFAULTS: Record<HubPanelKey, boolean> = {
  worldMap: true, activeQuests: true, clocks: true,
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
  activeQuests: 'Active quests',
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
        className="hover-text-secondary"
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

// ── Active Quests Panel ────────────────────────────────────────────────────────

// `groupByLocation` turns the flat list into "what's live in each place",
// which is what a map wants; the classic hub keeps the flat list.
export function ActiveQuestsPanel({ bare = false, groupByLocation = false, onGoToLocation }: {
  bare?: boolean
  groupByLocation?: boolean
  /** Focus a place on the map from its group heading. Omit to render the heading as plain text. */
  onGoToLocation?: (title: string) => void
} = {}) {
  const { currentCampaign, openArticle, setView } = useStore()
  const [quests, setQuests] = useState<{
    id: number; title: string; updated_at: string
    type: string; substeps: any[]; questGiver: string; playerCharacter: string; location: string
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
            location: tracks.Location || '',
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

  const questRow = (q: typeof quests[number], divider: boolean) => {
    const total = q.substeps.length
    const done  = q.substeps.filter(s => s.status === 'complete').length
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0
    const color = QUEST_TYPE_COLORS[q.type] ?? 'var(--text-muted)'

    return (
      <button key={q.id} onClick={() => { openArticle(q.id); setView('wiki') }}
        style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 0', background: 'none', border: 'none', borderBottom: divider ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
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
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--success)' : color, transition: 'width 200ms' }} />
          </div>
        )}
      </button>
    )
  }

  // Places in the order their most urgent quest already sorted to, with the
  // unplaced ones last — a quest with no Location track shouldn't lead.
  const groups: { place: string; items: typeof quests }[] = []
  if (groupByLocation) {
    for (const q of quests) {
      const place = q.location || ''
      const existing = groups.find(g => g.place === place)
      if (existing) existing.items.push(q)
      else groups.push({ place, items: [q] })
    }
    groups.sort((a, b) => (a.place ? 0 : 1) - (b.place ? 0 : 1))
  }

  return (
    <div style={bare ? undefined : panelCardStyle}>
      {!bare && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Active quests</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{quests.length}</div>
        </div>
      )}
      {groupByLocation ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {groups.map(group => (
            <div key={group.place || '__unplaced'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '9px 0 1px' }}>
                {group.place ? (
                  <>
                    <MapPin size={10} style={{ color: ARTICLE_TYPE_COLORS.location }} />
                    {onGoToLocation ? (
                      <button onClick={() => onGoToLocation(group.place)}
                        title={`Find ${group.place} on the map`}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: 'var(--text-secondary)' }}
                        className="hover-gold">
                        {group.place}
                      </button>
                    ) : group.place}
                  </>
                ) : 'Not placed yet'}
              </div>
              {group.items.map((q, i) => questRow(q, i < group.items.length - 1))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {quests.map((q, i) => questRow(q, i < quests.length - 1))}
        </div>
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
