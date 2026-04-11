// path: src/App.tsx
import { useEffect } from 'react'
import { useStore } from './store/store'
import Sidebar from './components/Sidebar'
import CampaignsPage from './pages/CampaignsPage'
import CampaignDetailPage from './pages/CampaignDetailPage'
import SessionPage from './pages/SessionPage'
import WikiPage from './pages/WikiPage'
import StatBlockPage from './pages/StatBlockPage'

export default function App() {
  const { view, loadCampaigns } = useStore()

  useEffect(() => { loadCampaigns() }, [])
  
  const params = new URLSearchParams(window.location.search)
  if (params.get('mode') === 'statblock') {
    const articleId = parseInt(params.get('articleId') || '0')
    if (articleId) return <StatBlockPage articleId={articleId} />
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'campaigns' && <CampaignsPage />}
        {view === 'campaign'  && <CampaignDetailPage />}
        {view === 'session'   && <SessionPage />}
        {view === 'wiki'      && <WikiPage />}
      </main>
    </div>
  )
}
