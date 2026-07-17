// path: electron/main/ipc/search.ts
import { ipcMain } from 'electron'
import { db } from '../db'
import { getMainWindow } from '../window'

// Global search across articles, sessions, DM notes, and map POIs for one
// campaign. Prose columns store TipTap JSON, so rows are prefiltered with LIKE
// (cheap, may overmatch on JSON syntax) and then verified against the extracted
// plain text before being returned with a match snippet.

function plainText(raw: string): string {
  try {
    const walk = (node: any): string => {
      if (!node || typeof node !== 'object') return ''
      const own = typeof node.text === 'string' ? node.text : ''
      const kids = (node.content ?? []).map(walk).join(' ')
      return own + (own && kids ? ' ' : '') + kids
    }
    return walk(JSON.parse(raw)).replace(/\s+/g, ' ').trim()
  } catch { return '' }
}

function snippetFor(text: string, q: string, radius = 44): string | null {
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return null
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '')
}

// Subsequence fuzzy score for titles: every query char must appear in order
// ("blkgt" matches "Black Gate"). Lower is better — tight spans and early
// starts win. Returns null when the query isn't a subsequence at all.
function fuzzyScore(text: string, q: string): number | null {
  const t = text.toLowerCase()
  let start = -1, last = -1, i = 0
  for (let ti = 0; ti < t.length && i < q.length; ti++) {
    if (t[ti] === q[i]) {
      if (i === 0) start = ti
      last = ti
      i++
    }
  }
  if (i < q.length) return null
  return (last - start + 1) - q.length + start * 0.1
}

