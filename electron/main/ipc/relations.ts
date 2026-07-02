// path: electron/main/ipc/relations.ts
import { ipcMain } from 'electron'
import { db } from '../db'
import { deriveRelationsForNode, deriveHierarchyForNode, syncHierarchyForWeb } from '../relationsSync'

export function registerRelationIPC() {

  // ── Relation Webs ─────────────────────────────────────────────────────────────

  ipcMain.handle('relation-webs:get-all', (_e, campaignId: number) => {
    return db.prepare(`
      SELECT w.*,
        (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w
      WHERE w.campaign_id = ?
      ORDER BY w.updated_at DESC
    `).all(campaignId)
  })

  ipcMain.handle('relation-webs:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO relation_webs (campaign_id, name, description, template, ranks, article_id)
      VALUES (@campaign_id, @name, @description, @template, @ranks, @article_id)
    `).run({ description: '', template: 'custom', ranks: '[]', article_id: null, ...data })
    const webId = result.lastInsertRowid as number
    // Mirror the primary link into the join table so it appears in the rail.
    if (data.article_id) {
      db.prepare(`INSERT OR IGNORE INTO relation_web_articles (web_id, article_id) VALUES (?, ?)`)
        .run(webId, data.article_id)
    }
    return db.prepare(`
      SELECT w.*, 0 AS node_count FROM relation_webs w WHERE w.id = ?
    `).get(webId)
  })

  ipcMain.handle('relation-webs:update', (_e, id: number, data: any) => {
    const allowed = ['name', 'description', 'template', 'ranks']
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))
    if (Object.keys(clean).length === 0) {
      return db.prepare(`
        SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
        FROM relation_webs w WHERE w.id = ?
      `).get(id)
    }
    const fields = Object.keys(clean).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE relation_webs SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...clean, id })
    return db.prepare(`
      SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w WHERE w.id = ?
    `).get(id)
  })

  ipcMain.handle('relation-webs:delete', (_e, id: number) => {
    db.prepare('DELETE FROM relation_webs WHERE id = ?').run(id)
  })

  ipcMain.handle('relation-webs:get-data', (_e, webId: number) => {
    const nodes = db.prepare(`
      SELECT n.id, n.web_id, n.article_id, n.label, n.node_type, n.rank_id, n.pos_x, n.pos_y,
             a.title AS article_title, a.article_type, a.tracks
      FROM relation_nodes n
      LEFT JOIN articles a ON a.id = n.article_id
      WHERE n.web_id = ?
      ORDER BY n.id
    `).all(webId) as any[]

    const nodesWithVitality = nodes.map(n => {
      let vitality: string | null = null
      if (n.tracks) {
        try {
          const tracks = JSON.parse(n.tracks)
          vitality = tracks.Vitality || null
        } catch {}
      }
      return { ...n, vitality }
    })

    const edges = db.prepare(`
      SELECT * FROM relation_edges WHERE web_id = ? ORDER BY id
    `).all(webId)

    return { nodes: nodesWithVitality, edges }
  })

  // ── Relation Nodes ────────────────────────────────────────────────────────────

  ipcMain.handle('relation-nodes:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO relation_nodes (web_id, article_id, label, node_type, rank_id, pos_x, pos_y)
      VALUES (@web_id, @article_id, @label, @node_type, @rank_id, @pos_x, @pos_y)
    `).run({ article_id: null, node_type: 'person', rank_id: '', pos_x: 100, pos_y: 100, ...data })

    db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(data.web_id)

    const node = db.prepare(`
      SELECT n.id, n.web_id, n.article_id, n.label, n.node_type, n.rank_id, n.pos_x, n.pos_y,
             a.title AS article_title, a.article_type, a.tracks
      FROM relation_nodes n
      LEFT JOIN articles a ON a.id = n.article_id
      WHERE n.id = ?
    `).get(result.lastInsertRowid) as any

    let vitality: string | null = null
    if (node?.tracks) {
      try { vitality = JSON.parse(node.tracks).Vitality || null } catch {}
    }
    const { tracks: _t, ...rest } = node ?? {}
    return { ...rest, vitality }
  })

  ipcMain.handle('relation-nodes:update', (_e, id: number, data: any) => {
    const allowed = ['article_id', 'label', 'node_type', 'rank_id', 'pos_x', 'pos_y']
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))
    if (Object.keys(clean).length === 0) return null
    const fields = Object.keys(clean).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE relation_nodes SET ${fields} WHERE id = @id`).run({ ...clean, id })

    const node = db.prepare(`
      SELECT n.id, n.web_id, n.article_id, n.label, n.node_type, n.rank_id, n.pos_x, n.pos_y,
             a.title AS article_title, a.article_type, a.tracks
      FROM relation_nodes n
      LEFT JOIN articles a ON a.id = n.article_id
      WHERE n.id = ?
    `).get(id) as any

    if (node?.web_id) {
      db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(node.web_id)
    }

    let vitality: string | null = null
    if (node?.tracks) {
      try { vitality = JSON.parse(node.tracks).Vitality || null } catch {}
    }
    const { tracks: _t, ...rest } = node ?? {}
    return { ...rest, vitality }
  })

  ipcMain.handle('relation-nodes:delete', (_e, id: number) => {
    const node = db.prepare('SELECT web_id FROM relation_nodes WHERE id = ?').get(id) as any
    db.prepare('DELETE FROM relation_edges WHERE from_node_id = ? OR to_node_id = ?').run(id, id)
    db.prepare('DELETE FROM relation_nodes WHERE id = ?').run(id)
    // Refresh the linked article's Leader track in case the deleted node was a
    // leader (no-op for non-hierarchy webs). Family relations are computed live.
    if (node?.web_id) syncHierarchyForWeb(node.web_id)
  })

  // ── Relation Edges ────────────────────────────────────────────────────────────

  ipcMain.handle('relation-edges:create', (_e, data: any) => {
    const result = db.prepare(`
      INSERT INTO relation_edges (web_id, from_node_id, to_node_id, label_from, label_to, edge_type, from_handle, to_handle)
      VALUES (@web_id, @from_node_id, @to_node_id, @label_from, @label_to, @edge_type, @from_handle, @to_handle)
    `).run({ label_from: '', label_to: '', edge_type: 'standard', from_handle: '', to_handle: '', ...data })
    db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(data.web_id)
    return db.prepare('SELECT * FROM relation_edges WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('relation-edges:update', (_e, id: number, data: any) => {
    const allowed = ['label_from', 'label_to', 'edge_type', 'from_node_id', 'to_node_id']
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)))
    if (Object.keys(clean).length === 0) return db.prepare('SELECT * FROM relation_edges WHERE id = ?').get(id)
    const fields = Object.keys(clean).map(k => `${k} = @${k}`).join(', ')
    db.prepare(`UPDATE relation_edges SET ${fields} WHERE id = @id`).run({ ...clean, id })
    return db.prepare('SELECT * FROM relation_edges WHERE id = ?').get(id)
  })

  ipcMain.handle('relation-edges:delete', (_e, id: number) => {
    db.prepare('DELETE FROM relation_edges WHERE id = ?').run(id)
  })

  ipcMain.handle('relation-edges:get-for-article', (_e, articleId: number, campaignId: number) => {
    let edgeRowId = 0

    // 1) Standard edges (non-family-tree webs)
    const standardRows = (db.prepare(`
      SELECT
        e.id AS edge_id,
        e.label_from, e.label_to,
        e.from_node_id, e.to_node_id,
        w.id AS web_id, w.name AS web_name, w.template AS web_template,
        fn.label AS from_node_label, fn.article_id AS from_article_id,
        tn.label AS to_node_label, tn.article_id AS to_article_id,
        fa.title AS from_article_title, fa.tracks AS from_tracks,
        ta.title AS to_article_title, ta.tracks AS to_tracks
      FROM relation_edges e
      JOIN relation_nodes fn ON fn.id = e.from_node_id
      JOIN relation_nodes tn ON tn.id = e.to_node_id
      JOIN relation_webs w ON w.id = e.web_id
      LEFT JOIN articles fa ON fa.id = fn.article_id
      LEFT JOIN articles ta ON ta.id = tn.article_id
      WHERE w.campaign_id = ?
        AND (fn.article_id = ? OR tn.article_id = ?)
        AND (e.edge_type = 'standard' OR e.edge_type IS NULL)
      ORDER BY w.name, e.id
    `).all(campaignId, articleId, articleId) as any[]).map(row => {
      let fromVitality: string | null = null
      let toVitality: string | null = null
      try { fromVitality = JSON.parse(row.from_tracks || '{}').Vitality || null } catch {}
      try { toVitality = JSON.parse(row.to_tracks || '{}').Vitality || null } catch {}
      const { from_tracks, to_tracks, web_template, ...rest } = row
      return { ...rest, from_vitality: fromVitality, to_vitality: toVitality }
    })

    // 2) Derived family-tree relations — computed live from the web graph so
    //    labels, names, and vitality always reflect the current data (no stale
    //    cache, and partner roles read from the current person's perspective).
    const familyNodes = db.prepare(`
      SELECT n.id, n.web_id, w.name AS web_name
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE n.article_id = ? AND w.campaign_id = ? AND w.template = 'family_tree'
    `).all(articleId, campaignId) as { id: number; web_id: number; web_name: string }[]

    const webGraphCache: Record<number, { nodes: any[]; edges: any[]; ranks: any[] }> = {}
    const loadWebGraph = (webId: number) => {
      if (!webGraphCache[webId]) {
        const wn = db.prepare(`
          SELECT n.id, n.article_id, n.node_type, n.rank_id, n.label, a.title AS article_title, a.tracks
          FROM relation_nodes n
          LEFT JOIN articles a ON a.id = n.article_id
          WHERE n.web_id = ?
        `).all(webId) as any[]
        const nodes = wn.map(n => {
          let vitality: string | null = null
          try { vitality = JSON.parse(n.tracks || '{}').Vitality || null } catch {}
          return { ...n, vitality }
        })
        const edges = db.prepare('SELECT * FROM relation_edges WHERE web_id = ?').all(webId) as any[]
        const webRow = db.prepare('SELECT ranks FROM relation_webs WHERE id = ?').get(webId) as any
        let ranks: any[] = []
        try { ranks = JSON.parse(webRow?.ranks || '[]') } catch {}
        webGraphCache[webId] = { nodes, edges, ranks }
      }
      return webGraphCache[webId]
    }

    const derivedRows: any[] = []
    for (const fn of familyNodes) {
      const { nodes, edges } = loadWebGraph(fn.web_id)
      const derived = deriveRelationsForNode(fn.id, nodes, edges, fn.web_name, fn.web_id)
      const push = (entries: any[], roleFallback: string) => {
        for (const e of entries) {
          const role = (e.role || roleFallback || '').trim()
          derivedRows.push({
            // Synthesise an edge_id that won't collide with real edge ids — negative
            edge_id: --edgeRowId,
            web_id: fn.web_id,
            web_name: fn.web_name,
            // We render from the perspective of the current article, so put it on `from`
            from_node_id: 0,
            to_node_id: e.nodeId ?? 0,
            from_article_id: articleId,
            to_article_id: e.articleId ?? null,
            from_article_title: null,
            to_article_title: e.articleId ? e.name : null,
            from_node_label: '',
            to_node_label: e.name || '',
            from_vitality: null,
            to_vitality: e.vitality ?? null,
            label_from: '',
            label_to: role,
          })
        }
      }

      push(derived.parents,  'parent')
      push(derived.partners, 'partner')
      push(derived.children, 'child')
      push(derived.siblings, 'sibling')
    }

    // 3) Derived hierarchy relations — rank, reports-to (superiors), oversees
    //    (direct reports), computed live from the web graph.
    const hierarchyNodes = db.prepare(`
      SELECT n.id, n.web_id, w.name AS web_name
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      WHERE n.article_id = ? AND w.campaign_id = ? AND w.template = 'org_hierarchy'
    `).all(articleId, campaignId) as { id: number; web_id: number; web_name: string }[]

    for (const hn of hierarchyNodes) {
      const { nodes, edges, ranks } = loadWebGraph(hn.web_id)
      const d = deriveHierarchyForNode(hn.id, nodes, edges, ranks)
      const pushH = (entries: any[], role: string) => {
        for (const e of entries) {
          derivedRows.push({
            edge_id: --edgeRowId,
            web_id: hn.web_id,
            web_name: hn.web_name,
            from_node_id: 0,
            to_node_id: e.nodeId ?? 0,
            from_article_id: articleId,
            to_article_id: e.articleId ?? null,
            from_article_title: null,
            to_article_title: e.articleId ? e.name : null,
            from_node_label: '',
            to_node_label: e.name || '',
            from_vitality: null,
            to_vitality: e.vitality ?? null,
            label_from: '',
            label_to: role,
          })
        }
      }
      // Pushed in reverse of desired display order — rows sort by ascending
      // (most-negative) edge_id, so the last pushed shows first: Rank, Reports to, Oversees.
      pushH(d.reports, 'oversees')
      pushH(d.superiors, 'reports to')
      if (d.rankName) {
        derivedRows.push({
          edge_id: --edgeRowId,
          web_id: hn.web_id,
          web_name: hn.web_name,
          from_node_id: 0, to_node_id: 0,
          from_article_id: articleId, to_article_id: null,
          from_article_title: null, to_article_title: null,
          from_node_label: '', to_node_label: d.rankName,
          from_vitality: null, to_vitality: null,
          label_from: '', label_to: 'rank',
          is_rank: true,
        })
      }
    }

    return [...standardRows, ...derivedRows].sort((a, b) =>
      a.web_name.localeCompare(b.web_name) || a.edge_id - b.edge_id
    )
  })

  // ── Derived relations sync ─────────────────────────────────────────────────────

  ipcMain.handle('relation-webs:sync-derived-relations', (_e, webId: number) => {
    syncHierarchyForWeb(webId)
  })

  // The hierarchy web (if any) linked to a given article.
  ipcMain.handle('relation-webs:get-for-article', (_e, articleId: number) => {
    return db.prepare(`
      SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w
      WHERE w.article_id = ? AND w.template = 'org_hierarchy'
      ORDER BY w.id LIMIT 1
    `).get(articleId) || null
  })

  // All webs whose article_id points at this article (one-to-one).
  ipcMain.handle('relation-webs:list-for-article', (_e, articleId: number) => {
    return db.prepare(`
      SELECT w.*, (SELECT COUNT(*) FROM relation_nodes n WHERE n.web_id = w.id) AS node_count
      FROM relation_webs w
      WHERE w.article_id = ?
      ORDER BY w.updated_at DESC
    `).all(articleId)
  })

  // Every web an article appears in as a node (membership tags).
  ipcMain.handle('relation-webs:list-for-member', (_e, articleId: number) => {
    return db.prepare(`
      SELECT DISTINCT w.id, w.name, w.template
      FROM relation_webs w
      WHERE w.id IN (SELECT web_id FROM relation_nodes WHERE article_id = ?)
      ORDER BY w.name COLLATE NOCASE
    `).all(articleId)
  })

  // Single article linked to this web (one-to-one). Returns null when unset.
  ipcMain.handle('relation-webs:get-linked-articles', (_e, webId: number) => {
    return db.prepare(`
      SELECT a.id, a.title, a.article_type
      FROM relation_webs w
      JOIN articles a ON a.id = w.article_id
      WHERE w.id = ? AND w.article_id IS NOT NULL
    `).get(webId) ?? null
  })

  // Set the one linked article, replacing any previous link.
  ipcMain.handle('relation-webs:link-article', (_e, webId: number, articleId: number) => {
    db.prepare(`UPDATE relation_webs SET article_id = ? WHERE id = ?`).run(articleId, webId)
  })

  // Remove the linked article.
  ipcMain.handle('relation-webs:unlink-article', (_e, webId: number) => {
    db.prepare(`UPDATE relation_webs SET article_id = NULL WHERE id = ?`).run(webId)
  })

  // Count article-backed members of an org/faction/religion: distinct character
  // or PC articles that appear as a node in any web linked to this article.
  ipcMain.handle('articles:member-count', (_e, articleId: number) => {
    const row = db.prepare(`
      SELECT COUNT(DISTINCT a.id) AS c
      FROM relation_webs w
      JOIN relation_nodes n ON n.web_id = w.id
      JOIN articles a       ON a.id = n.article_id
      WHERE w.article_id = ?
        AND a.article_type IN ('character', 'playerCharacter')
    `).get(articleId) as any
    return row?.c || 0
  })

  // Derived affiliations for a character/PC: the faction/org/religion articles
  // that own a web this character is a node in. Read-only — webs are the source
  // of truth, so the Faction/Religion fields are computed, never stored.
  ipcMain.handle('articles:get-affiliations', (_e, articleId: number) => {
    return db.prepare(`
      SELECT DISTINCT a.id, a.title, a.article_type
      FROM relation_nodes n
      JOIN relation_webs w ON w.id = n.web_id
      JOIN articles a      ON a.id = w.article_id
      WHERE n.article_id = ?
        AND a.article_type IN ('faction', 'organization', 'religion')
      ORDER BY a.article_type, a.title COLLATE NOCASE
    `).all(articleId)
  })

  // Geographic containment for a location: its ancestry chain (root-first) walked
  // up the "Within" parent-location track, plus its direct child locations.
  ipcMain.handle('articles:get-geography', (_e, articleId: number) => {
    const art = db.prepare(
      `SELECT id, title, campaign_id, tracks FROM articles WHERE id = ?`
    ).get(articleId) as any
    if (!art) return { ancestors: [], children: [] }

    const findParent = db.prepare(`
      SELECT id, title, tracks FROM articles
      WHERE campaign_id = ? AND article_type = 'location' AND title = ? COLLATE NOCASE
      LIMIT 1
    `)
    const withinOf = (tracks: string): string => {
      try { return (JSON.parse(tracks || '{}').Within || '').trim() } catch { return '' }
    }

    // Walk up the parent chain (cycle-guarded, depth-capped), root-first.
    const ancestors: { id: number; title: string }[] = []
    const seen = new Set<number>([art.id])
    let tracks: string = art.tracks
    for (let i = 0; i < 20; i++) {
      const within = withinOf(tracks)
      if (!within) break
      const parent = findParent.get(art.campaign_id, within) as any
      if (!parent || seen.has(parent.id)) break
      seen.add(parent.id)
      ancestors.unshift({ id: parent.id, title: parent.title })
      tracks = parent.tracks
    }

    const children = db.prepare(`
      SELECT id, title FROM articles
      WHERE campaign_id = ? AND article_type = 'location'
        AND json_extract(tracks, '$.Within') = ? COLLATE NOCASE
      ORDER BY title COLLATE NOCASE
    `).all(art.campaign_id, art.title)

    return { ancestors, children }
  })
}
