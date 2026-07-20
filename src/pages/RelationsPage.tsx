// path: src/pages/RelationsPage.tsx
import { useState, useEffect } from 'react'
import { useStore } from '../store/store'
import { Network, Plus, ArrowLeft } from 'lucide-react'
import {
  type RelationWeb, TEMPLATE_CONFIG,
} from '../components/relations/relationsShared'
import RelationsCanvasView from '../components/relations/RelationsCanvasView'
import { NewWebModal } from '../components/relations/relationsModals'
import { WebMenu } from '../components/relations/relationsPanels'

// ── Hub View ───────────────────────────────────────────────────────────────────

function RelationsHubView({ onOpenWeb }: { onOpenWeb: (web: RelationWeb) => void }) {
  const { currentCampaign, setView, setCampaignSubView } = useStore()
  const [webs, setWebs] = useState<RelationWeb[]>([])
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!currentCampaign) return
    ;(window as any).api.getRelationWebs(currentCampaign.id).then(setWebs)
  }, [currentCampaign?.id])



  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => { setView('campaign'); setCampaignSubView('hub') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: '1px solid var(--border)', paddingRight: 12, marginRight: 4, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
              className="hover-text"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <Network size={22} color='#7F77DD' />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, letterSpacing: '0.03em', color: 'var(--text-primary)', margin: 0 }}>Relations</h1>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{webs.length} web{webs.length !== 1 ? 's' : ''}</span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Plus size={15} /> New web
          </button>
        </div>
        <div style={{ height: 14 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {webs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, color: 'var(--text-muted)' }}>
            <Network size={32} strokeWidth={1} />
            <div style={{ fontSize: 14 }}>No webs yet — create one to start mapping relationships</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {webs.map(web => (
              <div key={web.id}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px', cursor: 'pointer', transition: 'border-color var(--transition)', position: 'relative', '--hover-accent': 'var(--border-gold)' } as React.CSSProperties}
                onClick={() => onOpenWeb(web)}
                className="hover-border-accent"
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, background: 'var(--bg-elevated)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--gold)' }}>
                    <Network size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{web.name}</div>
                    {web.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{web.description}</div>
                    )}
                  </div>
                  <WebMenu onDelete={async () => {
                    await (window as any).api.deleteRelationWeb(web.id)
                    setWebs(prev => prev.filter(w => w.id !== web.id))
                  }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 99 }}>{web.node_count} node{web.node_count !== 1 ? 's' : ''}</span>
                  {(web.template && web.template !== 'custom') && (
                    <span style={{ fontSize: 11, color: '#3C3489', padding: '2px 8px', background: '#EEEDFE', borderRadius: 99 }}>{TEMPLATE_CONFIG[web.template]?.label}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(web.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span> 
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewWebModal
          onClose={() => setShowNew(false)}
          onCreated={web => { setWebs(prev => [...prev, web]); setShowNew(false); onOpenWeb(web) }}
        />
      )}
    </div>
  )
}
// ── Page Root ──────────────────────────────────────────────────────────────────

export default function RelationsPage() {
  const { relationsOpenWebId, setRelationsOpenWebId, relationsFocusArticleId, setRelationsFocusArticleId, setHintContext, patchLastHistoryEntry } = useStore()
  useEffect(() => { setHintContext('relations'); return () => setHintContext(null) }, [setHintContext])
  const [openWeb, setOpenWeb] = useState<RelationWeb | null>(null)

  // Record the open web (and its name as the label) into the current Recent
  // entry, so returning to it reopens the same web rather than the hub.
  useEffect(() => {
    patchLastHistoryEntry('relations', openWeb
      ? { webId: openWeb.id, label: openWeb.name }
      : { webId: null, label: 'Relations' })
  }, [openWeb, patchLastHistoryEntry])
  const [loading, setLoading] = useState(false)
  // Deep-link focus: select + center the node linked to this article on open.
  const [focusArticleId, setFocusArticleId] = useState<number | null>(null)

  // On mount: if the store has a pending web id, fetch and open it
  useEffect(() => {
    if (!relationsOpenWebId) return
    setLoading(true)
    ;(window as any).api.getRelationWebs
      ? (async () => {
          // We don't have a get-single endpoint, so we use the hub list and find the right one
          // The web data will be fetched inside RelationsCanvasView via getRelationWebData
          // We just need the web metadata (name etc) — synthesise a minimal object
          const id = relationsOpenWebId
          const focus = relationsFocusArticleId
          setRelationsOpenWebId(null) // clear so back-nav works normally
          setRelationsFocusArticleId(null)
          setFocusArticleId(focus)
          // Fetch the web from list to get its name
          const { currentCampaign } = useStore.getState()
          if (!currentCampaign) { setLoading(false); return }
          const webs: RelationWeb[] = await (window as any).api.getRelationWebs(currentCampaign.id)
          const web = webs.find(w => w.id === id)
          if (web) setOpenWeb(web)
          setLoading(false)
        })()
      : setLoading(false)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
      Loading…
    </div>
  )

  if (openWeb) {
    return <RelationsCanvasView key={openWeb.id} web={openWeb} focusArticleId={focusArticleId} onBack={() => { setOpenWeb(null); setFocusArticleId(null) }} />
  }

  return <RelationsHubView onOpenWeb={web => { setFocusArticleId(null); setOpenWeb(web) }} />
}
