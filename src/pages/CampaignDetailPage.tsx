// path: src/pages/CampaignDetailPage.tsx
import { useState, useEffect } from 'react'
import { useStore } from '../store/store'
import {
  BookOpen, Scroll, Sparkles, ShoppingBag, Network, Clock, Music2, Map,
} from 'lucide-react'
import TimelineEmbed from '../components/TimelineEmbed'
import HubWorldMap from '../components/campaign/HubWorldMap'
import MapHubView from '../components/campaign/MapHub'
import SessionsView from '../components/campaign/SessionsView'
import {
  type HubPanelKey, HUB_PANEL_DEFAULTS, loadHubPanels, saveHubPanels,
  HubSettingsMenu, RecentlyUpdatedPanel, ActiveQuestsPanel, WikiHealthPanel, ArticlesByTypePanel, ClocksPanel,
} from '../components/campaign/HubPanels'

// ── Nav Dock Card ─────────────────────────────────────────────────────────────

function NavDockCard({ icon, title, stat, onClick, accent }: {
  icon: React.ReactNode; title: string; stat?: string; onClick: () => void; accent: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '11px 8px 9px',
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: `1px solid ${hovered ? accent + '66' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all 140ms ease',
        boxShadow: hovered ? `0 0 16px ${accent}12` : 'none',
        minWidth: 0,
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 'var(--radius-sm)',
        background: `${accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent,
        opacity: hovered ? 1 : 0.75,
        transition: 'opacity 140ms ease',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'color 140ms ease', whiteSpace: 'nowrap' }}>
        {title}
      </div>
      {stat && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stat}</div>
      )}
    </button>
  )
}

// ── Hub layout preference ──────────────────────────────────────────────────────
// 'map' = full-bleed map hub, 'classic' = the original panel grid. Stored per
// campaign in localStorage alongside the hub panel preferences.

export type HubLayout = 'map' | 'classic'

function loadHubLayout(campaignId: number): HubLayout {
  return localStorage.getItem(`hub-layout-${campaignId}`) === 'classic' ? 'classic' : 'map'
}

function saveHubLayout(campaignId: number, layout: HubLayout) {
  localStorage.setItem(`hub-layout-${campaignId}`, layout)
}

