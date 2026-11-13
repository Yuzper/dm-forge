// path: src/components/campaign/MapHub.tsx
// Full-bleed map-first campaign hub: the world map fills the view. Contents,
// Active quests and Ticking clocks share one merged toggle group in the map's
// own top toolbar, next to its Select/Pin/Draw/Measure tools — each opens
// independently, so any combination can be open at once. Their panels land in
// two spots: Contents (and Travel, from the Measure tool) float top-left,
// same corner as an article's map; Quests and Clocks stack top-right. Ambience
// and the "Customise" panel-visibility menu were dropped from this view
// entirely (still reachable from the classic hub).
//
// Contents and Travel are the map's own panels, portaled out of HubWorldMap
// into the drawer slot; Quests and Clocks are campaign panels that live here.
// The wiki-facing panels that used to float here — recently updated, articles
// by type, needs attention — moved into WikiPage, which is where their
// questions actually get answered.

import { useState } from 'react'
import { useStore } from '../../store/store'
import { Flag, LayoutGrid, List, Scroll, Timer, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { POI } from '../../types'
import HubWorldMap from './HubWorldMap'
import { CLOCKS_INFO } from '../clocks/ClocksSection'
import { InfoHint } from '../InfoHint'
import { type HubPanelKey, ActiveQuestsPanel, ClocksPanel } from './HubPanels'
import { NAV_ITEMS, type SectionView } from '../../constants/sections'

// ── Panel toggle group ───────────────────────────────────────────────────────

// Contents opens the map's own panel (portaled through HubWorldMap); Quests
// and Clocks render here. All three toggle independently — unlike Travel,
// which stays one-at-a-time with the rest of the map's tools.
type PanelKey = 'contents' | 'quests' | 'clocks'

interface PanelDef {
  label: string
  icon: LucideIcon
  accent: string
  info?: string
  /** Contents draws its own panel — the drawer gives it a bare slot. */
  hosted?: boolean
}

// One accent for all three — the same rust the map's own tool strip uses for
// its active tool, so this group reads as part of the same toolbar rather
// than each button picking its own color.
const TOOLBAR_ACCENT = '#c8733a'

const PANEL_DEFS: Record<PanelKey, PanelDef> = {
  contents: { label: 'Contents',       icon: List,  accent: TOOLBAR_ACCENT, hosted: true },
  quests:   { label: 'Active quests',  icon: Flag,  accent: TOOLBAR_ACCENT },
  clocks:   { label: 'Ticking clocks', icon: Timer, accent: TOOLBAR_ACCENT, info: CLOCKS_INFO },
}
const PANEL_KEYS = Object.keys(PANEL_DEFS) as PanelKey[]
const SHORT_LABEL: Record<PanelKey, string> = { contents: 'Contents', quests: 'Quests', clocks: 'Clocks' }

const panelsKey = (campaignId: number) => `map-hub-panels-${campaignId}`
const travelKey = (campaignId: number) => `map-hub-travel-${campaignId}`

function loadOpenPanels(campaignId: number): Record<PanelKey, boolean> {
  const result: Record<PanelKey, boolean> = { contents: false, quests: false, clocks: false }
  try {
    const stored = localStorage.getItem(panelsKey(campaignId))
    if (stored) {
      const openKeys: string[] = JSON.parse(stored)
      for (const k of PANEL_KEYS) result[k] = openKeys.includes(k)
    }
  } catch {}
  return result
}

function saveOpenPanels(campaignId: number, panels: Record<PanelKey, boolean>) {
  localStorage.setItem(panelsKey(campaignId), JSON.stringify(PANEL_KEYS.filter(k => panels[k])))
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
  'loot-tables': 'Tables',
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

export default function MapHubView({ panels, onHasMapsChange, onSwitchLayout, stats }: {
  panels: Record<HubPanelKey, boolean>
  onHasMapsChange: (has: boolean) => void
  onSwitchLayout: () => void
  stats: MapHubStats
}) {
  const { currentCampaign } = useStore()
  const setPlayersManagerOpen = useStore(s => s.setPlayersManagerOpen)

  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>(() =>
    currentCampaign ? loadOpenPanels(currentCampaign.id) : { contents: false, quests: false, clocks: false }
  )
  // Travel isn't part of the toggle group — it mirrors the map's Measure tool,
  // one-at-a-time like the rest of the tools, so it gets its own flag.
  const [travelOpen, setTravelOpenState] = useState(() =>
    currentCampaign ? localStorage.getItem(travelKey(currentCampaign.id)) === 'true' : false
  )
  // The drawer slot the map portals Contents and Travel into (callback ref so
  // the node exists for the portal once mounted).
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null)
  const [pois, setPois] = useState<POI[]>([])
  const [focusPoi, setFocusPoi] = useState<{ id: number; nonce: number } | null>(null)

  if (!currentCampaign) return null

  const availableKeys = PANEL_KEYS.filter(k =>
    k === 'quests' ? panels.activeQuests : k === 'clocks' ? panels.clocks : true
  )

  const togglePanel = (key: PanelKey) => {
    setOpenPanels(prev => {
      const next = { ...prev, [key]: !prev[key] }
      saveOpenPanels(currentCampaign.id, next)
      return next
    })
  }
  // Travel has no toggle button of its own — the map's own Measure tool
  // drives it instead, so this sets the flag directly rather than toggling.
  const setTravelOpen = (on: boolean) => {
    setTravelOpenState(on)
    localStorage.setItem(travelKey(currentCampaign.id), String(on))
  }

  // Clicking a place in the quest panel finds its pin — the sidebar's party
  // card does the same for where they stand. Matching by label is how a pin
  // names its place.
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

  // Contents, Quests and Clocks merged into one toggle group, styled like the
  // map's own toolbar segments — handed to the map via `toolbarExtra` so it
  // renders inline with the tool strip. Each toggles independently, so
  // several can be active together.
  const panelToggleGroup = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: 3,
    }}>
      {availableKeys.map((key, i) => {
        const { label, icon: Icon, accent } = PANEL_DEFS[key]
        const active = openPanels[key]
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <div style={{ width: 1, height: 16, margin: '0 3px', background: 'rgba(255,255,255,0.14)' }} />}
            <button
              onClick={() => togglePanel(key)}
              title={active ? `Hide ${label.toLowerCase()}` : label}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: active ? `color-mix(in srgb, ${accent} 22%, transparent)` : 'transparent',
                border: `1px solid ${active ? `color-mix(in srgb, ${accent} 45%, transparent)` : 'transparent'}`,
                color: active ? accent : 'rgba(255,255,255,0.6)',
                borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                transition: 'all var(--transition)', whiteSpace: 'nowrap',
              }}
            >
              <Icon size={13} /> {SHORT_LABEL[key]}
            </button>
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <HubWorldMap
        fullBleed
        onHasMapsChange={onHasMapsChange}
        panelSlot={panelSlot}
        contentsOpen={openPanels.contents}
        onContentsToggle={() => togglePanel('contents')}
        measureOpen={travelOpen}
        onMeasureToggle={setTravelOpen}
        onPoisChange={setPois}
        focusPoi={focusPoi}
        hideContentsButton
        toolbarExtra={panelToggleGroup}
      />

      {/* Title, below the 34px map tab strip */}
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
        </div>
      </div>

      {/* Contents' own panel (portaled from the map) floats top-left, same
          side as an article's map — it shares this corner with Travel, which
          portals into the same slot when the Measure tool is active. */}
      <div ref={setPanelSlot} style={{
        position: 'absolute', left: 16, top: 92, zIndex: 26,
        display: (openPanels.contents || travelOpen) ? 'block' : 'none',
      }} />

      {/* Quests'/Clocks' glass-shell panels stack here on the right, so any
          combination the toggle group has open shows at once instead of
          replacing each other. */}
      <div style={{ position: 'absolute', right: 14, top: 92, zIndex: 26, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {(['quests', 'clocks'] as PanelKey[]).filter(k => openPanels[k]).map(key => {
          const def = PANEL_DEFS[key]
          return (
          <div key={key} style={{ width: 290, borderRadius: 'var(--radius-md)', overflow: 'hidden', ...glassStyle }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px 7px', fontSize: 10, color: 'var(--gold)',
              letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {def.label}
                {def.info && <InfoHint text={def.info} stopPropagation />}
              </span>
              <button onClick={() => togglePanel(key)} title="Close"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                className="hover-text">
                <X size={12} />
              </button>
            </div>
            <div style={{ padding: '0 12px 10px', maxHeight: 400, overflowY: 'auto' }}>
              {key === 'quests' && <ActiveQuestsPanel bare groupByLocation onGoToLocation={focusPlace} />}
              {key === 'clocks' && <ClocksPanel bare />}
            </div>
          </div>
          )
        })}
      </div>

      <NavDock stats={stats} />
    </div>
  )
}
