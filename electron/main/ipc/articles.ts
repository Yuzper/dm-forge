// path: electron/main/ipc/articles.ts
import { app, ipcMain } from 'electron'
import { db } from '../db'
import { extractInlineImagePaths, safeUnlink, safeUnlinkRelative } from '../helpers'
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

  // Wiki health: stub articles, orphans (no links in/out), and broken [[links]].
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

    // Articles placed in a relation web count as connected.
    const webArticleIds = new Set(db.prepare(`
      SELECT DISTINCT n.article_id FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE w.campaign_id = ? AND n.article_id IS NOT NULL
    `).all(campaignId).map((r: any) => r.article_id))

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

    // Links from session notes and DM notes count as incoming for orphan purposes.
    const noteDocs = [
      ...db.prepare('SELECT notes AS doc FROM sessions WHERE campaign_id = ?').all(campaignId) as any[],
      ...db.prepare('SELECT content AS doc FROM dm_notes_pages WHERE campaign_id = ?').all(campaignId) as any[],
    ]
    for (const n of noteDocs) {
      for (const [key] of extract(n.doc || '').links) {
        const target = byTitle.get(key)
        if (target) incoming.set(target.id, (incoming.get(target.id) ?? 0) + 1)
      }
    }

    // Creatures are bestiary reference and notes are intentionally standalone —
    // neither is expected to be woven into the wiki, so skip the orphan check.
    const orphans = rows
      .filter(r => r.article_type !== 'creature' && r.article_type !== 'note')
      .filter(r => !outgoing.get(r.id) && !incoming.get(r.id) && !webArticleIds.has(r.id))
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
        safeUnlinkRelative(old.cover_image, userDataPath)
      }
      if (old.portrait_image && data.portrait_image !== undefined && data.portrait_image !== old.portrait_image) {
        safeUnlinkRelative(old.portrait_image, userDataPath)
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

    db.prepare('DELETE FROM articles WHERE id = ?').run(id)

    for (const { web_id } of affectedWebs) syncHierarchyForWeb(web_id)

    // A deleted location leaves an orphaned territory node (article_id → NULL) —
    // resync to prune it and any containment edges that referenced it.
    if (article && article.article_type === 'location') {
      try { syncTerritoryWeb(article.campaign_id) } catch (e) { console.error('syncTerritoryWeb failed:', e) }
    }

    if (article) {
      extractInlineImagePaths(article.content, userDataPath).forEach(safeUnlink)
      safeUnlinkRelative(article.cover_image, userDataPath)
      if (!article.portrait_image?.includes('creature_')) safeUnlinkRelative(article.portrait_image, userDataPath)
    }
  })
}
