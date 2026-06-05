// path: src/App.tsx
import { useEffect } from 'react'
import type React from 'react'
import { useStore } from './store/store'
import Sidebar from './components/Sidebar'
import CampaignsPage from './pages/CampaignsPage'
import CampaignDetailPage from './pages/CampaignDetailPage'
import SessionPage from './pages/SessionPage'
import WikiPage from './pages/WikiPage'
import DMNotesPage from './pages/DMNotesPage'
import LootTablesPage from './pages/LootTablesPage'
import StatBlockPage from './pages/StatBlockPage'
import { UpdateBanner } from './components/UpdateBanner'
import RelationsPage from './pages/RelationsPage'
import TimelinePage from './pages/TimelinePage'
import SoundboardPage from './pages/SoundboardPage'
import SoundboardWidget from './components/SoundboardWidget'
import StatBlockOverlay from './components/StatBlockOverlay'
import HintsWidget from './components/HintsWidget'

const params = new URLSearchParams(window.location.search)
const statblockMode = params.get('mode') === 'statblock'
const statblockArticleId = statblockMode ? parseInt(params.get('articleId') || '0') : 0
const statblockOverride = statblockMode ? params.get('statblockOverride') : null
const nameOverride = statblockMode ? params.get('nameOverride') : null

export default function App() {
  const { view, loadCampaigns, bgStyle, currentSession, soundboardOpen, statBlockOverlays } = useStore()

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', ...bgStyleCSS(bgStyle) }}>
      <Sidebar />
      <UpdateBanner />
      {currentSession && soundboardOpen && <SoundboardWidget />}
      {statBlockOverlays.map((o, i) => <StatBlockOverlay key={o.id} overlay={o} index={i} />)}
      <HintsWidget />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'campaigns'   && <CampaignsPage />}
        {view === 'campaign'    && <CampaignDetailPage />}
        {view === 'session'     && <SessionPage />}
        {view === 'wiki'        && <WikiPage />}
        {view === 'dm-notes'    && <DMNotesPage />}
        {view === 'loot-tables' && <LootTablesPage />}
        {view === 'relations'   && <RelationsPage />}
        {view === 'timeline'    && <TimelinePage />}
        {view === 'soundboard'  && <SoundboardPage />}
      </main>
    </div>
  )
}

function bgStyleCSS(style: string): React.CSSProperties {
  switch (style) {
    case 'parchment':
      return {
        background: '#0d0b09',
        backgroundImage: [
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.055'/%3E%3C/svg%3E")`,
        ].join(', '),
        backgroundRepeat: 'repeat',
      }
    case 'vignette':
      return {
        background: 'radial-gradient(ellipse at 50% 45%, #1c160f 0%, #100d08 45%, #050403 100%)',
      }
    case 'stone':
      return {
        backgroundColor: '#0d0b09',
        backgroundImage: [
          `repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.018) 39px, rgba(255,255,255,0.018) 40px)`,
          `repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.018) 59px, rgba(255,255,255,0.018) 60px)`,
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='120' height='80' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        ].join(', '),
      }
    case 'wood':
      return {
        backgroundColor: '#0a0806',
        backgroundImage: [
          `repeating-linear-gradient(92deg, transparent 0px, rgba(200,168,75,0.012) 1px, transparent 2px, transparent 14px)`,
          `repeating-linear-gradient(88deg, transparent 0px, rgba(180,140,60,0.01) 1px, transparent 3px, transparent 22px)`,
          `repeating-linear-gradient(90deg, rgba(0,0,0,0.12) 0px, transparent 1px, transparent 7px, rgba(0,0,0,0.06) 8px, transparent 9px, transparent 18px)`,
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.02 0.4' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
        ].join(', '),
      }
    default:
      return { background: 'var(--bg-base)' }
  }
}