// path: src/components/relations/relationsModals.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { useStore } from '../../store/store'
import {
  Plus, Trash2, X, Search, Network,
} from 'lucide-react'
import {
  type WebTemplate, WEB_TEMPLATES, TEMPLATE_CONFIG, RANK_PRESETS,
  buildRanksFromPreset, type RelationWeb, type DBRelationNode, type DBRelationEdge,
  ALL_ARTICLE_TYPES, ARTICLE_TYPE_LABELS, findFreePosition,
} from './relationsShared'

// ── Modals ─────────────────────────────────────────────────────────────────────

export function NewWebModal({ onClose, onCreated, lockedArticle }: {
  onClose: () => void
  onCreated: (web: RelationWeb) => void
  // When provided, the web is pre-linked to this article (any template) and the
  // article-search UI is hidden — used by the "Create web" flow from an article.
  lockedArticle?: { id: number; title: string }
}) {
  const { currentCampaign } = useStore()
  const [name, setName] = useState(lockedArticle?.title ?? '')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState<WebTemplate>('custom')
  const [ladderId, setLadderId] = useState<string>('crime')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Hierarchy webs link to an article (any type). Link an existing one, or
  // create a new one of the chosen type when none is selected.
  const [linkedArticle, setLinkedArticle] = useState<{ id: number; title: string } | null>(null)
  const [articleSearch, setArticleSearch] = useState('')
  const [articleResults, setArticleResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const [newArticleType, setNewArticleType] = useState('organization')
  const articleDebounce = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!currentCampaign || !articleSearch.trim()) { setArticleResults([]); return }
    clearTimeout(articleDebounce.current)
    articleDebounce.current = setTimeout(async () => {
      const arts = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: articleSearch.trim(), searchTitle: true, searchTags: false,
      })
      setArticleResults((arts || []).slice(0, 6))
    }, 200)
  }, [articleSearch, currentCampaign])

  const handleCreate = async () => {
    if (!name.trim() || !currentCampaign) return
    setSaving(true)
    setError(null)
    try {
      const ranked = TEMPLATE_CONFIG[template].ranked
      const ranks = ranked ? buildRanksFromPreset(RANK_PRESETS.find(p => p.id === ladderId)?.ranks ?? []) : []

      // Resolve the linked article. When locked (created from an article), that
      // article is the link for any template. Otherwise hierarchy webs link an
      // article (existing or auto-created).
      let articleId: number | null = null
      if (lockedArticle) {
        articleId = lockedArticle.id
      } else if (ranked) {
        if (linkedArticle) {
          articleId = linkedArticle.id
        } else {
          try {
            const art = await (window as any).api.createArticle({
              campaign_id: currentCampaign.id, title: name.trim(), article_type: newArticleType,
            })
            articleId = art.id
          } catch {
            // Title taken — link the existing article with that name instead.
            const matches = await (window as any).api.getArticlesList({
              campaignId: currentCampaign.id, search: name.trim(), searchTitle: true, searchTags: false,
            })
            const exact = (matches || []).find((a: any) => a.title.toLowerCase() === name.trim().toLowerCase())
            articleId = exact?.id ?? null
          }
        }
      }

      const web = await (window as any).api.createRelationWeb({
        campaign_id: currentCampaign.id, name: name.trim(), description: description.trim(), template,
        ranks: JSON.stringify(ranks), article_id: articleId,
      })
      onCreated(web)
    } catch (err: any) {
      console.error('createRelationWeb failed:', err)
      setError(err?.message || 'Failed to create web — please try again.')
      setSaving(false)
    }
  }

  const TEMPLATES = WEB_TEMPLATES

  const cfg = TEMPLATE_CONFIG[template]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">New web</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Template</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '8px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                    background: template === t.id ? 'var(--bg-elevated)' : 'transparent',
                    border: template === t.id ? '1.5px solid #7F77DD' : '1px solid var(--border)',
                    transition: 'all 0.12s',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Feature badges for selected template */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cfg.unionNodes && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC' }}>Union nodes</span>
            )}
            {cfg.dagreDir ? (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '0.5px solid var(--border)' }}>
                {cfg.dagreDir === 'TB' ? 'Top-down' : 'Left→right'} tidy-up
              </span>
            ) : (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '0.5px solid var(--border)' }}>Free canvas</span>
            )}
            {cfg.ranked && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC' }}>Rank tiers</span>
            )}
          </div>
          {cfg.ranked && (
            <div className="input-group">
              <label className="input-label">Starting ranks <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(editable later)</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RANK_PRESETS.map(p => (
                  <button key={p.id} onClick={() => setLadderId(p.id)}
                    style={{
                      fontSize: 11, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                      background: ladderId === p.id ? 'var(--bg-elevated)' : 'transparent',
                      border: ladderId === p.id ? '1.5px solid #7F77DD' : '1px solid var(--border)',
                      color: ladderId === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {(() => {
                const preset = RANK_PRESETS.find(p => p.id === ladderId)
                return preset && preset.ranks.length > 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{preset.ranks.join(' › ')}</div>
                ) : null
              })()}
            </div>
          )}
          {lockedArticle && (
            <div className="input-group">
              <label className="input-label">Linked article</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                <Network size={13} color="#7F77DD" />
                <span style={{ flex: 1, fontSize: 13 }}>{lockedArticle.title}</span>
              </div>
            </div>
          )}
          {cfg.ranked && !lockedArticle && (
            <div className="input-group">
              <label className="input-label">Linked article</label>
              {linkedArticle ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                  <Network size={13} color="#7F77DD" />
                  <span style={{ flex: 1, fontSize: 13 }}>{linkedArticle.title}</span>
                  <button onClick={() => setLinkedArticle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}><X size={13} /></button>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input className="input" style={{ paddingLeft: 30 }} placeholder="Link an existing article…"
                      value={articleSearch} onChange={e => setArticleSearch(e.target.value)} />
                  </div>
                  {articleResults.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
                      {articleResults.map(a => (
                        <button key={a.id} onClick={() => { setLinkedArticle(a); setArticleSearch('') }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                          className="hover-bg-elevated">
                          {a.title}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.article_type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>Or create a new</span>
                    <select className="input" value={newArticleType} onChange={e => setNewArticleType(e.target.value)} style={{ fontSize: 12, padding: '3px 6px', width: 'auto' }}>
                      {ALL_ARTICLE_TYPES.map(t => <option key={t} value={t}>{ARTICLE_TYPE_LABELS[t] || t}</option>)}
                    </select>
                    <span>named “{name.trim() || '…'}”.</span>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="input-group">
            <label className="input-label">Name</label>
            <input className="input" autoFocus
              placeholder={template === 'family_tree' ? 'House Valarys bloodline…' : template === 'org_hierarchy' ? 'The King\'s council…' : 'My web…'}
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          </div>
          <div className="input-group">
            <label className="input-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input className="input" placeholder="A brief description…"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim() || saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#e05555', background: 'rgba(224,85,85,0.08)', borderRadius: 6, padding: '8px 12px' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

export function AddNodeModal({ webId, existingNodes, onClose, onAdded, typeFilter, onTypeFilterChange }: {
  webId: number; existingNodes: DBRelationNode[]; onClose: () => void; onAdded: (nodes: DBRelationNode[]) => void
  typeFilter: string | null; onTypeFilterChange: (t: string | null) => void
}) {
  const { currentCampaign } = useStore()
  // 'search' = link existing article(s), 'new' = create a stub node
  const [mode, setMode] = useState<'search' | 'new'>('search')
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  // Multi-select: link several existing articles as nodes in one go.
  const [selected, setSelected] = useState<{ id: number; title: string; article_type?: string }[]>([])
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Articles already present as nodes — hidden from results to avoid duplicates.
  const existingArticleIds = useMemo(
    () => new Set(existingNodes.map(n => n.article_id).filter(Boolean) as number[]),
    [existingNodes],
  )

  useEffect(() => {
    if (!currentCampaign || !search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const articles = await (window as any).api.getArticlesList({
        campaignId: currentCampaign.id, search: search.trim(), searchTitle: true, searchTags: false,
      })
      const filtered = typeFilter ? articles.filter((a: any) => a.article_type === typeFilter) : articles
      setResults(filtered.slice(0, 12))
    }, 200)
  }, [search, currentCampaign, typeFilter])

  const selectedIds = new Set(selected.map(a => a.id))
  const visibleResults = results.filter(a => !selectedIds.has(a.id) && !existingArticleIds.has(a.id))

  const toggleSelect = (a: { id: number; title: string; article_type?: string }) =>
    setSelected(prev => prev.some(s => s.id === a.id) ? prev.filter(s => s.id !== a.id) : [...prev, a])

  const handleAdd = async () => {
    if (mode === 'new') {
      if (!name.trim()) return
      setSaving(true)
      const { x, y } = findFreePosition(existingNodes)
      const node = await (window as any).api.createRelationNode({
        web_id: webId, label: name.trim(), article_id: null, pos_x: x, pos_y: y,
      })
      onAdded([node])
      return
    }
    // search mode — bulk-create one node per selected article
    if (selected.length === 0) return
    setSaving(true)
    const placed = existingNodes.map(n => ({ pos_x: n.pos_x, pos_y: n.pos_y }))
    const created: DBRelationNode[] = []
    for (const a of selected) {
      const { x, y } = findFreePosition(placed)
      const node = await (window as any).api.createRelationNode({
        web_id: webId,
        // Single selection keeps the optional label override; bulk uses titles.
        label: (selected.length === 1 && name.trim()) ? name.trim() : a.title,
        article_id: a.id,
        pos_x: x, pos_y: y,
      })
      placed.push({ pos_x: x, pos_y: y })
      created.push(node)
    }
    onAdded(created)
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--bg-surface)' : 'transparent',
    border: 'none', borderRadius: 'var(--radius-sm)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add node{selected.length > 1 ? 's' : ''}</div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', gap: 3, padding: 3,
          background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
          marginBottom: 16,
        }}>
          <button style={tabStyle(mode === 'search')} onClick={() => { setMode('search'); setName('') }}>
            🔗 Link existing article{selected.length !== 1 ? 's' : ''}
          </button>
          <button style={tabStyle(mode === 'new')} onClick={() => { setMode('new'); setSelected([]); setSearch('') }}>
            ✦ New node (no article yet)
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'search' ? (
            <>
              {/* Selected chips */}
              {selected.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.map(a => (
                    <span key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 99, border: '1px solid var(--border-light)', fontSize: 12 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3dbf7f', flexShrink: 0 }} />
                      {a.title}
                      <button onClick={() => toggleSelect(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="input-group">
                <label className="input-label">
                  Search for existing articles <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(select multiple)</span>
                </label>
                {/* Article type filter chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {ALL_ARTICLE_TYPES.map(t => (
                    <button key={t} onClick={() => onTypeFilterChange(typeFilter === t ? null : t)}
                      style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 99, cursor: 'pointer',
                        background: typeFilter === t ? '#7F77DD' : 'var(--bg-elevated)',
                        border: typeFilter === t ? '1px solid #7F77DD' : '1px solid var(--border)',
                        color: typeFilter === t ? '#fff' : 'var(--text-secondary)',
                        transition: 'all 0.12s',
                      }}>
                      {ARTICLE_TYPE_LABELS[t] || t}
                    </button>
                  ))}
                  {typeFilter && (
                    <button onClick={() => onTypeFilterChange(null)}
                      style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, cursor: 'pointer', background: 'none', border: '1px solid var(--border-light)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <X size={9} /> Clear
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input className="input" style={{ paddingLeft: 30 }} placeholder={typeFilter ? `Search ${ARTICLE_TYPE_LABELS[typeFilter] || typeFilter} articles…` : 'Search articles…'}
                    value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                </div>
                {visibleResults.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {visibleResults.map(a => (
                      <button key={a.id}
                        onClick={() => toggleSelect(a)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                        className="hover-bg-elevated"
                      >
                        <Plus size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        {a.title}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.article_type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selected.length === 1 && (
                <div className="input-group">
                  <label className="input-label">Override label <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input className="input"
                    placeholder={`${selected[0].title} (default)`}
                    value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()} />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="input-group">
                <label className="input-label">Node name</label>
                <input className="input" autoFocus
                  placeholder="Old Merwyn…"
                  value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', lineHeight: 1.5 }}>
                This creates a placeholder node with no linked article. You can create an article for it later directly from the node on the canvas.
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd}
            disabled={saving || (mode === 'search' ? selected.length === 0 : !name.trim())}>
            {saving
              ? 'Adding…'
              : mode === 'search' && selected.length > 1
                ? `Add ${selected.length} nodes`
                : 'Add node'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EdgeLabelModal({ onClose, onConfirm, mode = 'standard', suggestions = [] }: {
  onClose: () => void
  onConfirm: (labelFrom: string, labelTo: string) => void
  mode?: 'standard' | 'person_to_union'
  suggestions?: string[]
}) {
  const [labelFrom, setLabelFrom] = useState('')
  const [labelTo, setLabelTo] = useState('')
  const [symmetric, setSymmetric] = useState(true)

  const handleConfirm = () => {
    if (mode === 'person_to_union') { onConfirm(labelFrom.trim(), ''); return }
    if (!labelFrom.trim()) return
    onConfirm(labelFrom.trim(), symmetric ? labelFrom.trim() : labelTo.trim() || labelFrom.trim())
  }

  if (mode === 'person_to_union') {
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal">
          <div className="modal-title">Role in union</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Your role <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input className="input" autoFocus placeholder="husband of, wife of, partner of…"
                value={labelFrom} onChange={e => setLabelFrom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()} />
              {suggestions.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setLabelFrom(s)}
                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => onConfirm('', '')}>Skip</button>
            <button className="btn btn-primary" onClick={handleConfirm}>Connect</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Define relationship</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Relationship label</label>
            <input className="input" autoFocus placeholder="Brother, Ally, Father of…"
              value={labelFrom} onChange={e => setLabelFrom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleConfirm()} />
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {suggestions.map(s => (
                  <button key={s} onClick={() => setLabelFrom(s)}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-elevated)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Shows on both articles when symmetric</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={symmetric} onChange={e => setSymmetric(e.target.checked)} />
            Symmetric — same label on both ends
          </label>
          {!symmetric && (
            <div className="input-group">
              <label className="input-label">Reverse label <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(shown on the target article)</span></label>
              <input className="input" placeholder="Son of, Rival, Child of…"
                value={labelTo} onChange={e => setLabelTo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirm()} />
            </div>
          )}
          {labelFrom && (
            <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {symmetric ? (
                <><span style={{ color: 'var(--text-primary)' }}>A</span> — {labelFrom} — <span style={{ color: 'var(--text-primary)' }}>B</span><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>undirected · same label on both articles</span></>
              ) : (
                <><span style={{ color: 'var(--text-primary)' }}>A</span> → {labelFrom} → <span style={{ color: 'var(--text-primary)' }}>B</span><span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>A's article: "B — {labelTo || labelFrom}"  ·  B's article: "A — {labelFrom}"</span></>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!labelFrom.trim()}>Connect</button>
        </div>
      </div>
    </div>
  )
}

export function EditEdgeModal({ edge, onClose, onSave }: {
  edge: DBRelationEdge; onClose: () => void
  onSave: (labelFrom: string, labelTo: string) => void
}) {
  const [labelFrom, setLabelFrom] = useState(edge.label_from)
  const [labelTo, setLabelTo] = useState(edge.label_to)
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit relationship</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Label (from → to)</label>
            <input className="input" autoFocus value={labelFrom} onChange={e => setLabelFrom(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Reverse label (to → from)</label>
            <input className="input" value={labelTo} onChange={e => setLabelTo(e.target.value)} placeholder={labelFrom} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            onClick={() => onSave(labelFrom.trim(), labelTo.trim() || labelFrom.trim())}
            disabled={!labelFrom.trim()}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ── Create / Link / Union editing modals ───────────────────────────────────────

export function CreateArticleModal({ node, onClose, onCreate }: {
  node: DBRelationNode
  onClose: () => void
  onCreate: (articleType: string) => Promise<void> | void
}) {
  const [articleType, setArticleType] = useState('character')
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    setSaving(true)
    await onCreate(articleType)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Create article</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            A new article titled <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{node.label}</span> will be created and linked to this node.
          </div>
          <div className="input-group">
            <label className="input-label">Article type</label>
            <select className="input" autoFocus value={articleType} onChange={e => setArticleType(e.target.value)} style={{ fontSize: 13 }}>
              {ALL_ARTICLE_TYPES.map(t => (
                <option key={t} value={t}>{ARTICLE_TYPE_LABELS[t] || t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create & link'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function LinkArticleModal({ node, campaignId, onClose, onLink }: {
  node: DBRelationNode
  campaignId: number
  onClose: () => void
  onLink: (articleId: number) => Promise<void> | void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: number; title: string; article_type: string }[]>([])
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const articles = await (window as any).api.getArticlesList({
        campaignId, search: search.trim(), searchTitle: true, searchTags: false,
      })
      setResults((articles || []).slice(0, 8))
    }, 200)
  }, [search, campaignId])

  const handlePick = async (id: number) => {
    setSaving(true)
    await onLink(id)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Link article</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Link <span style={{ color: 'var(--text-primary)' }}>{node.label}</span> to an existing article.
        </div>
        <div className="input-group">
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Search articles…"
              value={search} onChange={e => setSearch(e.target.value)} autoFocus disabled={saving} />
          </div>
          {results.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginTop: 4 }}>
              {results.map(a => (
                <button key={a.id} disabled={saving}
                  onClick={() => handlePick(a.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left' }}
                  className="hover-bg-elevated"
                >
                  {a.title}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.article_type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export function EditUnionModal({ unionId, dbNodes, dbEdges, onClose, onSaved, onDissolve }: {
  unionId: number
  dbNodes: DBRelationNode[]
  dbEdges: DBRelationEdge[]
  onClose: () => void
  onSaved: () => void
  onDissolve: () => void
}) {
  const personNodes = dbNodes.filter(n => n.node_type === 'person')
  const memberEdges = dbEdges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === unionId)
  const [members, setMembers] = useState(
    memberEdges.map(e => ({ edgeId: e.id, personId: e.from_node_id, role: e.label_from }))
  )
  const [saving, setSaving] = useState(false)
  const [confirmDissolve, setConfirmDissolve] = useState(false)

  const duplicate = members.length === 2 && members[0].personId === members[1].personId

  const handleSave = async () => {
    if (duplicate) return
    setSaving(true)
    await Promise.all(members.map(m =>
      (window as any).api.updateRelationEdge(m.edgeId, { from_node_id: m.personId, label_from: m.role.trim() })
    ))
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Edit union</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Change who is in this union or relabel their roles.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {members.map((m, i) => (
            <div key={m.edgeId} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Person {i + 1}</label>
                <select className="input" value={m.personId} style={{ fontSize: 13 }}
                  onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, personId: Number(e.target.value) } : x))}>
                  {personNodes.map(n => <option key={n.id} value={n.id}>{n.article_title || n.label}</option>)}
                </select>
              </div>
              <div className="input-group" style={{ margin: 0 }}>
                <label className="input-label">Their role <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <input className="input" placeholder="husband of, wife of, partner of…" value={m.role}
                  onChange={e => setMembers(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
              </div>
            </div>
          ))}
          {duplicate && (
            <div style={{ fontSize: 12, color: '#e05555' }}>The two people in a union must be different.</div>
          )}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn"
            onClick={() => { if (!confirmDissolve) { setConfirmDissolve(true); return } onDissolve() }}
            style={{ color: confirmDissolve ? 'var(--danger-hover)' : '#e05555' }}
          >
            <Trash2 size={13} /> {confirmDissolve ? 'Confirm dissolve' : 'Dissolve union'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || duplicate}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
