// path: src/components/GlobalSearch.tsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '../store/store'
import { Search, BookOpen, Scroll, Sparkles, MapPin } from 'lucide-react'
import type { GlobalSearchResults } from '../types'
import { ARTICLE_TYPE_COLORS } from '../constants/articleTypes'

const EMPTY: GlobalSearchResults = { articles: [], sessions: [], notes: [], pois: [] }

type FlatItem =
  | { kind: 'article'; item: GlobalSearchResults['articles'][number] }
  | { kind: 'session'; item: GlobalSearchResults['sessions'][number] }
  | { kind: 'note';    item: GlobalSearchResults['notes'][number] }
  | { kind: 'poi';     item: GlobalSearchResults['pois'][number] }

const GROUPS: { kind: FlatItem['kind']; label: string; icon: React.ReactNode; accent: string }[] = [
  { kind: 'article', label: 'Wiki articles', icon: <BookOpen size={11} />, accent: '#5b9fe8' },
  { kind: 'session', label: 'Sessions',      icon: <Scroll size={11} />,   accent: 'var(--gold)' },
  { kind: 'note',    label: 'DM notes',      icon: <Sparkles size={11} />, accent: '#9b7de8' },
  { kind: 'poi',     label: 'Map pins',      icon: <MapPin size={11} />,   accent: '#49c185' },
]

export default function GlobalSearch() {
  const { currentCampaign, openArticle, setView, setCampaignSubView, navigateToSessionById, setDMNotesOpenPageId, setWikiGraphFocusId } = useStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Ctrl+K (standard command-palette key) or Ctrl+S toggles; Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['k', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        if (useStore.getState().currentCampaign) setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset state each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(EMPTY)
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (!open || !currentCampaign) return
    const q = query.trim()
    if (q.length < 2) { setResults(EMPTY); return }
    const t = setTimeout(() => {
      window.api.globalSearch(currentCampaign.id, q).then(r => {
        setResults(r)
        setActiveIdx(0)
      })
    }, 160)
    return () => clearTimeout(t)
  }, [query, open, currentCampaign?.id])

  const flat: FlatItem[] = useMemo(() => [
    ...results.articles.map(item => ({ kind: 'article' as const, item })),
    ...results.sessions.map(item => ({ kind: 'session' as const, item })),
    ...results.notes.map(item => ({ kind: 'note' as const, item })),
    ...results.pois.map(item => ({ kind: 'poi' as const, item })),
  ], [results])

  const go = (entry: FlatItem) => {
    setOpen(false)
    if (entry.kind === 'article') {
      openArticle(entry.item.id); setView('wiki')
    } else if (entry.kind === 'session') {
      navigateToSessionById(entry.item.id)
    } else if (entry.kind === 'note') {
      setDMNotesOpenPageId(entry.item.id); setView('dm-notes')
    } else if (entry.kind === 'poi') {
      if (entry.item.session_id) navigateToSessionById(entry.item.session_id)
      else if (entry.item.article_id) { openArticle(entry.item.article_id); setView('wiki') }
      else { setView('campaign'); setCampaignSubView('hub') }
    }
  }

  // Ctrl+Enter on an article: open the wiki graph focused on it instead of the
  // editor — "show me this thing in context".
  const goGraphFocus = (entry: FlatItem) => {
    if (entry.kind !== 'article') return go(entry)
    setOpen(false)
    setWikiGraphFocusId(entry.item.id)
    setView('wiki')
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flat[activeIdx]) {
      if (e.ctrlKey || e.metaKey) goGraphFocus(flat[activeIdx])
      else go(flat[activeIdx])
    }
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  return (
    <div
      onClick={e => e.target === e.currentTarget && setOpen(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', justifyContent: 'center', paddingTop: '14vh' }}
    >
      <div style={{ width: 580, maxWidth: '90vw', alignSelf: 'flex-start', background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: flat.length > 0 || query.trim().length >= 2 ? '1px solid var(--border)' : 'none' }}>
          <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search articles, sessions, notes, map pins…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>esc</span>
        </div>

        {/* Results */}
        {flat.length > 0 && (
          <div ref={listRef} style={{ maxHeight: '48vh', overflowY: 'auto', padding: '6px 0' }}>
            {GROUPS.map(group => {
              const entries = flat.filter(f => f.kind === group.kind)
              if (entries.length === 0) return null
              return (
                <div key={group.kind}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: group.accent }}>
                    {group.icon} {group.label}
                  </div>
                  {entries.map(entry => {
                    const idx = flat.indexOf(entry)
                    const active = idx === activeIdx
                    const title =
                      entry.kind === 'article' ? entry.item.title :
                      entry.kind === 'session' ? (entry.item.is_draft ? entry.item.name : `Session ${entry.item.session_number}${entry.item.session_sub}: ${entry.item.name}`) :
                      entry.kind === 'note' ? entry.item.title :
                      entry.item.label
                    const meta =
                      entry.kind === 'article' ? entry.item.article_type :
                      entry.kind === 'session' ? (entry.item.is_draft ? 'draft' : '') :
                      entry.kind === 'poi' ? entry.item.context : ''
                    const dot = entry.kind === 'article'
                      ? (ARTICLE_TYPE_COLORS[entry.item.article_type] ?? 'var(--text-muted)')
                      : null
                    return (
                      <button
                        key={`${entry.kind}-${(entry.item as any).id}`}
                        data-idx={idx}
                        onClick={() => go(entry)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        style={{
                          width: '100%', display: 'flex', flexDirection: 'column', gap: 2,
                          padding: '7px 16px', background: active ? 'var(--bg-hover)' : 'none',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                          {dot && <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                          {meta && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{meta}</span>}
                        </div>
                        {entry.item.snippet && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', paddingLeft: dot ? 15 : 0 }}>
                            {entry.item.snippet}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {flat.length === 0 && query.trim().length >= 2 && (
          <div style={{ padding: '18px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            No matches for “{query.trim()}”
          </div>
        )}

        {/* Footer */}
        {flat.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '6px 16px', display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-muted)' }}>
            <span>↑↓ navigate</span><span>↵ open</span>
            {flat[activeIdx]?.kind === 'article' && <span>ctrl+↵ view in graph</span>}
            <span>esc close</span>
          </div>
        )}
      </div>
    </div>
  )
}
