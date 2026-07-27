import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bundle, SiteInfo, PArticle, EncryptedBundle } from './types'
import { bundleFileName, decryptBundle } from './crypto'
import TipTapRenderer from './TipTapRenderer'
import GraphView from './GraphView'
import MapView from './MapView'
import StatBlock from './StatBlock'
import { colorForType, labelForType } from './articleTypes'

export default function App() {
  const [site, setSite] = useState<SiteInfo | null>(null)
  const [bundle, setBundle] = useState<Bundle | null>(null)

  useEffect(() => {
    fetch('site.json').then(r => r.json()).then(setSite).catch(() => setSite(null))
  }, [])

  if (!bundle) return <Login site={site} onLogin={setBundle} />
  return <Wiki site={site} bundle={bundle} onLogout={() => setBundle(null)} />
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ site, onLogin }: { site: SiteInfo | null; onLogin: (b: Bundle) => void }) {
  const [username, setUsername] = useState(localStorage.getItem('lastUser') ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!site) { setError('Site data is still loading — try again.'); return }
    setBusy(true); setError('')
    try {
      const file = await bundleFileName(username)
      const res = await fetch(`data/${file}`)
      if (!res.ok) throw new Error('not found')
      const enc = (await res.json()) as EncryptedBundle
      const plain = await decryptBundle(enc, password, site.kdf.iterations)
      const parsed = JSON.parse(plain) as Bundle
      localStorage.setItem('lastUser', username.trim())
      onLogin(parsed)
    } catch {
      setError('Incorrect username or password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">{site?.campaign ?? 'Campaign Wiki'}</div>
        <div className="login-sub">Player access</div>
        <input className="field" placeholder="Username" value={username}
          onChange={e => setUsername(e.target.value)} autoFocus autoCapitalize="none" autoCorrect="off" />
        <input className="field" type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} />
        {error && <div className="login-error">{error}</div>}
        <button className="login-btn" type="submit" disabled={busy}>{busy ? 'Unlocking…' : 'Enter'}</button>
      </form>
    </div>
  )
}

// ── Wiki ────────────────────────────────────────────────────────────────────────

