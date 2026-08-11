// path: src/App.tsx
import { Fragment, useEffect } from 'react'
import type React from 'react'
import { useStore } from './store/store'
import { applyAppearance, loadAppearance } from './constants/themes'

// Base, accent, text palette and section colours all land in one pass, before
// the first render, so there's no flash of the default theme.
applyAppearance(loadAppearance())
import Sidebar from './components/sidebar/Sidebar'
import StatBlockPage from './pages/StatBlockPage'
import { UpdateBanner } from './components/UpdateBanner'
import SoundboardWidget from './components/SoundboardWidget'
import StatBlockOverlay from './components/StatBlockOverlay'
import HintsWidget from './components/HintsWidget'
import GlobalSearch from './components/GlobalSearch'
import FindBar from './components/FindBar'
import PlayersManager from './components/PlayersManager'
import SettingsModal from './components/SettingsModal'
import { ActivePaneProvider } from './context/PaneContext'
import PaneView from './components/PaneView'
import PaneSplitter from './components/PaneSplitter'
import { useTabShortcuts } from './hooks/useTabShortcuts'

const params = new URLSearchParams(window.location.search)
const statblockMode = params.get('mode') === 'statblock'
const statblockArticleId = statblockMode ? parseInt(params.get('articleId') || '0') : 0
const statblockOverride = statblockMode ? params.get('statblockOverride') : null
const nameOverride = statblockMode ? params.get('nameOverride') : null

export default function App() {
  const { loadCampaigns, bgStyle, currentCampaign, soundboardOpen, statBlockOverlays, playersManagerOpen, paneIds, splitRatio, themeVersion } = useStore()

  useEffect(() => { if (!statblockMode) loadCampaigns() }, [])

  if (statblockMode && statblockArticleId) {
    return (
      <StatBlockPage
        articleId={statblockArticleId}
        statblockOverride={statblockOverride}
        nameOverride={nameOverride}
      />
    )
  }

  return (
    <ActivePaneProvider>
    <TabShortcuts />
    {/* themeVersion is here to be *read*: an appearance change bumps it, which
        re-renders this tree so components that read section colours as plain hex
        pick up the new values. */}
    <div data-theme-version={themeVersion} style={{ display: 'flex', height: '100vh', overflow: 'hidden', ...bgStyleCSS(bgStyle) }}>
      <Sidebar />
      <UpdateBanner />
      {/* Persists across the campaign (not just the session) so music keeps
          playing when you leave a session; it auto-minimises off-session. */}
      {currentCampaign && soundboardOpen && <SoundboardWidget />}
      {statBlockOverlays.map((o, i) => <StatBlockOverlay key={o.id} overlay={o} index={i} />)}
      <HintsWidget />
      <GlobalSearch />
      <FindBar />
      <SettingsModal />
      {currentCampaign && playersManagerOpen && <PlayersManager />}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
        {paneIds.map((id, i) => (
          <Fragment key={id}>
            {i > 0 && <PaneSplitter />}
            <div style={{
              // Ratio drives the first pane; the second takes the remainder.
              flex: paneIds.length > 1 ? (i === 0 ? splitRatio : 1 - splitRatio) : 1,
              minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              <PaneView paneId={id} />
            </div>
          </Fragment>
        ))}
      </main>
    </div>
    </ActivePaneProvider>
  )
}

// Rendered inside ActivePaneProvider so Ctrl+T / Ctrl+W / Ctrl+Tab act on the
// pane that has focus, not always the first one.
function TabShortcuts() {
  useTabShortcuts()
  return null
}

// The hairlines take their colour from the theme (--texture-line /
// --texture-grain): a white hairline is invisible on the light base, so each
// base states what its texture is drawn in. The grain layers stay plain
// grayscale noise composited normally — they read on any ground, and blending
// them (an earlier attempt at light-mode support) crushed the wood to flat black.
function bgStyleCSS(style: string): React.CSSProperties {
  const grain = (freq: string, size: number, opacity: number, type = 'fractalNoise', octaves = 4) =>
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='${type}' baseFrequency='${freq}' numOctaves='${octaves}' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='${size}' height='${size}' filter='url(%23n)' opacity='${opacity}'/%3E%3C/svg%3E")`

  switch (style) {
    case 'parchment':
      return {
        background: 'var(--bg-base)',
        backgroundImage: grain('0.75', 300, 0.055),
        backgroundRepeat: 'repeat',
      }
    case 'vignette':
      return {
        background: 'radial-gradient(ellipse at 50% 45%, var(--bg-elevated) 0%, var(--bg-surface) 45%, var(--bg-base) 100%)',
      }
    case 'stone':
      return {
        backgroundColor: 'var(--bg-base)',
        backgroundImage: [
          `repeating-linear-gradient(0deg, transparent, transparent 39px, var(--texture-line) 39px, var(--texture-line) 40px)`,
          `repeating-linear-gradient(90deg, transparent, transparent 59px, var(--texture-line) 59px, var(--texture-line) 60px)`,
          grain('0.5', 120, 0.04, 'fractalNoise', 2),
        ].join(', '),
      }
    case 'wood':
      return {
        backgroundColor: 'var(--bg-base)',
        backgroundImage: [
          `repeating-linear-gradient(92deg, transparent 0px, var(--texture-grain) 1px, transparent 2px, transparent 14px)`,
          `repeating-linear-gradient(88deg, transparent 0px, var(--texture-line) 1px, transparent 3px, transparent 22px)`,
          `repeating-linear-gradient(90deg, var(--texture-shade-strong) 0px, transparent 1px, transparent 7px, var(--texture-shade) 8px, transparent 9px, transparent 18px)`,
          grain('0.02 0.4', 200, 0.05, 'turbulence', 3),
        ].join(', '),
      }
    default:
      return { background: 'var(--bg-base)' }
  }
}