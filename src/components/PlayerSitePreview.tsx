// path: src/components/PlayerSitePreview.tsx
// Preview-as-player: renders one player's bundle exactly as the publish pipeline
// would build it, without writing or encrypting anything.
//
// This is the safety net the whole visibility model was missing. Every redaction
// rule — DM-only marks and blocks, per-track eyes, link scrubbing, map grants,
// the always-strip whitelist — is only as good as the DM's ability to check it,
// and until now the only way to check was to publish, host, and log in as the
// player. The bundle here comes from buildPlayerBundle over IPC and the prose
// goes through the same shared/PlayerContent the published site uses, so what
// shows up on this screen is what they get.
import { useEffect, useMemo, useState } from 'react'
import { Eye, Loader2, MapPin, Shapes, FileText, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/store'
import Modal from './Modal'
import PlayerContent from '../../shared/PlayerContent'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'
import type { PlayerBundle, PlayerBundleArticle, PlayerPreviewResult } from '../types'

const colorForType = (t: string) => (ARTICLE_TYPE_COLORS as Record<string, string>)[t] ?? 'var(--text-muted)'

export default function PlayerSitePreview({ onClose }: { onClose: () => void }) {
  const players = useStore(s => s.players)
  const currentCampaign = useStore(s => s.currentCampaign)
  const loadPlayers = useStore(s => s.loadPlayers)

  const [playerId, setPlayerId] = useState<number | null>(null)
  const [result, setResult] = useState<PlayerPreviewResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => { if (players.length === 0) loadPlayers() }, [])
  useEffect(() => { if (playerId == null && players.length) setPlayerId(players[0].id) }, [players])

  useEffect(() => {
    if (!currentCampaign || playerId == null) return
    let cancelled = false
    setLoading(true)
    window.api.previewPlayerSite(currentCampaign.id, playerId).then(r => {
      if (cancelled) return
      setResult(r)
      setSelectedId(r.bundle?.articles[0]?.id ?? null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [currentCampaign?.id, playerId])

  const bundle: PlayerBundle | undefined = result?.bundle
  // The bundle's paths are relative to a site that hasn't been written yet, so
  // point them back at the originals in userData for the duration of the preview.
  const resolveSrc = useMemo(() => {
    const paths = result?.imagePaths ?? {}
    return (src: string) => {
      if (!src.startsWith('images/')) return src
      const abs = paths[src.slice('images/'.length)]
      return abs ? `file://${abs}` : src
    }
  }, [result])

  const selected = bundle?.articles.find(a => a.id === selectedId) ?? null
  const hiddenCount = (result?.totals?.articles ?? 0) - (bundle?.articles.length ?? 0)

  const pinCount = bundle?.maps.reduce((n, m) => n + m.pois.length, 0) ?? 0
  const shapeCount = bundle?.maps.reduce((n, m) => n + m.shapes.length, 0) ?? 0

  return (
    <Modal title="Preview as player" onClose={onClose} style={{ width: 1000, maxWidth: '95vw' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Eye size={13} style={{ color: 'var(--gold)' }} />
        <select className="input" value={playerId ?? ''} style={{ height: 30, paddingTop: 0, paddingBottom: 0, fontSize: 12, width: 200 }}
          onChange={e => setPlayerId(e.target.value ? Number(e.target.value) : null)}>
          {players.length === 0 && <option value="">No players yet</option>}
          {players.map(p => <option key={p.id} value={p.id}>{p.display_name || p.username}</option>)}
        </select>
        {loading && <Loader2 size={13} className="spin" style={{ color: 'var(--text-muted)' }} />}
        {bundle && !loading && (
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span><FileText size={11} style={{ verticalAlign: -1 }} /> {bundle.articles.length} page{bundle.articles.length === 1 ? '' : 's'}
              {hiddenCount > 0 && <span style={{ opacity: 0.7 }}> · {hiddenCount} hidden</span>}</span>
            <span><MapPin size={11} style={{ verticalAlign: -1 }} /> {pinCount} pin{pinCount === 1 ? '' : 's'}</span>
            <span><Shapes size={11} style={{ verticalAlign: -1 }} /> {shapeCount} region{shapeCount === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      {result && !result.success && (
        <div style={{ fontSize: 12, color: 'var(--danger, #c0432f)', padding: '10px 0' }}>{result.error}</div>
      )}

      {bundle && bundle.articles.length === 0 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', padding: '20px 0' }}>
          <AlertTriangle size={14} style={{ color: 'var(--gold)' }} />
          This player can see nothing yet. Share a page with them, or with the whole party.
        </div>
      )}

      {bundle && bundle.articles.length > 0 && (
        <div style={{ display: 'flex', gap: 14, height: '62vh', minHeight: 320 }}>
          {/* What's in their sidebar */}
          <nav style={{
            width: 220, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', paddingRight: 8,
          }}>
            {bundle.articles.map(a => (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                  padding: '6px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${a.id === selectedId ? 'var(--gold-dim)' : 'transparent'}`,
                  background: a.id === selectedId ? 'rgba(200,168,75,0.10)' : 'transparent',
                  color: a.id === selectedId ? 'var(--gold)' : 'var(--text-secondary)',
                }}
                className={a.id === selectedId ? '' : 'hover-bg'}>
                <span style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, background: colorForType(a.article_type) }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
              </button>
            ))}
          </nav>

          {/* The page as they'd read it */}
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6 }}>
            {selected && <PreviewArticle article={selected} bundle={bundle} resolveSrc={resolveSrc} onOpen={setSelectedId} />}
          </div>
        </div>
      )}
    </Modal>
  )
}

function PreviewArticle({ article, bundle, resolveSrc, onOpen }: {
  article: PlayerBundleArticle
  bundle: PlayerBundle
  resolveSrc: (src: string) => string
  onOpen: (id: number) => void
}) {
  const c = colorForType(article.article_type)
  const backlinks = bundle.backlinks[article.id] ?? []
  const openTitle = (title: string) => {
    const hit = bundle.articles.find(a => a.title.toLowerCase() === title.toLowerCase())
    if (hit) onOpen(hit.id)
  }

  return (
    <article>
      {article.portrait_image && (
        <img src={resolveSrc(article.portrait_image)} alt=""
          style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 6, float: 'right', marginLeft: 12, border: `1px solid ${c}55` }} />
      )}
      <h2 style={{ margin: '0 0 2px', fontSize: 19, color: 'var(--text-primary)' }}>{article.title}</h2>
      <div style={{ fontSize: 11, color: c, marginBottom: 10 }}>{article.article_type}</div>

      {article.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {article.tags.map(t => (
            <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>#{t}</span>
          ))}
        </div>
      )}

      {(article.infoTracks.length > 0 || article.milestones.length > 0) && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 12, fontSize: 12 }}>
          {article.infoTracks.map(tr => (
            <div key={tr.label} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 96 }}>{tr.label}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{tr.value}</span>
            </div>
          ))}
          {article.milestones.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 96 }}>{m.date || 'Milestone'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="player-preview-prose">
        <PlayerContent json={article.content} onWikiLink={openTitle} resolveSrc={resolveSrc} />
      </div>

      {article.statblock && (
        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 10 }}>
          + their own stat block (shared because this is their character)
        </div>
      )}

      {backlinks.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 5 }}>
            Referenced by
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {backlinks.map(b => (
              <button key={b.id} onClick={() => onOpen(b.id)}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, cursor: 'pointer', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-muted)' }}
                className="hover-gold-border">{b.title}</button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}
