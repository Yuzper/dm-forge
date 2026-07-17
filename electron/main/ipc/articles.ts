// path: electron/main/ipc/articles.ts
import { app, ipcMain } from 'electron'
import { db } from '../db'
import { extractInlineImagePaths, safeUnlink, safeUnlinkRelative, unlinkImageRef } from '../helpers'
import { syncHierarchyForWeb, syncTerritoryWeb } from '../relationsSync'

export function registerArticleIPC() {

  ipcMain.handle('articles:get-all', (_e, filter?: any) => {
    let query = 'SELECT * FROM articles WHERE 1=1'
    const params: any[] = []
    if (filter?.campaignId) { query += ' AND campaign_id = ?'; params.push(filter.campaignId) }
    if (filter?.type && filter.type !== 'all') { query += ' AND article_type = ?'; params.push(filter.type) }
    if (filter?.search) {
      query += ' AND (title LIKE ? OR content LIKE ?)'
      params.push(`%${filter.search}%`, `%${filter.search}%`)
    }
    query += ' ORDER BY title ASC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('articles:get-list', (_e, filter?: any) => {
    let query = `
      SELECT id, campaign_id, title, article_type, tags, cover_image, tracks,
             loot_table, loot_table_id, created_at, updated_at
      FROM articles WHERE 1=1
    `
    const params: any[] = []
    if (filter?.campaignId) { query += ' AND campaign_id = ?'; params.push(filter.campaignId) }
    if (filter?.type && filter.type !== 'all') { query += ' AND article_type = ?'; params.push(filter.type) }
    if (filter?.tag) {
      // Match stored tags OR articles that are nodes in a web with this name
      query += ` AND (
        tags LIKE ?
        OR id IN (
          SELECT n.article_id FROM relation_nodes n
          JOIN relation_webs w ON w.id = n.web_id
          WHERE n.article_id IS NOT NULL AND w.name = ? COLLATE NOCASE
          ${filter.campaignId ? 'AND w.campaign_id = ?' : ''}
        )
      )`
      params.push(`%"${filter.tag}"%`, filter.tag)
      if (filter.campaignId) params.push(filter.campaignId)
    }
    if (filter?.search) {
      const byTitle = filter.searchTitle !== false
      const byTags  = filter.searchTags  !== false
      const clauses: string[] = []
      const clauseParams: any[] = []
      if (byTitle) {
        clauses.push('title LIKE ?')
        clauseParams.push(`%${filter.search}%`)
      }
      if (byTags) {
        clauses.push('tags LIKE ?')
        clauseParams.push(`%${filter.search}%`)
        // Also match articles that are nodes in a web whose name matches the search
        clauses.push(`id IN (
          SELECT n.article_id FROM relation_nodes n
          JOIN relation_webs w ON w.id = n.web_id
          WHERE n.article_id IS NOT NULL AND w.name LIKE ?
          ${filter.campaignId ? 'AND w.campaign_id = ?' : ''}
        )`)
        clauseParams.push(`%${filter.search}%`)
        if (filter.campaignId) clauseParams.push(filter.campaignId)
      }
      if (clauses.length) {
        query += ` AND (${clauses.join(' OR ')})`
        params.push(...clauseParams)
      }
    }
    query += ' ORDER BY title ASC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('articles:get', (_e, id: number) => {
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(id) ?? null
  })

  ipcMain.handle('articles:get-by-title', (_e, title: string, campaignId: number) => {
    return db.prepare(
      'SELECT * FROM articles WHERE title = ? COLLATE NOCASE AND campaign_id = ?'
    ).get(title, campaignId) ?? null
  })

  ipcMain.handle('articles:get-backlinks', (_e, title: string, campaignId: number) => {
    return db.prepare(`
      SELECT id, campaign_id, title, article_type, tags, tracks, updated_at
      FROM articles
      WHERE campaign_id = ?
        AND title != ?
        AND (content LIKE ? OR tracks LIKE ?)
      ORDER BY title ASC
    `).all(campaignId, title, `%"title":"${title}"%`, `%"${title}"%`)
  })

  // Whole-campaign link graph:
  //  • nodes   = every article
  //  • edges   = [[wikiLink]] references + track values naming another article
  //  • ghosts  = [[links]] pointing at a title that has no article (broken links)
  //  • mentions = an article title appearing as plain (unlinked) text in another
  // Edges/mentions are undirected and deduped.
  ipcMain.handle('articles:link-graph', (_e, campaignId: number) => {
    const rows = db.prepare(`
      SELECT id, title, article_type, content, tracks, updated_at FROM articles WHERE campaign_id = ?
    `).all(campaignId) as any[]

    const byTitle = new Map<string, any>()
    for (const r of rows) byTitle.set(r.title.toLowerCase(), r)

    // wikiLink marks → Map<lowercased title, original-case title>
    const collectWikiLinks = (raw: string): Map<string, string> => {
      const links = new Map<string, string>()
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (typeof node.text === 'string') {
          for (const m of node.marks ?? []) {
            if (m.type === 'wikiLink' && m.attrs?.title) {
              const t = String(m.attrs.title)
              links.set(t.toLowerCase(), t)
            }
          }
        }
        for (const child of node.content ?? []) walk(child)
      }
      try { walk(JSON.parse(raw)) } catch {}
      return links
    }

    // Plain prose only — text NOT inside a wikiLink mark (already-linked text is
    // not an "unlinked mention"). Used for mention scanning.
    const plainText = (raw: string): string => {
      const parts: string[] = []
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (typeof node.text === 'string') {
          if (!(node.marks ?? []).some((m: any) => m.type === 'wikiLink')) parts.push(node.text)
        }
        for (const child of node.content ?? []) walk(child)
      }
      try { walk(JSON.parse(raw)) } catch {}
      return parts.join(' ')
    }

    const edges: { from: number; to: number }[] = []
    const edgeSeen = new Set<string>()
    const ghostMap = new Map<string, { title: string; sources: Set<number> }>()

    for (const r of rows) {
      const selfLower = r.title.toLowerCase()
      const targets = new Set<string>()   // lowercased titles this article links to

      for (const [lower, orig] of collectWikiLinks(r.content)) {
        if (lower === selfLower) continue
        if (byTitle.has(lower)) targets.add(lower)
        else {
          // Broken link → ghost node
          if (!ghostMap.has(lower)) ghostMap.set(lower, { title: orig, sources: new Set() })
          ghostMap.get(lower)!.sources.add(r.id)
        }
      }
      // Track values naming an existing article count as links (never ghosts).
      try {
        const tracks = JSON.parse(r.tracks || '{}')
        for (const v of Object.values(tracks)) {
          if (typeof v === 'string') {
            const lower = v.toLowerCase()
            if (lower !== selfLower && byTitle.has(lower)) targets.add(lower)
          }
        }
      } catch {}

      for (const t of targets) {
        const target = byTitle.get(t)
        const key = r.id < target.id ? `${r.id}:${target.id}` : `${target.id}:${r.id}`
        if (edgeSeen.has(key)) continue
        edgeSeen.add(key)
        edges.push({ from: r.id, to: target.id })
      }
    }

    // ── Unlinked mentions ────────────────────────────────────────────────────
    // Build one combined whole-word regex of all article titles (≥3 chars, to
    // avoid noise), longest first so overlapping names prefer the longer match.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const scanTitles = rows.map(r => r.title).filter(t => t.length >= 3)
      .sort((a, b) => b.length - a.length)
    const mentions: { from: number; to: number }[] = []
    const mentionSeen = new Set<string>()
    if (scanTitles.length > 0) {
      const re = new RegExp(`\\b(?:${scanTitles.map(esc).join('|')})\\b`, 'gi')
      for (const r of rows) {
        const text = plainText(r.content)
        if (!text) continue
        re.lastIndex = 0
        const found = new Set<number>()
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const target = byTitle.get(m[0].toLowerCase())
          if (target && target.id !== r.id) found.add(target.id)
        }
        for (const tid of found) {
          const key = r.id < tid ? `${r.id}:${tid}` : `${tid}:${r.id}`
          if (edgeSeen.has(key) || mentionSeen.has(key)) continue  // already a real link
          mentionSeen.add(key)
          mentions.push({ from: r.id, to: tid })
        }
      }
    }

    return {
      nodes: rows.map(r => ({ id: r.id, title: r.title, article_type: r.article_type, updated_at: r.updated_at })),
      edges,
      ghosts: [...ghostMap.values()].map(g => ({ title: g.title, sources: [...g.sources] })),
      mentions,
    }
  })

  // Wiki health: stub articles, orphans (no wiki-link/track edges — same rule as
  // the wiki graph's "unlinked"), and broken [[links]].
  ipcMain.handle('articles:health', (_e, campaignId: number) => {
    const rows = db.prepare(`
      SELECT id, title, article_type, content, tracks, statblock, item_block, substeps, rewards
      FROM articles WHERE campaign_id = ?
    `).all(campaignId) as any[]

    // The editor serializes a full default statblock on every save, so column
    // length says nothing — check each type's block for actual data instead.
    const hasStructuredContent = (r: any): boolean => {
      try {
        if (r.article_type === 'quest') {
          if (JSON.parse(r.substeps || '[]').length > 0) return true
          const rewards = JSON.parse(r.rewards || '[]')
          return Array.isArray(rewards) && rewards.length > 0
        }
        if (r.article_type === 'item' || r.article_type === 'artifact') {
          const ib = JSON.parse(r.item_block || '{}')
          return !!(ib.category || ib.rarity || (ib.description || '').trim() || ib.properties?.length || ib.requiresAttunement)
        }
        if (r.article_type === 'creature' || r.article_type === 'character' || r.article_type === 'playerCharacter') {
          const parsed = JSON.parse(r.statblock || '{}')
          // Creatures store an array of variants; others a single statblock.
          const blocks = Array.isArray(parsed) ? parsed.map((v: any) => v.statblock ?? v) : [parsed]
          return blocks.some((sb: any) =>
            sb && (sb.traits?.length || sb.actions?.length || sb.cr || sb.classLevels?.length))
        }
      } catch {}
      return false
    }

    // Walk a TipTap doc: total trimmed text length + wikiLink titles (original case).
    const extract = (raw: string) => {
      let textLen = 0
      const links = new Map<string, string>() // lowercase → original
      const walk = (node: any) => {
        if (!node || typeof node !== 'object') return
        if (typeof node.text === 'string') {
          textLen += node.text.trim().length
          for (const m of node.marks ?? []) {
            if (m.type === 'wikiLink' && m.attrs?.title) {
              const t = String(m.attrs.title)
              links.set(t.toLowerCase(), t)
            }
          }
        }
        for (const child of node.content ?? []) walk(child)
      }
      try { walk(JSON.parse(raw)) } catch {}
      return { textLen, links }
    }

    const byTitle = new Map<string, any>()
    for (const r of rows) byTitle.set(r.title.toLowerCase(), r)

    const incoming = new Map<number, number>()
    const outgoing = new Map<number, number>()
    const broken = new Map<string, { title: string; sources: { id: number; title: string }[] }>()
    const stubs: { id: number; title: string; article_type: string; textLen: number }[] = []

    for (const r of rows) {
      const { textLen, links } = extract(r.content)

      // Track values naming another article (quest giver, ruler, …) count as links.
      try {
        const tracks = JSON.parse(r.tracks || '{}')
        for (const v of Object.values(tracks)) {
          if (typeof v === 'string' && byTitle.has(v.toLowerCase())) links.set(v.toLowerCase(), v)
        }
      } catch {}
      links.delete(r.title.toLowerCase()) // self-references don't count

      for (const [key, original] of links) {
        const target = byTitle.get(key)
        if (target) {
          outgoing.set(r.id, (outgoing.get(r.id) ?? 0) + 1)
          incoming.set(target.id, (incoming.get(target.id) ?? 0) + 1)
        } else {
          const entry = broken.get(key) ?? { title: original, sources: [] }
          entry.sources.push({ id: r.id, title: r.title })
          broken.set(key, entry)
        }
      }

      // Stub check: little prose and no real structured content for its type.
      if (textLen < 100 && !hasStructuredContent(r)) {
        stubs.push({ id: r.id, title: r.title, article_type: r.article_type, textLen })
      }
    }

    // Orphans mirror the wiki graph's "unlinked" definition: an article with no
    // wiki-link or track-reference edge to/from another article. Deliberately does
    // NOT count links from session/DM notes or relation-web membership, and (like
    // the graph's default view) only excludes creatures, so the hub's "No
    // connections" count matches the graph's "unlinked" count. Creatures are
    // bestiary reference, rarely woven into the wiki, so they stay excluded.
    const orphans = rows
      .filter(r => r.article_type !== 'creature')
      .filter(r => !outgoing.get(r.id) && !incoming.get(r.id))
      .map(r => ({ id: r.id, title: r.title, article_type: r.article_type }))
      .sort((a, b) => a.title.localeCompare(b.title))

    stubs.sort((a, b) => a.textLen - b.textLen)
    const brokenList = [...broken.values()].sort((a, b) => b.sources.length - a.sources.length)

    return { stubs, orphans, broken: brokenList }
  })

  ipcMain.handle('articles:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO articles (campaign_id, title, content, article_type, tags, tracks, statblock, loot_table, loot_table_id, portrait_image)
      VALUES (@campaign_id, @title, @content, @article_type, @tags, @tracks, @statblock, @loot_table, @loot_table_id, @portrait_image)
    `).run({
      content: '{"type":"doc","content":[]}',
      article_type: 'location',
      tags: '[]',
      tracks: '{}',
      statblock: '{}',
      loot_table: '{"name":"Loot","items":[]}',
      loot_table_id: null,
      portrait_image: null,
      ...data,
    })
    return db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('articles:update', (_e, id: number, data: any) => {
    const userDataPath = app.getPath('userData')
    const old = db.prepare(
      'SELECT content, cover_image, portrait_image, campaign_id, article_type FROM articles WHERE id = ?'
    ).get(id) as { content: string; cover_image: string | null; portrait_image: string | null; campaign_id: number; article_type: string } | undefined

    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE articles SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })

    // Keep the auto territory web in sync when a location's containment may change.
    if (old && old.article_type === 'location' && (data.tracks !== undefined || data.title !== undefined)) {
      try { syncTerritoryWeb(old.campaign_id) } catch (e) { console.error('syncTerritoryWeb failed:', e) }
    }

    if (old) {
      if (old.cover_image && data.cover_image !== undefined && data.cover_image !== old.cover_image) {
        unlinkImageRef(old.cover_image, userDataPath)
      }
      if (old.portrait_image && data.portrait_image !== undefined && data.portrait_image !== old.portrait_image &&
          !old.portrait_image.includes('creature_')) {
        unlinkImageRef(old.portrait_image, userDataPath)
      }
      if (data.content !== undefined && data.content !== old.content) {
        const oldPaths = new Set(extractInlineImagePaths(old.content, userDataPath))
        const newPaths = new Set(extractInlineImagePaths(data.content, userDataPath))
        for (const p of oldPaths) { if (!newPaths.has(p)) safeUnlink(p) }
      }
    }

    return db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
  })

  ipcMain.handle('articles:delete', (_e, id: number) => {
    const userDataPath = app.getPath('userData')
    const article = db.prepare(
      'SELECT content, cover_image, portrait_image, campaign_id, article_type FROM articles WHERE id = ?'
    ).get(id) as { content: string; cover_image: string | null; portrait_image: string | null; campaign_id: number; article_type: string } | undefined

    // Hierarchy webs that reference this article — refresh their linked article's
    // Leader track after deletion (family relations are computed live, so they
    // need no resync). Captured before the delete cascades article_id to NULL.
    const affectedWebs = db.prepare(`
      SELECT DISTINCT n.web_id
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE n.article_id = ? AND w.template = 'org_hierarchy'
    `).all(id) as { web_id: number }[]

    // Article-owned maps (location maps) cascade with the article — capture
    // their files and POI contents before the delete.
    const maps = db.prepare('SELECT DISTINCT image_path FROM maps WHERE article_id = ?')
      .all(id) as { image_path: string }[]
    const pois = db.prepare(`
      SELECT p.content FROM pois p JOIN maps m ON m.id = p.map_id WHERE m.article_id = ?
    `).all(id) as { content: string }[]

    db.prepare('DELETE FROM articles WHERE id = ?').run(id)

    for (const { web_id } of affectedWebs) syncHierarchyForWeb(web_id)

    // A deleted location leaves an orphaned territory node (article_id → NULL) —
    // resync to prune it and any containment edges that referenced it.
    if (article && article.article_type === 'location') {
      try { syncTerritoryWeb(article.campaign_id) } catch (e) { console.error('syncTerritoryWeb failed:', e) }
    }

    if (article) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink)
      unlinkImageRef(article.cover_image, userDataPath)
      if (!article.portrait_image?.includes('creature_')) unlinkImageRef(article.portrait_image, userDataPath)
    }
    for (const p of pois) extractInlineImagePaths(p.content, userDataPath).forEach(safeUnlink)
    // Map images can be shared with other maps (picker reuse) — ref-count first.
    const mapRefs = db.prepare('SELECT COUNT(*) AS c FROM maps WHERE image_path = ?')
    for (const m of maps) {
      if ((mapRefs.get(m.image_path) as { c: number }).c === 0) safeUnlinkRelative(m.image_path, userDataPath)
    }
  })
}
