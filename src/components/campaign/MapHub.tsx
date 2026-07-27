// path: src/components/campaign/MapHub.tsx
// Full-bleed map-first campaign hub: the world map fills the view and the hub
// panels, nav dock and timeline float above it as collapsible overlays.

import { useState } from 'react'
import { useStore } from '../../store/store'
import {
  ChevronDown, ChevronUp, X, Clock, LayoutGrid,
  Scroll, BookOpen, Sparkles, ShoppingBag, Network, Music2, Users,
} from 'lucide-react'
import HubWorldMap from './HubWorldMap'
import TimelineEmbed from '../TimelineEmbed'
import { CLOCKS_INFO } from '../clocks/ClocksSection'
import { InfoHint } from '../InfoHint'
import {
  type HubPanelKey, HubSettingsMenu, HEALTH_INFO,
  ActiveQuestsPanel, WikiHealthPanel, RecentlyUpdatedPanel, ArticlesByTypePanel, ClocksPanel,
} from './HubPanels'
import { SECTION_ACCENTS } from '../../constants/sections'

// ── Overlay open/collapsed persistence ─────────────────────────────────────────

type OverlayKey = 'activeQuests' | 'wikiHealth' | 'recentlyUpdated' | 'articlesByType' | 'timeline' | 'clocks'

const OVERLAY_DEFAULTS: Record<OverlayKey, boolean> = {
  activeQuests: true, wikiHealth: true, recentlyUpdated: false, articlesByType: false, timeline: false, clocks: true,
}

function loadOverlayState(campaignId: number): Record<OverlayKey, boolean> {
  try {
    const stored = localStorage.getItem(`map-hub-open-${campaignId}`)
    if (stored) return { ...OVERLAY_DEFAULTS, ...JSON.parse(stored) }
  } catch {}
  return { ...OVERLAY_DEFAULTS }
}

// Translucent surface shared by every overlay so the map stays visible underneath.
const glassStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
  backdropFilter: 'blur(8px)',
  border: '1px solid var(--border)',
}

// ── Floating Panel ─────────────────────────────────────────────────────────────

