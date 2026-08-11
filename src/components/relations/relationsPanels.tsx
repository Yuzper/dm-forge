// path: src/components/relations/relationsPanels.tsx
import { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store/store'
import {
  Plus, Trash2, Pencil, Check, X, Search, ExternalLink, ChevronDown, MoreHorizontal,
  Link2, ChevronUp,
} from 'lucide-react'
import {
  type Rank, RANK_PALETTE, makeRankId, ARTICLE_TRACKS, ARTICLE_TYPE_LABELS, ALL_ARTICLE_TYPES,
} from './relationsShared'
import SwatchPicker, { ColorDotPicker } from '../SwatchPicker'

// ── Track Filter Panel ────────────────────────────────────────────────────────

export function TrackFilterPanel({
  trackFilters,
  onChange,
  onClose,
  articleTypesInWeb,
}: {
  trackFilters: Record<string, string[]>
  onChange: (filters: Record<string, string[]>) => void
  onClose: () => void
  articleTypesInWeb: string[]
}) {
  const [openType, setOpenType] = useState<string | null>(null)

  const types = articleTypesInWeb.length > 0
    ? articleTypesInWeb
    : ALL_ARTICLE_TYPES.slice(0, 4)

  const toggleTrack = (articleType: string, key: string) => {
    const current = trackFilters[articleType] || []
    const next = current.includes(key)
      ? current.filter(k => k !== key)
      : [...current, key]
    onChange({ ...trackFilters, [articleType]: next })
  }

  return (
    <div style={{
      position: 'absolute', top: 48, right: 12, zIndex: 100,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      width: 260, maxHeight: 480, overflow: 'auto',
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Track filters</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      <div style={{ padding: '4px 0 8px' }}>
        {types.map(articleType => {
          const tracks = ARTICLE_TRACKS[articleType] || {}
          const trackKeys = Object.keys(tracks)
          if (trackKeys.length === 0) return null
          const selected = trackFilters[articleType] || []
          const isOpen = openType === articleType
          return (
            <div key={articleType}>
              <button
                onClick={() => setOpenType(isOpen ? null : articleType)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)',
                  borderTop: '1px solid var(--border-light)', textAlign: 'left',
                }}
                className="hover-bg-elevated"
              >
                <span>{ARTICLE_TYPE_LABELS[articleType] || articleType}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selected.length > 0 && (
                    <span style={{ fontSize: 10, background: '#7F77DD22', color: '#7F77DD', borderRadius: 99, padding: '1px 6px' }}>
                      {selected.length}
                    </span>
                  )}
                  <ChevronDown size={12} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-muted)' }} />
                </div>
              </button>
              {isOpen && (
                <div style={{ padding: '4px 14px 8px' }}>
                  {trackKeys.map(key => {
                    const active = selected.includes(key)
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '4px 0', cursor: 'pointer',
                          fontSize: 12, color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                          border: active ? '1.5px solid #7F77DD' : '1.5px solid var(--border)',
                          background: active ? '#7F77DD' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {active && <Check size={9} color="#fff" />}
                        </div>
                        <input
                          type="checkbox" checked={active}
                          onChange={() => toggleTrack(articleType, key)}
                          style={{ display: 'none' }}
                        />
                        {key.replace(/_/g, ' ')}
                      </label>
                    )
                  })}
                  {selected.length > 0 && (
                    <button
                      onClick={() => onChange({ ...trackFilters, [articleType]: [] })}
                      style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Color-by-track Panel ──────────────────────────────────────────────────────
// Pick one track (Species, State…), get a legend of every value present in the
// web with an editable color; nodes are tinted by their value on the canvas.


export function ColorByPanel({ availableTracks, track, values, colors, onSelectTrack, onSetColor, onClose }: {
  // `multi` marks a track where some node holds several entries — a node can
  // only take one colour, so those are offered greyed-out and unselectable.
  availableTracks: { key: string; multi: boolean }[]
  track: string | null
  values: [string, number][]          // [track value, node count] — sorted
  colors: Record<string, string>      // effective color per value
  onSelectTrack: (track: string | null) => void
  onSetColor: (value: string, color: string) => void
  onClose: () => void
}) {
  const [picking, setPicking] = useState<string | null>(null)

  return (
    <div style={{
      position: 'absolute', top: 48, right: 12, zIndex: 100,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      width: 270, maxHeight: 480, overflow: 'auto',
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Color by track</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>

      <div style={{ padding: '10px 14px 12px' }}>
        <select
          className="input"
          value={track ?? ''}
          style={{ fontSize: 12, padding: '5px 8px', marginBottom: track ? 10 : 0 }}
          onChange={e => { setPicking(null); onSelectTrack(e.target.value || null) }}
        >
          <option value="">— no coloring —</option>
          {availableTracks.map(t => (
            <option key={t.key} value={t.key} disabled={t.multi}>
              {t.key.replace(/_/g, ' ')}{t.multi ? ' — multiple entries, can’t color' : ''}
            </option>
          ))}
        </select>

        {track && values.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No node in this web has a {track.replace(/_/g, ' ')} value yet.
          </div>
        )}

        {track && values.map(([value, count]) => (
          <div key={value}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <button
                onClick={() => setPicking(p => p === value ? null : value)}
                title="Change color"
                style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  background: colors[value], cursor: 'pointer',
                  border: picking === value ? '2px solid var(--text-primary)' : '2px solid transparent',
                  padding: 0,
                }}
              />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{count}</span>
            </div>
            {picking === value && (
              <div style={{ padding: '2px 0 8px 24px' }}>
                <SwatchPicker value={colors[value]} onChange={c => onSetColor(value, c)} size={15} gap={5} />
              </div>
            )}
          </div>
        ))}

        {track && values.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Nodes without a {track.replace(/_/g, ' ')} value keep their normal look.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Rank Panel ──────────────────────────────────────────────────────────────────

export function RankPanel({ ranks, onChange, onClose }: {
  ranks: Rank[]
  onChange: (next: Rank[]) => void
  onClose: () => void
}) {
  const update = (id: string, patch: Partial<Rank>) => onChange(ranks.map(r => r.id === id ? { ...r, ...patch } : r))
  const remove = (id: string) => onChange(ranks.filter(r => r.id !== id))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= ranks.length) return
    const next = ranks.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = () => onChange([...ranks, { id: makeRankId(), name: 'New rank', color: RANK_PALETTE[ranks.length % RANK_PALETTE.length] }])

  const arrowBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0, lineHeight: 0 }

  return (
    <div style={{
      position: 'absolute', top: 48, right: 12, zIndex: 100,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      width: 290, maxHeight: 480, overflow: 'auto', fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          Ranks <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>top = highest</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {ranks.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 2px 10px', lineHeight: 1.4 }}>
            No ranks yet — add tiers from highest to lowest.
          </div>
        )}
        {ranks.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...arrowBtn, opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={12} /></button>
              <button onClick={() => move(i, 1)} disabled={i === ranks.length - 1} style={{ ...arrowBtn, opacity: i === ranks.length - 1 ? 0.3 : 1 }}><ChevronDown size={12} /></button>
            </div>
            <ColorDotPicker value={r.color} onChange={c => update(r.id, { color: c })} size={22} title="Rank colour" />
            <input className="input" value={r.name} onChange={e => update(r.id, { name: e.target.value })}
              style={{ flex: 1, fontSize: 12, padding: '4px 8px', minWidth: 0 }} />
            <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2, flexShrink: 0 }}><Trash2 size={12} /></button>
          </div>
        ))}
        <button onClick={add}
          style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px', fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
          <Plus size={13} /> Add rank
        </button>
      </div>
    </div>
  )
}

// ── Linked Article Pill ──────────────────────────────────────────────────────
// Small corner overlay showing which article owns this web, with a redirect
// and a way to set/change/remove the link.

export function LinkedArticlePill({ webId, article, onReload }: {
  webId: number
  article: { id: number; title: string; article_type: string } | null
  onReload: () => void
}) {
  const { currentCampaign, navigateToArticleByTitle } = useStore()
  const [linking, setLinking] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!linking || !currentCampaign || !search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const arts = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: search.trim(), searchTitle: true, searchTags: false,
      })
      setResults((arts || []).slice(0, 6))
    }, 200)
  }, [search, linking, currentCampaign])

  const link = async (articleId: number) => {
    await (window as any).api.linkRelationWebArticle(webId, articleId)
    setLinking(false); setSearch(''); onReload()
  }
  const unlink = async () => {
    await (window as any).api.unlinkRelationWebArticle(webId)
    onReload()
  }

  const pillBase: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, zIndex: 10,
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 12,
  }

  if (linking) {
    return (
      <div style={{ ...pillBase, background: 'var(--bg-elevated)', border: '1px solid var(--border)', width: 220 }}>
        <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={11} color="var(--text-muted)" />
          <input
            autoFocus
            className="ghost-input"
            style={{ flex: 1, fontSize: 12 }}
            placeholder="Search articles…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setLinking(false); setSearch('') } }}
          />
          <button onClick={() => { setLinking(false); setSearch('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 1 }}>
            <X size={11} />
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {results.map(a => (
              <button key={a.id} onClick={() => link(a.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', textAlign: 'left' }}
                className="hover-bg">
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{a.article_type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!article) {
    return (
      <button onClick={() => setLinking(true)}
        style={{ ...pillBase, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
        title="Link this web to an article so it appears there">
        <Link2 size={11} /> Link to article
      </button>
    )
  }

  return (
    <div style={{ ...pillBase, display: 'flex', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <button
        onClick={() => navigateToArticleByTitle(article.title)}
        title={`Go to ${article.title}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', '--hover-accent': '#7F77DD' } as React.CSSProperties}
        className="hover-accent"
      >
        <ExternalLink size={11} color="#7F77DD" style={{ flexShrink: 0 }} />
        <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{article.title}</span>
      </button>
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
      <button onClick={() => setLinking(true)} title="Change linked article"
        style={{ display: 'flex', padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        className="hover-text-secondary">
        <Pencil size={10} />
      </button>
      <button onClick={unlink} title="Unlink article"
        style={{ display: 'flex', padding: '5px 7px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', '--hover-accent': 'var(--danger)' } as React.CSSProperties}
        className="hover-accent">
        <X size={10} />
      </button>
    </div>
  )
}
// ── Web Card Menu ─────────────────────────────────────────────────────────────

export function WebMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        className="btn btn-ghost btn-icon btn-sm"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); setConfirmDelete(false) }}
        style={{ color: 'var(--text-muted)' }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', minWidth: 150, zIndex: 50, overflow: 'hidden' }}>
          {onEdit && (
            <button
              onClick={e => { e.stopPropagation(); onEdit(); setOpen(false); setConfirmDelete(false) }}
              className="menu-item"
            >
              <Pencil size={13} /> Edit
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); if (!confirmDelete) { setConfirmDelete(true); return } onDelete(); setOpen(false) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', textAlign: 'left', color: confirmDelete ? 'var(--danger-hover)' : '#e05555' }}
            className="hover-bg"
          >
            <Trash2 size={13} /> {confirmDelete ? 'Confirm delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}
