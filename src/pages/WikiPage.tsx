// path: src/pages/WikiPage.tsx
import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store/store'
import {
  BookOpen, Plus, Tag, X, Calendar, Network,
} from 'lucide-react'
import type { ArticleSummary, ArticleType } from '../types'
import { ARTICLE_TYPES, parseTags } from '../components/wiki/wikiConstants'
import {
  WikiHeaderBar, ViewSwitchButton, WikiSearchBox, WikiTypeFilters, ToolbarDivider,
} from '../components/wiki/WikiToolbar'
import { ArticleEditor } from '../components/wiki/ArticleEditor'
import WikiGraphView from '../components/wiki/WikiGraphView'
import { useExcludedTypes, TypeVisibilityMenu } from '../components/wiki/TypeVisibilityMenu'
import Modal from '../components/Modal'
import { useArticleContextMenu, useMenuCtx } from '../hooks/useContextMenu'

// ─── Create Modal ──────────────────────────────────────────────────────────────

function CreateArticleModal({ onClose, initialType, initialTitle }: { onClose: () => void; initialType?: ArticleType; initialTitle?: string }) {
  const { createArticle } = useStore()
  const [title, setTitle] = useState(initialTitle ?? '')
  const [type, setType] = useState<ArticleType>(initialType || 'location')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSaving(true); setError('')
    try {
      await createArticle({ title: title.trim(), article_type: type })
      onClose()
    } catch { setSaving(false); setError('Failed — title may already exist.') }
  }

  const PLACEHOLDERS = ['Neverwinter…', 'Waterdeep…', 'Gandalf the Grey…', 'Gerome the Gnome…']
  const randomPlaceholder = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]

  return (
    <Modal title="New Article" onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="input-group">
            <label className="input-label">Title</label>
            <input className="input" placeholder={randomPlaceholder} value={title}
              onChange={e => setTitle(e.target.value)} autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            {error && <div style={{ fontSize: 12, color: '#e05555', marginTop: 4 }}>{error}</div>}
          </div>
          <div className="input-group">
            <label className="input-label">Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ARTICLE_TYPES.map(t => {
                const Icon = t.icon
                const active = t.value === type
                return (
                  <button key={t.value} onClick={() => setType(t.value)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 99,
                    border: `1px solid ${active ? t.color : 'var(--border-light)'}`,
                    background: active ? `${t.color}18` : 'transparent',
                    color: active ? t.color : 'var(--text-muted)',
                    fontSize: 12, cursor: 'pointer', transition: 'all 120ms ease',
                  }}>
                    <Icon size={12} /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving ? 'Creating…' : 'Create Article'}
          </button>
        </div>
    </Modal>
  )
}

// ─── Article Card ──────────────────────────────────────────────────────────────

