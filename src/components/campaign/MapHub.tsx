// path: src/components/campaign/MapHub.tsx
// Full-bleed map-first campaign hub: the world map fills the view, and one
// right-edge rail owns every overlay. Each rail item opens a single drawer, so
// the map is never covered by more than one panel at a time.
//
// Two of the rail's items are the map's own panels (Contents, Travel) portaled
// out of HubWorldMap into the drawer; the rest are campaign panels that live
// here. The wiki-facing panels that used to float here — recently
// updated, articles by type, needs attention — moved into WikiPage, which is
// where their questions actually get answered.

import { useMemo, useState } from 'react'
import { useStore } from '../../store/store'
import {
  Flag, LayoutGrid, List, Music2, Ruler, Scroll, Timer, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { POI } from '../../types'
import HubWorldMap from './HubWorldMap'
import PartyStrip from './PartyStrip'
import AmbiencePanel from './AmbiencePanel'
import { CLOCKS_INFO } from '../clocks/ClocksSection'
import { InfoHint } from '../InfoHint'
import { buildPartyTrail } from '../../utils/partyTrail'
import {
  type HubPanelKey, HubSettingsMenu, ActiveQuestsPanel, ClocksPanel,
} from './HubPanels'
import { NAV_ITEMS, type SectionView } from '../../constants/sections'

// ── Overlay rail ───────────────────────────────────────────────────────────────

// 'contents' and 'travel' are the map's panels, drawn by HubWorldMap into the
// drawer slot; the rest render here inside the glass shell.
type RailKey = 'contents' | 'quests' | 'clocks' | 'ambience' | 'travel'

interface RailItem {
  key: RailKey
  label: string
  icon: LucideIcon
  accent: string
  /** Panels the map draws itself — the drawer gives them a bare slot. */
  hosted?: boolean
  info?: string
}

const RAIL_ITEMS: RailItem[] = [
  { key: 'contents', label: 'Contents',      icon: List,  accent: 'var(--gold)',    hosted: true },
  { key: 'quests',   label: 'Active quests', icon: Flag,  accent: '#e88c3a' },
  { key: 'clocks',   label: 'Ticking clocks', icon: Timer, accent: 'var(--warning)', info: CLOCKS_INFO },
  { key: 'ambience', label: 'Ambience',      icon: Music2, accent: 'var(--section-soundboard, #4cc9d6)' },
  { key: 'travel',   label: 'Travel',        icon: Ruler, accent: '#5bbfb0',        hosted: true },
]

const railKey = (campaignId: number) => `map-hub-rail-${campaignId}`
const trailKey = (campaignId: number) => `map-hub-trail-${campaignId}`

function loadRailOpen(campaignId: number): RailKey | null {
  const stored = localStorage.getItem(railKey(campaignId))
  return RAIL_ITEMS.some(i => i.key === stored) ? stored as RailKey : null
}

// Translucent surface shared by every overlay so the map stays visible underneath.
const glassStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
  backdropFilter: 'blur(8px)',
  border: '1px solid var(--border)',
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

// Shorter than the labels NAV_ITEMS carries — the dock is a pill, not a page.
const DOCK_LABELS: Partial<Record<SectionView, string>> = {
  'dm-notes':    'Notes',
  'loot-tables': 'Loot',
  'soundboard':  'Sound',
}

// Driven by NAV_ITEMS rather than hand-listed, which is how Timeline came to be
// missing here while the classic hub's dock had it.
function NavDock({ stats }: { stats: MapHubStats }) {
  const { sessions, setView, setCampaignSubView } = useStore()
  const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`
  const counts: Partial<Record<SectionView, [number, string]>> = {
    'wiki':        [stats.articleCount, 'article'],
    'dm-notes':    [stats.noteCount, 'note'],
    'loot-tables': [stats.lootCount, 'table'],
    'relations':   [stats.relationsCount, 'web'],
    'soundboard':  [stats.soundboardCount, 'board'],
  }
  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
      display: 'flex', gap: 2, padding: '4px 8px', borderRadius: 99, zIndex: 15,
      ...glassStyle,
    }}>
      <DockItem icon={<Scroll size={15} />} label="Sessions" accent="var(--gold)"
        stat={sessions.length > 0 ? plural(sessions.length, 'session') : undefined}
        onClick={() => setCampaignSubView('sessions')} />
      {NAV_ITEMS.map(({ view, label, icon: Icon, accent }) => {
        const count = counts[view]
        return (
          <DockItem
            key={view}
            icon={<Icon size={15} />}
            label={DOCK_LABELS[view] ?? label}
            accent={accent}
            stat={count && count[0] > 0 ? plural(count[0], count[1]) : undefined}
            onClick={() => setView(view)}
          />
        )
      })}
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
  const { currentCampaign, sessions, navigateToSessionById } = useStore()
  const setPlayersManagerOpen = useStore(s => s.setPlayersManagerOpen)

  const [open, setOpen] = useState<RailKey | null>(() =>
    currentCampaign ? loadRailOpen(currentCampaign.id) : null
  )
  const [showTrail, setShowTrail] = useState(() =>
    currentCampaign ? localStorage.getItem(trailKey(currentCampaign.id)) === 'true' : false
  )
  // The drawer slot the map portals Contents and Travel into (callback ref so
  // the node exists for the portal once mounted).
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [focusPoi, setFocusPoi] = useState<{ id: number; nonce: number } | null>(null)

  const trail = useMemo(() => buildPartyTrail(pois, sessions), [pois, sessions])

  if (!currentCampaign) return null

  const hidden: Partial<Record<RailKey, boolean>> = {
    quests: !panels.activeQuests,
    clocks: !panels.clocks,
  }
  const items = RAIL_ITEMS.filter(i => !hidden[i.key])
  const openItem = items.find(i => i.key === open) ?? null

  const toggleRail = (key: RailKey) => {
    const next = open === key ? null : key
    setOpen(next)
    localStorage.setItem(railKey(currentCampaign.id), next ?? '')
  }
  const toggleTrail = () => setShowTrail(v => {
    localStorage.setItem(trailKey(currentCampaign.id), String(!v))
    return !v
  })

  // Clicking a place in the quest panel finds its pin; the party strip does the
  // same for where they stand. Matching by label is how a pin names its place.
  const focusPlace = (title: string) => {
    const poi = pois.find(p => p.label.toLowerCase() === title.toLowerCase())
    if (poi) setFocusPoi({ id: poi.id, nonce: Date.now() })
  }

  const overlayButton: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99,
    fontSize: 11, background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
    border: '1px solid var(--border-light)', color: 'var(--text-muted)',
    cursor: 'pointer', transition: 'all 120ms ease',
  }

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <HubWorldMap
        fullBleed
        onHasMapsChange={onHasMapsChange}
        panelSlot={panelSlot}
        contentsOpen={open === 'contents'}
        onContentsToggle={() => toggleRail('contents')}
        measureOpen={open === 'travel'}
        onMeasureToggle={on => { if (!on && open === 'travel') toggleRail('travel') }}
        onPoisChange={setPois}
        trail={trail}
        showTrail={showTrail}
        focusPoi={focusPoi}
      />

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
          <button onClick={onSwitchLayout} title="Switch to the classic hub layout"
            style={overlayButton} className="hover-gold-border">
            <LayoutGrid size={11} /> Classic view
          </button>
          <button onClick={() => setPlayersManagerOpen(true)} title="Manage players for the player-facing site"
            style={overlayButton} className="hover-gold-border">
            <Users size={11} /> Players
          </button>
          <HubSettingsMenu panels={panels} onChange={onTogglePanel} />
        </div>
      </div>

      {/* Overlay rail — one icon per panel, one panel open at a time */}
      <div style={{
        position: 'absolute', right: 14, top: 92, width: 44, zIndex: 27,
        borderRadius: 'var(--radius-md)', ...glassStyle,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0' }}>
          {items.map(({ key, label, icon: Icon, accent }) => {
            const active = open === key
            return (
              <button
                key={key}
                onClick={() => toggleRail(key)}
                title={label}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  color: active ? accent : 'var(--text-muted)',
                  transition: 'all 120ms ease',
                }}
                className={active ? undefined : 'hover-text-secondary'}
              >
                <Icon size={16} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Drawer — glass shell for the hub's own panels, bare slot for the
          map's, which bring their own chrome. */}
      <div style={{ position: 'absolute', right: 66, top: 92, zIndex: 26, display: openItem ? 'block' : 'none' }}>
        <div ref={setPanelSlot} style={{ display: openItem?.hosted ? 'block' : 'none' }} />
        {openItem && !openItem.hosted && (
          <div style={{ width: 290, borderRadius: 'var(--radius-md)', overflow: 'hidden', ...glassStyle }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px 7px', fontSize: 10, color: 'var(--gold)',
              letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {openItem.label}
                {openItem.info && <InfoHint text={openItem.info} stopPropagation />}
              </span>
              <button onClick={() => toggleRail(openItem.key)} title="Close"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                className="hover-text">
                <X size={12} />
              </button>
            </div>
            <div style={{ padding: '0 12px 10px', maxHeight: 400, overflowY: 'auto' }}>
              {openItem.key === 'quests' && <ActiveQuestsPanel bare groupByLocation onGoToLocation={focusPlace} />}
              {openItem.key === 'clocks' && <ClocksPanel bare />}
              {openItem.key === 'ambience' && <AmbiencePanel trail={trail} />}
            </div>
          </div>
        )}
      </div>

      {/* Party strip — always on, never collapses. Hides itself when no pin on
          this map is linked to a session. */}
      {trail.length > 0 && (
        <div style={{ position: 'absolute', left: 16, bottom: 14, zIndex: 26, borderRadius: 'var(--radius-md)', ...glassStyle }}>
          <PartyStrip
            campaign={currentCampaign}
            trail={trail}
            showTrail={showTrail}
            onToggleTrail={toggleTrail}
            onOpenSession={id => navigateToSessionById(id)}
            onFocusStop={stop => setFocusPoi({ id: stop.poiId, nonce: Date.now() })}
          />
        </div>
      )}

      <NavDock stats={stats} />
    </div>
  )
}
