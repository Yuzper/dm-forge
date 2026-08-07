// path: src/App.tsx
import { Fragment, useEffect } from 'react'
import type React from 'react'
import { useStore } from './store/store'
import { applyTheme, getStoredTheme, applyTextTheme, getStoredTextTheme } from './constants/themes'

// Apply saved colour + text themes before the first render so there's no flash.
// Text theme applies after the colour theme so it overrides the theme's text vars.
applyTheme(getStoredTheme())
applyTextTheme(getStoredTextTheme())
import Sidebar from './components/Sidebar'
import StatBlockPage from './pages/StatBlockPage'
import { UpdateBanner } from './components/UpdateBanner'
import SoundboardWidget from './components/SoundboardWidget'
import StatBlockOverlay from './components/StatBlockOverlay'
import HintsWidget from './components/HintsWidget'
import GlobalSearch from './components/GlobalSearch'
import FindBar from './components/FindBar'
import PlayersManager from './components/PlayersManager'
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
  const { loadCampaigns, bgStyle, currentCampaign, soundboardOpen, statBlockOverlays, playersManagerOpen, paneIds, splitRatio } = useStore()

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', ...bgStyleCSS(bgStyle) }}>
      <Sidebar />
      <UpdateBanner />
      {/* Persists across the campaign (not just the session) so music keeps
          playing when you leave a session; it auto-minimises off-session. */}
      {currentCampaign && soundboardOpen && <SoundboardWidget />}
      {statBlockOverlays.map((o, i) => <StatBlockOverlay key={o.id} overlay={o} index={i} />)}
      <HintsWidget />
      <GlobalSearch />
      <FindBar />
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

function bgStyleCSS(style: string): React.CSSProperties {
  switch (style) {
    case 'parchment':
      return {
        background: 'var(--bg-base)',
        backgroundImage: [
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E")`,
        ].join(', '),
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
          `repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.018) 39px, rgba(255,255,255,0.018) 40px)`,
          `repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.018) 59px, rgba(255,255,255,0.018) 60px)`,
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='80' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        ].join(', '),
      }
    case 'wood':
      return {
        backgroundColor: 'var(--bg-base)',
        backgroundImage: [
          `repeating-linear-gradient(92deg, transparent 0px, rgba(255,255,255,0.02) 1px, transparent 2px, transparent 14px)`,
          `repeating-linear-gradient(88deg, transparent 0px, rgba(255,255,255,0.015) 1px, transparent 3px, transparent 22px)`,
          `repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, transparent 1px, transparent 7px, rgba(0,0,0,0.06) 8px, transparent 9px, transparent 18px)`,
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.02 0.4' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
        ].join(', '),
      }
    default:
      return { background: 'var(--bg-base)' }
  }
}