function ArticleCard({ article, onOpen }: { article: ArticleSummary; onOpen: () => void }) {
  const typeInfo = ARTICLE_TYPES.find(t => t.value === article.article_type) || ARTICLE_TYPES[ARTICLE_TYPES.length - 1]
  const Icon = typeInfo.icon
  const tags = parseTags(article.tags)
  const { wikiSearchFields } = useStore()
  const deleteArticle = useStore(s => s.deleteArticle)
  const articleMenu = useArticleContextMenu()
  const menuCtx = useMenuCtx()

  return (
    <div className="card card-clickable" style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }} onClick={onOpen}
      // Middle-click opens in a background tab, exactly like a browser link.
      onAuxClick={e => { if (e.button === 1) { e.preventDefault(); menuCtx.goTab({ type: 'article', articleId: article.id }, true) } }}
      onContextMenu={articleMenu(article, { onDelete: () => void deleteArticle(article.id) })}>
      {article.cover_image ? (
        <div style={{ height: 100, overflow: 'hidden', flexShrink: 0 }}>
          <img src={`file://${article.cover_image}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <div style={{ height: 6, background: `${typeInfo.color}44`, flexShrink: 0 }} />
      )}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 99, border: `1px solid ${typeInfo.color}55`, background: `${typeInfo.color}12`, fontSize: 10, color: typeInfo.color, fontWeight: 600 }}>
            <Icon size={9} /> {typeInfo.label}
          </div>
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.title}
        </h3>
        {tags.length > 0 && wikiSearchFields.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {tags.slice(0, 3).map(tag => (
              <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--bg-elevated)', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
                #{tag}
              </span>
            ))}
            {tags.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{tags.length - 3}</span>}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Calendar size={10} />
          Updated {new Date(article.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}
// ─── Article List View ─────────────────────────────────────────────────────────

function ArticleListView({ onOpen, onSwitchToGraph }: { onOpen: (a: ArticleSummary) => void; onSwitchToGraph: () => void }) {
  const {
    articles, currentCampaign, wikiFilter, wikiSearch, wikiTagFilter, wikiSearchFields, wikiShowTags, setWikiShowTags,
    loadArticles, setWikiFilter, setWikiSearch, setWikiTagFilter, setWikiSearchFields,
    setView, setCampaignSubView,
  } = useStore()
  const [showCreate, setShowCreate] = useState(false)
  // Hide whole article types from the list (shared control; nothing hidden by default).
  const { excluded, toggle: toggleExcluded, clear: clearExcluded } = useExcludedTypes('wiki-list-excluded-types', () => new Set())

  useEffect(() => { loadArticles() }, [currentCampaign?.id])
  // A hidden type can't remain the active filter.
  useEffect(() => {
    if (wikiFilter !== 'all' && excluded.has(wikiFilter)) setWikiFilter('all')
  }, [excluded, wikiFilter])

  const visibleArticles = useMemo(() => articles.filter(a => !excluded.has(a.article_type)), [articles, excluded])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    visibleArticles.forEach(a => { parseTags(a.tags).forEach(t => tagSet.add(t)) })
    if (wikiTagFilter) tagSet.add(wikiTagFilter)
    return [...tagSet].sort()
  }, [visibleArticles, wikiTagFilter])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 32px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <WikiHeaderBar
          icon={BookOpen}
          title="Campaign Wiki"
          onBack={() => { setView('campaign'); setCampaignSubView('hub') }}
          meta={<>
            {visibleArticles.length} article{visibleArticles.length !== 1 ? 's' : ''}
            {excluded.size > 0 && articles.length > visibleArticles.length ? ` · ${articles.length - visibleArticles.length} hidden` : ''}
          </>}
          actions={<>
            <ViewSwitchButton icon={Network} label="Graph view" onClick={onSwitchToGraph}
              title="See every article and its [[links]] as a network" />
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> New Article</button>
          </>}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <WikiSearchBox
            verb="Search"
            value={wikiSearch} onChange={setWikiSearch}
            fields={wikiSearchFields} onFieldsChange={setWikiSearchFields}
            matchCount={visibleArticles.length}
            extras={allTags.length > 0 && (
              <button onClick={() => setWikiShowTags(!wikiShowTags)}
                title={wikiShowTags ? 'Hide the tag cloud' : 'Browse every tag in the wiki'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, lineHeight: 1.4,
                  padding: '1px 8px', borderRadius: 99, cursor: 'pointer', transition: 'all 120ms ease',
                  border: `1px solid ${wikiShowTags ? 'var(--gold-dim)' : 'var(--border-light)'}`,
                  background: wikiShowTags ? 'var(--gold-glow)' : 'transparent',
                  color: wikiShowTags ? 'var(--gold)' : 'var(--text-muted)',
                }}>
                <Tag size={10} /> {wikiShowTags ? 'Hide tags' : 'Show tags'}
              </button>
            )}
          />
          <ToolbarDivider />
          <WikiTypeFilters excluded={excluded} value={wikiFilter} onChange={setWikiFilter} grow />
          <div style={{ marginLeft: 'auto' }}>
            <TypeVisibilityMenu excluded={excluded} onToggle={toggleExcluded} onClear={clearExcluded} />
          </div>
        </div>

        {allTags.length > 0 && wikiShowTags && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {allTags.map(tag => {
              const active = wikiTagFilter === tag
              return (
                <button key={tag} onClick={() => setWikiTagFilter(active ? null : tag)}
                  style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, border: `1px solid ${active ? 'var(--gold-dim)' : 'var(--border-light)'}`, background: active ? 'var(--gold-glow)' : 'transparent', color: active ? 'var(--gold)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 120ms ease' }}>
                  #{tag}
                </button>
              )
            })}
            {wikiTagFilter && (
              <button onClick={() => setWikiTagFilter(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 120ms ease', marginLeft: 2 }}>
                <X size={10} /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {visibleArticles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-muted)' }}>
            <BookOpen size={40} strokeWidth={1} color="var(--border-light)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                {articles.length > 0 && excluded.size > 0 ? 'All matching articles are hidden'
                  : wikiSearch ? 'No articles match your search' : 'No articles yet'}
              </div>
              <div style={{ fontSize: 13 }}>
                {articles.length > 0 && excluded.size > 0 ? 'Adjust “Hide types” to show them again'
                  : wikiSearch ? 'Try a different search term or filter' : 'Create your first article to start building your wiki'}
              </div>
            </div>
            {!wikiSearch && articles.length === 0 && <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Article</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, alignContent: 'start' }}>
            {visibleArticles.map(a => <ArticleCard key={a.id} article={a} onOpen={() => onOpen(a)} />)}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateArticleModal
          onClose={() => setShowCreate(false)}
          initialType={wikiFilter !== 'all' ? wikiFilter : undefined}
        />
      )}
    </div>
  )
}

// ─── Wiki Page ─────────────────────────────────────────────────────────────────

export default function WikiPage() {
  const { currentArticle, currentCampaign, selectArticle, openArticle, wikiGraphFocusId, setWikiGraphFocusId } = useStore()
  const [mode, setMode] = useState<'list' | 'graph'>(() =>
    localStorage.getItem('wiki-view-mode') === 'graph' ? 'graph' : 'list'
  )
  // Title to pre-fill when a broken-link (ghost) node is clicked in the graph.
  const [ghostCreateTitle, setGhostCreateTitle] = useState<string | null>(null)
  const switchMode = (m: 'list' | 'graph') => {
    localStorage.setItem('wiki-view-mode', m)
    setMode(m)
  }

  // Global search hand-off (Ctrl+Enter): jump to the graph focused on an
  // article. Doesn't persist the mode switch — it's a jump, not a preference.
  const [graphFocus, setGraphFocus] = useState<number | null>(null)
  useEffect(() => {
    if (wikiGraphFocusId == null) return
    setGraphFocus(wikiGraphFocusId)
    setWikiGraphFocusId(null)
    selectArticle(null)
    setMode('graph')
  }, [wikiGraphFocusId, setWikiGraphFocusId, selectArticle])

  if (!currentCampaign) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)' }}>
        <BookOpen size={40} strokeWidth={1} color="var(--border-light)" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--text-secondary)', marginBottom: 4 }}>No campaign selected</div>
          <div style={{ fontSize: 13 }}>Open a campaign first to access its wiki</div>
        </div>
      </div>
    )
  }

  if (currentArticle) {
    return (
      <ArticleEditor
        key={currentArticle.id}
        article={currentArticle}
        backLabel={mode === 'graph' ? 'Back to Graph' : 'Back to Wiki'}
        onBack={() => selectArticle(null)}
      />
    )
  }

  if (mode === 'graph') {
    return (
      <>
        <WikiGraphView
          onSwitchToList={() => switchMode('list')}
          onCreateArticle={(title) => setGhostCreateTitle(title)}
          initialFocusId={graphFocus}
        />
        {ghostCreateTitle !== null && (
          <CreateArticleModal initialTitle={ghostCreateTitle} onClose={() => setGhostCreateTitle(null)} />
        )}
      </>
    )
  }

  return <ArticleListView onOpen={(a) => openArticle(a.id)} onSwitchToGraph={() => switchMode('graph')} />
}