function Wiki({ site, bundle, onLogout }: { site: SiteInfo | null; bundle: Bundle; onLogout: () => void }) {
  const articles = bundle.articles
  const byId = useMemo(() => new Map(articles.map(a => [a.id, a])), [articles])
  const byTitle = useMemo(() => new Map(articles.map(a => [a.title.toLowerCase(), a])), [articles])

  const hasMap = (bundle.maps?.length ?? 0) > 0
  // Land on the player's own character page when it's in their bundle; fall back
  // to the first article otherwise (unlinked player, or PC not shared).
  const pcId = bundle.player.pc_article_id
  const [selectedId, setSelectedId] = useState<number | null>(
    (pcId != null && byId.has(pcId)) ? pcId : (articles[0]?.id ?? null),
  )
  const [search, setSearch] = useState('')
  const [pane, setPane] = useState<'article' | 'graph' | 'map'>('article')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  // Default open on desktop, collapsed on phones (so reading starts full-width).
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 700)

  const typesPresent = useMemo(
    () => [...new Set(articles.map(a => a.article_type))].sort((a, b) => a.localeCompare(b)),
    [articles],
  )

  // ── What's new since last login ─────────────────────────────────────────────
  // Compare this bundle's {id: updated_at} against the snapshot from last visit
  // (localStorage, per player). New = newly shared; Updated = content changed;
  // removed pages are silently dropped. First visit just sets the baseline.
  const [changes, setChanges] = useState<{ added: PArticle[]; updated: PArticle[] } | null>(null)
  const [changesDismissed, setChangesDismissed] = useState(false)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const key = `seen:${bundle.player.username.toLowerCase().trim()}`
    let prev: Record<string, string> = {}
    try { prev = JSON.parse(localStorage.getItem(key) || '{}') } catch {}
    const firstVisit = Object.keys(prev).length === 0
    if (!firstVisit) {
      const added: PArticle[] = [], updated: PArticle[] = []
      for (const a of articles) {
        if (!(String(a.id) in prev)) added.push(a)
        else if (prev[String(a.id)] !== a.updated_at) updated.push(a)
      }
      if (added.length || updated.length) setChanges({ added, updated })
    }
    const snap: Record<string, string> = {}
    for (const a of articles) snap[String(a.id)] = a.updated_at
    localStorage.setItem(key, JSON.stringify(snap))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = typeFilter === 'all' ? articles : articles.filter(a => a.article_type === typeFilter)
    if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || a.tags.some(t => t.includes(q)))
    return [...list].sort((a, b) => a.title.localeCompare(b.title))
  }, [articles, search, typeFilter])

  const selected = selectedId != null ? byId.get(selectedId) ?? null : null
  const open = (id: number) => { setSelectedId(id); setPane('article') }
  // Picking an article from the list gets the panel out of the way.
  const openFromList = (id: number) => { open(id); setSidebarOpen(false) }
  const openTitle = (title: string) => {
    const a = byTitle.get(title.toLowerCase())
    if (a) open(a.id)
  }

  const showChanges = changes && !changesDismissed

  return (
    <div className="app">
      {!sidebarOpen && (
        <button className="sidebar-open-btn" onClick={() => setSidebarOpen(true)} title="Show panel">☰</button>
      )}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={'sidebar' + (sidebarOpen ? '' : ' collapsed')}>
        <div className="side-head">
          <div className="camp-name">{site?.campaign ?? 'Wiki'}</div>
          <div className="side-head-btns">
            <button className="logout" onClick={onLogout} title="Log out">⏻</button>
            <button className="collapse-btn" onClick={() => setSidebarOpen(false)} title="Hide panel">«</button>
          </div>
        </div>
        <div className="greeting">Welcome, {bundle.player.display_name || bundle.player.username}</div>
        <div className="pane-switch">
          <button className={pane === 'article' ? 'active' : ''} onClick={() => setPane('article')}>Pages</button>
          <button className={pane === 'graph' ? 'active' : ''} onClick={() => setPane('graph')}>Graph</button>
          {hasMap && <button className={pane === 'map' ? 'active' : ''} onClick={() => setPane('map')}>Map</button>}
        </div>
        <input className="search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        {typesPresent.length > 1 && (
          <div className="type-filter">
            <button className={'tf-chip' + (typeFilter === 'all' ? ' active' : '')} onClick={() => setTypeFilter('all')}>All</button>
            {typesPresent.map(t => {
              const active = typeFilter === t
              const c = colorForType(t)
              return (
                <button key={t} className={'tf-chip' + (active ? ' active' : '')} onClick={() => setTypeFilter(active ? 'all' : t)}
                  style={active ? { color: c, borderColor: c + '99', background: c + '1e' } : undefined}>
                  <span className="tf-dot" style={{ background: c }} /> {labelForType(t)}
                </button>
              )
            })}
          </div>
        )}
        <nav className="article-list">
          {filtered.length === 0 && <div className="empty">No pages.</div>}
          {filtered.map(a => (
            <button key={a.id} className={'article-link' + (a.id === selectedId && pane === 'article' ? ' active' : '')} onClick={() => openFromList(a.id)}>
              <span className="al-dot" style={{ background: colorForType(a.article_type) }} />
              <span className="al-title">{a.title}</span>
              <span className="al-type" style={{ color: colorForType(a.article_type) }}>{labelForType(a.article_type)}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">{articles.length} page{articles.length === 1 ? '' : 's'} shared with you</div>
      </aside>

      <main className="content">
        {showChanges && <WhatsNew changes={changes!} onOpen={open} onDismiss={() => setChangesDismissed(true)} />}
        {pane === 'graph'
          ? <GraphView bundle={bundle} selectedId={selectedId} onOpen={open} />
          : pane === 'map'
            ? <MapView bundle={bundle} onOpen={open} />
            : selected
              ? <ArticleView article={selected} bundle={bundle} onOpenTitle={openTitle} />
              : <div className="empty-main">Select a page.</div>}
      </main>
    </div>
  )
}

function WhatsNew({ changes, onOpen, onDismiss }: {
  changes: { added: PArticle[]; updated: PArticle[] }
  onOpen: (id: number) => void
  onDismiss: () => void
}) {
  const chip = (a: PArticle) => (
    <button key={a.id} className="wn-chip" onClick={() => onOpen(a.id)}>{a.title}</button>
  )
  return (
    <div className="whats-new">
      <div className="wn-head">
        <span>Since your last visit</span>
        <button className="wn-close" onClick={onDismiss} title="Dismiss">×</button>
      </div>
      {changes.added.length > 0 && (
        <div className="wn-row"><span className="wn-label wn-new">New</span>{changes.added.map(chip)}</div>
      )}
      {changes.updated.length > 0 && (
        <div className="wn-row"><span className="wn-label wn-upd">Updated</span>{changes.updated.map(chip)}</div>
      )}
    </div>
  )
}

// ── Article ──────────────────────────────────────────────────────────────────────

function ArticleView({ article, bundle, onOpenTitle }: {
  article: PArticle
  bundle: Bundle
  onOpenTitle: (title: string) => void
}) {
  const backlinks = bundle.backlinks[article.id] ?? []
  const c = colorForType(article.article_type)
  const updated = new Date(article.updated_at)
  return (
    <article className="article">
      {article.cover_image
        ? <div className="cover"><img src={article.cover_image} alt="" /></div>
        : <div className="type-bar" style={{ background: c + '55' }} />}
      <div className="article-body">
        <div className="article-head">
          {article.portrait_image && <img className="portrait" src={article.portrait_image} alt="" style={{ borderColor: c + '66' }} />}
          <div>
            <span className="type-pill" style={{ color: c, borderColor: c + '55', background: c + '14' }}>{labelForType(article.article_type)}</span>
            <h1 className="title">{article.title}</h1>
            {!isNaN(updated.getTime()) && (
              <div className="updated">Updated {updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            )}
          </div>
        </div>

        {article.tags.length > 0 && (
          <div className="tags">{article.tags.map(t => <span key={t} className="tag">#{t}</span>)}</div>
        )}

        {((article.infoTracks?.length ?? 0) > 0 || (article.milestones?.length ?? 0) > 0) && (
          <div className="infobox">
            {article.infoTracks?.map(tr => (
              <div key={tr.label} className="info-row"><span className="info-label">{tr.label}</span><span className="info-value">{tr.value}</span></div>
            ))}
            {(article.milestones?.length ?? 0) > 0 && (
              <div className="info-timeline">
                <div className="info-label">Timeline</div>
                {article.milestones!.map((m, i) => (
                  <div key={i} className="info-ms"><span className="ms-label">{m.label || 'Milestone'}</span>{m.date && <span className="ms-date">{m.date}</span>}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <TipTapRenderer json={article.content} onWikiLink={onOpenTitle} />

        {article.statblock && <StatBlock json={article.statblock} />}

        {backlinks.length > 0 && (
          <div className="backlinks">
            <div className="backlinks-head">Referenced by</div>
            {backlinks.map(b => (
              <button key={b.id} className="backlink" onClick={() => onOpenTitle(b.title)}>{b.title}</button>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
