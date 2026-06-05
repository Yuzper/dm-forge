// path: src/components/StatBlockOverlay.tsx
import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store/store'
import type { StatBlockOverlayEntry } from '../store/store'
import type { Article } from '../types'
import { parseStatBlock } from '../types'
import StatBlockView from './StatBlockView'

interface Props {
  overlay: StatBlockOverlayEntry
  index: number        // used to stagger initial positions
}

export default function StatBlockOverlay({ overlay, index }: Props) {
  const { closeStatBlockOverlay } = useStore()
  const [article, setArticle] = useState<Article | null>(null)

  // Drag state — initialise staggered so multiple overlays don't pile up exactly
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getArticle(overlay.articleId).then(a => { if (a) setArticle(a) })
  }, [overlay.articleId])

  // ── Drag ────────────────────────────────────────────────────────────────────

  const onDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const rect = panelRef.current!.getBoundingClientRect()
    const ox = e.clientX - rect.left
    const oy = e.clientY - rect.top
    const onMove = (me: MouseEvent) => setPos({
      x: Math.max(0, Math.min(window.innerWidth  - PANEL_W, me.clientX - ox)),
      y: Math.max(0, Math.min(window.innerHeight - 36,      me.clientY - oy)),
    })
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Position ─────────────────────────────────────────────────────────────────
  // Default: cascade from the top-right, offset by index
  const PANEL_W = 380
  const STAGGER  = 28
  const posStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 1001 + index }
    : {
        position: 'fixed',
        right: 24 + index * STAGGER,
        top:   80 + index * STAGGER,
        zIndex: 1001 + index,
      }

  const statblock  = parseStatBlock(overlay.statblockOverride ?? article?.statblock ?? '{}')
  const displayName = overlay.nameOverride ?? article?.title ?? '…'
  const articleType = article?.article_type ?? 'creature'

  return (
    <div
      ref={panelRef}
      style={{
        ...posStyle,
        width: PANEL_W,
        maxHeight: '80vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(200,168,75,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          padding: '8px 10px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-gold)',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'grab', flexShrink: 0,
        }}
      >
        <span style={{
          flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'var(--font-display)', color: 'var(--gold)', letterSpacing: '0.04em',
        }}>
          {displayName}
        </span>
        <button
          onClick={() => closeStatBlockOverlay(overlay.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0,
            transition: 'color var(--transition)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger-soft)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}
          title="Close"
        >
          <X size={13} />
        </button>
      </div>

      {/* Stat block body — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, userSelect: 'text' }}>
        {article ? (
          <StatBlockView
            statblock={statblock}
            name={displayName}
            articleType={articleType}
          />
        ) : (
          <div style={{
            padding: '32px 0', textAlign: 'center',
            color: 'var(--text-muted)', fontSize: 12,
            fontFamily: 'var(--font-body)', fontStyle: 'italic',
          }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  )
}