function FloatingPanel({ title, open, onToggle, width = 280, info, children }: {
  title: string
  open: boolean
  onToggle: () => void
  width?: number
  info?: string   // optional help text shown via an Info icon in the header
  children: React.ReactNode
}) {
  if (!open) {
    return (
      <button
        onClick={onToggle}
        style={{
          ...glassStyle,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 99,
          fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
          cursor: 'pointer', transition: 'color var(--transition)',
        }}
        className="hover-gold"
      >
        {title}
        <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
      </button>
    )
  }

  return (
    <div style={{ ...glassStyle, width, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px 6px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase',
          fontFamily: 'var(--font-ui)', fontWeight: 600,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {title}
          {info && <InfoHint text={info} stopPropagation />}
        </span>
        <ChevronUp size={12} style={{ color: 'var(--text-muted)' }} />
      </button>
      <div style={{ padding: '0 12px 10px', maxHeight: 320, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ── Nav Dock ───────────────────────────────────────────────────────────────────

function DockItem({ icon, label, stat, accent, onClick }: {
  icon: React.ReactNode; label: string; stat?: string; accent: string; onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={stat ? `${label} — ${stat}` : label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '5px 11px', background: hovered ? `${accent}14` : 'none',
        border: 'none', borderRadius: 99, cursor: 'pointer',
        fontFamily: 'var(--font-ui)', transition: 'all 120ms ease',
      }}
    >
      <span style={{ display: 'flex', color: hovered ? accent : 'var(--text-secondary)', transition: 'color 120ms ease' }}>{icon}</span>
      <span style={{ fontSize: 10, color: hovered ? accent : 'var(--text-muted)', transition: 'color 120ms ease', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

export interface MapHubStats {
  articleCount: number
  noteCount: number
  lootCount: number
  relationsCount: number
  soundboardCount: number
}

function NavDock({ stats }: { stats: MapHubStats }) {
  const { sessions, setView, setCampaignSubView } = useStore()
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`
  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
      display: 'flex', gap: 2, padding: '4px 8px', borderRadius: 99, zIndex: 15,
      ...glassStyle,
    }}>
      <DockItem icon={<Scroll size={15} />} label="Sessions" accent="var(--gold)"
        stat={sessions.length > 0 ? plural(sessions.length, 'session') : undefined}
        onClick={() => setCampaignSubView('sessions')} />
      <DockItem icon={<BookOpen size={15} />} label="Wiki" accent={SECTION_ACCENTS['wiki']}
        stat={stats.articleCount > 0 ? plural(stats.articleCount, 'article') : undefined}
        onClick={() => setView('wiki')} />
      <DockItem icon={<Sparkles size={15} />} label="Notes" accent={SECTION_ACCENTS['dm-notes']}
        stat={stats.noteCount > 0 ? plural(stats.noteCount, 'note') : undefined}
        onClick={() => setView('dm-notes')} />
      <DockItem icon={<ShoppingBag size={15} />} label="Loot" accent={SECTION_ACCENTS['loot-tables']}
        stat={stats.lootCount > 0 ? plural(stats.lootCount, 'table') : undefined}
        onClick={() => setView('loot-tables')} />
      <DockItem icon={<Network size={15} />} label="Relations" accent={SECTION_ACCENTS['relations']}
        stat={stats.relationsCount > 0 ? plural(stats.relationsCount, 'web') : undefined}
        onClick={() => setView('relations')} />
      <DockItem icon={<Music2 size={15} />} label="Sound" accent={SECTION_ACCENTS['soundboard']}
        stat={stats.soundboardCount > 0 ? plural(stats.soundboardCount, 'board') : undefined}
        onClick={() => setView('soundboard')} />
    </div>
  )
}

// ── Timeline Chip ──────────────────────────────────────────────────────────────

function TimelineChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { sessions } = useStore()
  const latest = sessions.reduce<typeof sessions[number] | null>(
    (best, s) => (!best || s.session_number > best.session_number ? s : best), null
  )

  if (!open) {
    return (
      <button
        onClick={onToggle}
        style={{
          ...glassStyle,
          position: 'absolute', left: 14, bottom: 14, zIndex: 15,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 12px', borderRadius: 99,
          fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)',
          cursor: 'pointer', maxWidth: 260,
        }}
        className="hover-gold"
      >
        <Clock size={12} style={{ color: SECTION_ACCENTS['timeline'], flexShrink: 0 }} />
        {latest ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--text-primary)' }}>Session {latest.session_number}{latest.session_sub}</span>
            {latest.name ? ` · ${latest.name}` : ''}
          </span>
        ) : (
          <span>Timeline</span>
        )}
        <ChevronUp size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
    )
  }

  return (
    <div style={{
      ...glassStyle,
      position: 'absolute', left: 14, right: 14, bottom: 60, zIndex: 15,
      borderRadius: 'var(--radius-md)', padding: '8px 12px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, fontFamily: 'var(--font-ui)' }}>
          Session timeline
        </span>
        <button onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
          title="Collapse">
          <X size={13} />
        </button>
      </div>
      <TimelineEmbed />
    </div>
  )
}

// ── Map Hub View ───────────────────────────────────────────────────────────────

export default function MapHubView({ panels, onTogglePanel, onHasMapsChange, onSwitchLayout, stats }: {
  panels: Record<HubPanelKey, boolean>
  onTogglePanel: (key: HubPanelKey, value: boolean) => void
  onHasMapsChange: (has: boolean) => void
  onSwitchLayout: () => void
  stats: MapHubStats
}) {
  const { currentCampaign } = useStore()
  const setPlayersManagerOpen = useStore(s => s.setPlayersManagerOpen)
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>(() =>
    currentCampaign ? loadOverlayState(currentCampaign.id) : { ...OVERLAY_DEFAULTS }
  )
  // Left-stack slot the world map portals its location list into (callback ref so
  // the node is available for the portal once mounted).
  const [locationSlot, setLocationSlot] = useState<HTMLElement | null>(null)

  if (!currentCampaign) return null

  const toggleOverlay = (key: OverlayKey) => {
    setOverlays(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(`map-hub-open-${currentCampaign.id}`, JSON.stringify(next))
      return next
    })
  }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <HubWorldMap fullBleed onHasMapsChange={onHasMapsChange} listSlot={locationSlot} />

      {/* Title + hub settings, below the 34px map tab strip */}
      <div style={{
        position: 'absolute', top: 44, left: 16, right: 16, zIndex: 16,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 22, letterSpacing: '0.04em', margin: 0, textShadow: '0 1px 10px rgba(0,0,0,0.85)' }}>
            {currentCampaign.name}
          </h1>
          <span className="badge badge-gold">{currentCampaign.system}</span>
        </div>
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onSwitchLayout}
            title="Switch to the classic hub layout"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)', border: '1px solid var(--border-light)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}
            className="hover-gold-border"
          >
            <LayoutGrid size={11} /> Classic view
          </button>
          <button
            onClick={() => setPlayersManagerOpen(true)}
            title="Manage players for the player-facing site"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)', border: '1px solid var(--border-light)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}
            className="hover-gold-border"
          >
            <Users size={11} /> Players
          </button>
          <HubSettingsMenu panels={panels} onChange={onTogglePanel} />
        </div>
      </div>

      {/* Left overlay stack */}
      <div style={{ position: 'absolute', left: 16, top: 92, zIndex: 15, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
        {panels.activeQuests && (
          <FloatingPanel title="Active quests" open={overlays.activeQuests} onToggle={() => toggleOverlay('activeQuests')}>
            <ActiveQuestsPanel bare />
          </FloatingPanel>
        )}
        {/* World map's location list portals in here so it stacks under the quests
            panel instead of overlapping the map's top-left. */}
        <div ref={setLocationSlot} />
      </div>

      {/* Right overlay stack */}
      <div style={{ position: 'absolute', right: 16, top: 92, zIndex: 15, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        {panels.clocks && (
          <FloatingPanel
            title="Ticking clocks"
            info={CLOCKS_INFO}
            open={overlays.clocks} onToggle={() => toggleOverlay('clocks')}
          >
            <ClocksPanel bare />
          </FloatingPanel>
        )}
        {panels.wikiHealth && (
          <FloatingPanel title="Needs attention" info={HEALTH_INFO} open={overlays.wikiHealth} onToggle={() => toggleOverlay('wikiHealth')}>
            <WikiHealthPanel bare />
          </FloatingPanel>
        )}
        {panels.recentlyUpdated && (
          <FloatingPanel title="Recently updated" open={overlays.recentlyUpdated} onToggle={() => toggleOverlay('recentlyUpdated')}>
            <RecentlyUpdatedPanel bare />
          </FloatingPanel>
        )}
        {panels.articlesByType && (
          <FloatingPanel title="Articles by type" open={overlays.articlesByType} onToggle={() => toggleOverlay('articlesByType')}>
            <ArticlesByTypePanel bare />
          </FloatingPanel>
        )}
      </div>

      {panels.sessionTimeline && (
        <TimelineChip open={overlays.timeline} onToggle={() => toggleOverlay('timeline')} />
      )}

      <NavDock stats={stats} />
    </div>
  )
}