// ── Campaign Detail Page ───────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { currentCampaign, sessions, setView } = useStore()
  const { campaignSubView: subView, setCampaignSubView: setSubView } = useStore()
  const setHintContext = useStore(s => s.setHintContext)
  useEffect(() => {
    setHintContext(subView === 'hub' ? 'campaign-hub' : null)
    return () => setHintContext(null)
  }, [subView, setHintContext])
  const [noteCount, setNoteCount] = useState(0)
  const [articleCount, setArticleCount] = useState(0)
  const [lootCount, setLootCount] = useState(0)
  const [relationsCount, setRelationsCount] = useState(0)
  const [soundboardCount, setSoundboardCount] = useState(0)
  // null while loading — avoids flashing the classic layout before switching to the map hub
  const [hasMap, setHasMap] = useState<boolean | null>(null)
  const [hubLayout, setHubLayout] = useState<HubLayout>(() =>
    currentCampaign ? loadHubLayout(currentCampaign.id) : 'map'
  )
  const [hubPanels, setHubPanels] = useState<Record<HubPanelKey, boolean>>(() =>
    currentCampaign ? loadHubPanels(currentCampaign.id) : { ...HUB_PANEL_DEFAULTS }
  )

  useEffect(() => {
    if (currentCampaign) {
      setHubPanels(loadHubPanels(currentCampaign.id))
      setHubLayout(loadHubLayout(currentCampaign.id))
    }
  }, [currentCampaign?.id])

  const switchLayout = (layout: HubLayout) => {
    if (!currentCampaign) return
    saveHubLayout(currentCampaign.id, layout)
    setHubLayout(layout)
  }

  const togglePanel = (key: HubPanelKey, value: boolean) => {
    if (!currentCampaign) return
    setHubPanels(prev => {
      const next = { ...prev, [key]: value }
      saveHubPanels(currentCampaign.id, next)
      return next
    })
  }

  useEffect(() => {
    if (!currentCampaign) return
    setHasMap(null)
    window.api.getMapsForCampaign(currentCampaign.id).then((m: any[]) => setHasMap(m.length > 0))
    window.api.getDMNotesPages(currentCampaign.id).then((p: any[]) => setNoteCount(p.length))
    window.api.getArticlesList({ campaignId: currentCampaign.id }).then((a: any[]) => setArticleCount(a.length))
    window.api.getLootTables(currentCampaign.id).then((t: any[]) => setLootCount(t.length))
    window.api.getRelationWebs(currentCampaign.id).then((w: any[]) => setRelationsCount(w.length))
    window.api.getSoundBoards(currentCampaign.id).then((b: any[]) => setSoundboardCount(b.length))
  }, [currentCampaign?.id])

  if (!currentCampaign) return null

  if (subView === 'sessions') {
    return <SessionsView onBack={() => setSubView('hub')} />
  }

  // Map-first hub: the world map fills the view with panels floating above it.
  // Falls back to the classic grid when the campaign has no map, the map panel
  // is off, or the user prefers the classic layout.
  const wantsMapHub = hubPanels.worldMap && hubLayout === 'map'
  if (wantsMapHub && hasMap === null) return null
  if (wantsMapHub && hasMap) {
    return (
      <MapHubView
        panels={hubPanels}
        onTogglePanel={togglePanel}
        onHasMapsChange={setHasMap}
        onSwitchLayout={() => switchLayout('classic')}
        stats={{ articleCount, noteCount, lootCount, relationsCount, soundboardCount }}
      />
    )
  }

  const showRightPanels = hubPanels.recentlyUpdated || hubPanels.activeQuests || hubPanels.articlesByType || hubPanels.wikiHealth || hubPanels.clocks
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '28px 40px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="badge badge-gold">{currentCampaign.system}</span>
            </div>
            <h1 style={{ fontSize: 28, letterSpacing: '0.04em' }}>{currentCampaign.name}</h1>
          </div>
          <div style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasMap && hubPanels.worldMap && (
              <button
                onClick={() => switchLayout('map')}
                title="Switch to the map-focused hub"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}
                className="hover-gold-border"
              >
                <Map size={11} /> Map view
              </button>
            )}
            <HubSettingsMenu panels={hubPanels} onChange={togglePanel} />
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 36px 20px' }}>

        {/* Top row: map left, panels right */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: hubPanels.worldMap && showRightPanels ? '1fr 290px' : '1fr',
          gap: 16,
          marginBottom: 16,
          alignItems: 'start',
        }}>
          {hubPanels.worldMap && <HubWorldMap onHasMapsChange={setHasMap} />}
          {showRightPanels && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 12,
              maxHeight: hubPanels.worldMap ? 520 : undefined,
              overflowY: 'auto',
              paddingRight: 2,
            }}>
              {hubPanels.activeQuests && <ActiveQuestsPanel />}
              {hubPanels.clocks && <ClocksPanel />}
              {hubPanels.wikiHealth && <WikiHealthPanel />}
              {hubPanels.recentlyUpdated && <RecentlyUpdatedPanel />}
              {hubPanels.articlesByType && <ArticlesByTypePanel />}
            </div>
          )}
        </div>

        {/* Timeline full-width */}
        {hubPanels.sessionTimeline && (
          <div style={{ marginBottom: 8 }}>
            <TimelineEmbed />
          </div>
        )}
      </div>

      {/* Nav dock */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '14px 36px 16px', display: 'flex', gap: 10 }}>
        <NavDockCard
          icon={<Scroll size={16} />} title="Sessions"
          stat={sessions.length > 0 ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}` : undefined}
          onClick={() => setSubView('sessions')} accent="var(--gold)"
        />
        <NavDockCard
          icon={<BookOpen size={16} />} title="Wiki"
          stat={articleCount > 0 ? `${articleCount} article${articleCount !== 1 ? 's' : ''}` : undefined}
          onClick={() => setView('wiki')} accent="#5b9fe8"
        />
        <NavDockCard
          icon={<Sparkles size={16} />} title="DM Notes"
          stat={noteCount > 0 ? `${noteCount} note${noteCount !== 1 ? 's' : ''}` : undefined}
          onClick={() => setView('dm-notes')} accent="#9b7de8"
        />
        <NavDockCard
          icon={<ShoppingBag size={16} />} title="Loot Tables"
          stat={lootCount > 0 ? `${lootCount} table${lootCount !== 1 ? 's' : ''}` : undefined}
          onClick={() => setView('loot-tables')} accent="#49c185"
        />
        <NavDockCard
          icon={<Network size={16} />} title="Relations"
          stat={relationsCount > 0 ? `${relationsCount} web${relationsCount !== 1 ? 's' : ''}` : undefined}
          onClick={() => setView('relations')} accent="#b07de8"
        />
        <NavDockCard
          icon={<Clock size={16} />} title="Timeline"
          onClick={() => setView('timeline')} accent="#5bbfb0"
        />
        <NavDockCard
          icon={<Music2 size={16} />} title="Soundboard"
          stat={soundboardCount > 0 ? `${soundboardCount} board${soundboardCount !== 1 ? 's' : ''}` : undefined}
          onClick={() => setView('soundboard')} accent="#3b82f6"
        />
      </div>
    </div>
  )
}