// Fill a result group's remaining slots with fuzzy title matches, skipping
// rows the LIKE pass already returned.
function fuzzyFill<T extends { id: number }>(
  existing: { id: number }[], candidates: T[], title: (r: T) => string, q: string, limit: number,
): T[] {
  if (existing.length >= limit) return []
  const seen = new Set(existing.map(r => r.id))
  return candidates
    .filter(r => !seen.has(r.id))
    .map(r => ({ r, score: fuzzyScore(title(r), q) }))
    .filter((x): x is { r: T; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit - existing.length)
    .map(x => x.r)
}

const GROUP_LIMIT = 8

export function registerSearchIPC() {

  // ── Native find-in-page (Ctrl+F highlight) ────────────────────────────────
  // Chromium's built-in find: highlights every match on the visible page and
  // scrolls the active one into view. Results arrive via the window's
  // 'found-in-page' event, forwarded to the renderer as 'find:result'.

  ipcMain.handle('find:in-page', (_e, text: string, opts?: { forward?: boolean; findNext?: boolean }) => {
    const win = getMainWindow()
    if (!win || !text) return
    win.webContents.findInPage(text, {
      forward: opts?.forward ?? true,
      findNext: opts?.findNext ?? false,
    })
  })

  ipcMain.handle('find:stop', () => {
    getMainWindow()?.webContents.stopFindInPage('clearSelection')
  })

  ipcMain.handle('search:global', (_e, campaignId: number, query: string) => {
    const q = (query ?? '').trim().toLowerCase()
    if (q.length < 2) return { articles: [], sessions: [], notes: [], pois: [] }
    const like = `%${q}%`

    // ── Articles ────────────────────────────────────────────────────────────
    const articles: any[] = []
    const articleRows = db.prepare(`
      SELECT id, title, article_type, content FROM articles
      WHERE campaign_id = ? AND (title LIKE ? OR content LIKE ?)
      ORDER BY title ASC
    `).all(campaignId, like, like) as any[]
    for (const r of articleRows) {
      const titleHit = r.title.toLowerCase().includes(q)
      const snippet = titleHit ? null : snippetFor(plainText(r.content), q)
      if (!titleHit && !snippet) continue // LIKE matched JSON syntax only
      articles.push({ id: r.id, title: r.title, article_type: r.article_type, snippet })
      if (articles.length >= GROUP_LIMIT) break
    }
    // Fuzzy title pass fills leftover slots ("blkgt" → "Black Gate").
    const allArticleTitles = db.prepare(
      'SELECT id, title, article_type FROM articles WHERE campaign_id = ?'
    ).all(campaignId) as any[]
    for (const r of fuzzyFill(articles, allArticleTitles, r => r.title, q, GROUP_LIMIT)) {
      articles.push({ id: r.id, title: r.title, article_type: r.article_type, snippet: null })
    }

    // ── Sessions ────────────────────────────────────────────────────────────
    const sessions: any[] = []
    const sessionRows = db.prepare(`
      SELECT id, name, session_number, session_sub, is_draft, notes FROM sessions
      WHERE campaign_id = ? AND (name LIKE ? OR notes LIKE ?)
      ORDER BY is_draft ASC, session_number DESC
    `).all(campaignId, like, like) as any[]
    for (const r of sessionRows) {
      const nameHit = r.name.toLowerCase().includes(q)
      const snippet = nameHit ? null : snippetFor(plainText(r.notes), q)
      if (!nameHit && !snippet) continue
      sessions.push({
        id: r.id, name: r.name, session_number: r.session_number,
        session_sub: r.session_sub, is_draft: r.is_draft === 1, snippet,
      })
      if (sessions.length >= GROUP_LIMIT) break
    }
    const allSessionNames = db.prepare(
      'SELECT id, name, session_number, session_sub, is_draft FROM sessions WHERE campaign_id = ?'
    ).all(campaignId) as any[]
    for (const r of fuzzyFill(sessions, allSessionNames, r => r.name, q, GROUP_LIMIT)) {
      sessions.push({
        id: r.id, name: r.name, session_number: r.session_number,
        session_sub: r.session_sub, is_draft: r.is_draft === 1, snippet: null,
      })
    }

    // ── DM notes ────────────────────────────────────────────────────────────
    // Session-linked pages mirror session notes (already covered above), so
    // only standalone pages are searched here.
    const notes: any[] = []
    const noteRows = db.prepare(`
      SELECT id, title, content FROM dm_notes_pages
      WHERE campaign_id = ? AND session_id IS NULL AND (title LIKE ? OR content LIKE ?)
      ORDER BY updated_at DESC
    `).all(campaignId, like, like) as any[]
    for (const r of noteRows) {
      const titleHit = r.title.toLowerCase().includes(q)
      const snippet = titleHit ? null : snippetFor(plainText(r.content), q)
      if (!titleHit && !snippet) continue
      notes.push({ id: r.id, title: r.title, snippet })
      if (notes.length >= GROUP_LIMIT) break
    }
    const allNoteTitles = db.prepare(
      'SELECT id, title FROM dm_notes_pages WHERE campaign_id = ? AND session_id IS NULL'
    ).all(campaignId) as any[]
    for (const r of fuzzyFill(notes, allNoteTitles, r => r.title, q, GROUP_LIMIT)) {
      notes.push({ id: r.id, title: r.title, snippet: null })
    }

    // ── POIs (session maps, article maps, and campaign hub maps) ────────────
    const pois: any[] = []
    const poiRows = db.prepare(`
      SELECT p.id, p.label, p.content,
             m.session_id, m.article_id, m.campaign_id AS map_campaign_id,
             s.name AS session_name, s.session_number, s.session_sub,
             a.title AS article_title
      FROM pois p
      JOIN maps m ON m.id = p.map_id
      LEFT JOIN sessions s ON s.id = m.session_id
      LEFT JOIN articles a ON a.id = m.article_id
      WHERE (s.campaign_id = ? OR m.campaign_id = ? OR a.campaign_id = ?)
        AND (p.label LIKE ? OR p.content LIKE ?)
      ORDER BY p.label ASC
    `).all(campaignId, campaignId, campaignId, like, like) as any[]
    for (const r of poiRows) {
      const labelHit = r.label.toLowerCase().includes(q)
      const snippet = labelHit ? null : snippetFor(plainText(r.content), q)
      if (!labelHit && !snippet) continue
      pois.push({
        id: r.id, label: r.label, snippet,
        session_id: r.session_id, article_id: r.article_id,
        on_hub_map: r.map_campaign_id != null,
        context: r.session_id
          ? `Session ${r.session_number}${r.session_sub ?? ''}: ${r.session_name}`
          : r.article_id ? r.article_title : 'World map',
      })
      if (pois.length >= GROUP_LIMIT) break
    }

    return { articles, sessions, notes, pois }
  })
}
