// path: electron/main/relationsSync.ts
import { db } from './db'

// ── Family tree relation derivation ───────────────────────────────────────────

// Map a parent's union role (e.g. "husband of", "wife of") to the term the
// child uses for them ("father", "mother", or a neutral "parent").
function parentRoleFromUnionLabel(label: string | null | undefined): string {
  const l = (label || '').toLowerCase()
  if (l.includes('husband') || l.includes('father')) return 'father'
  if (l.includes('wife') || l.includes('mother')) return 'mother'
  return 'parent'
}

export function deriveRelationsForNode(
  nodeId: number,
  nodes: any[],
  edges: any[],
  webName: string,
  webId: number,
) {
  const partners: any[] = []
  const children: any[]  = []
  const parents: any[]   = []
  const siblings: any[]  = []
  const siblingIds = new Set<number>()

  const myUnionEdges = edges.filter(e => e.edge_type === 'person_to_union' && e.from_node_id === nodeId)
  for (const ue of myUnionEdges) {
    const unionId = ue.to_node_id
    edges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === unionId && e.from_node_id !== nodeId)
      .forEach(e => {
        const p = nodes.find(n => n.id === e.from_node_id)
        // Use the partner's OWN role in the union (so it reads from the current
        // person's perspective: "Gandalf — husband"), not the current node's role.
        if (p) partners.push({ nodeId: p.id, articleId: p.article_id, name: p.article_title || p.label, role: (e.label_from || '').replace(/ of$/i, '').trim() || 'partner', vitality: p.vitality ?? null })
      })
    edges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === unionId)
      .forEach(e => {
        const c = nodes.find(n => n.id === e.to_node_id)
        if (c) children.push({ nodeId: c.id, articleId: c.article_id, name: c.article_title || c.label, vitality: c.vitality ?? null })
      })
  }

  const parentUnionEdges = edges.filter(e => e.edge_type === 'union_to_child' && e.to_node_id === nodeId)
  for (const pe of parentUnionEdges) {
    const unionId = pe.from_node_id
    const unionMembers = edges.filter(e => e.edge_type === 'person_to_union' && e.to_node_id === unionId)
    unionMembers.forEach(e => {
      const p = nodes.find(n => n.id === e.from_node_id)
      // From the child's perspective: show "mother"/"father" rather than the
      // parent's union role ("wife of"/"husband of").
      if (p) parents.push({ nodeId: p.id, articleId: p.article_id, name: p.article_title || p.label, role: parentRoleFromUnionLabel(e.label_from), vitality: p.vitality ?? null })
    })
    if (unionMembers.length < 2) {
      parents.push({ nodeId: null, articleId: null, name: 'Unknown parent', role: 'parent', vitality: null })
    }
    edges.filter(e => e.edge_type === 'union_to_child' && e.from_node_id === unionId && e.to_node_id !== nodeId)
      .forEach(e => {
        if (!siblingIds.has(e.to_node_id)) {
          siblingIds.add(e.to_node_id)
          const s = nodes.find(n => n.id === e.to_node_id)
          if (s) siblings.push({ nodeId: s.id, articleId: s.article_id, name: s.article_title || s.label, vitality: s.vitality ?? null })
        }
      })
  }

  return { webId, webName, partners, parents, children, siblings }
}

// ── Hierarchy relation derivation ─────────────────────────────────────────────
// For a node in a hierarchy web: its rank, who it reports to (superiors), and
// who reports to it (direct reports / oversees). reports_to edges are stored
// subordinate → superior (from = subordinate, to = superior).
export function deriveHierarchyForNode(nodeId: number, nodes: any[], edges: any[], ranks: any[]) {
  const node = nodes.find(n => n.id === nodeId)
  const rank = node?.rank_id ? (ranks.find(r => r.id === node.rank_id) || null) : null

  const superiors: any[] = []
  const reports: any[] = []

  edges.filter(e => e.edge_type === 'reports_to' && e.from_node_id === nodeId).forEach(e => {
    const s = nodes.find(n => n.id === e.to_node_id)
    if (s) superiors.push({ nodeId: s.id, articleId: s.article_id, name: s.article_title || s.label, vitality: s.vitality ?? null })
  })
  edges.filter(e => e.edge_type === 'reports_to' && e.to_node_id === nodeId).forEach(e => {
    const r = nodes.find(n => n.id === e.from_node_id)
    if (r) reports.push({ nodeId: r.id, articleId: r.article_id, name: r.article_title || r.label, vitality: r.vitality ?? null })
  })

  return { rankName: rank?.name ?? null, superiors, reports }
}

// Leaders of a hierarchy web: occupants of the highest rank present, or — if no
// ranks are assigned — the roots of the reporting tree (have reports, report to none).
function computeHierarchyLeaders(nodes: any[], edges: any[], ranks: any[]): any[] {
  const persons = nodes.filter(n => n.node_type === 'person')
  const rankIdx = (id: string | null) => {
    const i = ranks.findIndex((r: any) => r.id === id)
    return i === -1 ? Infinity : i
  }
  const assigned = persons.filter(n => rankIdx(n.rank_id) !== Infinity)
  if (assigned.length) {
    const minIdx = Math.min(...assigned.map(n => rankIdx(n.rank_id)))
    return assigned.filter(n => rankIdx(n.rank_id) === minIdx)
  }
  const reportsToSomeone = new Set(edges.filter(e => e.edge_type === 'reports_to').map(e => e.from_node_id))
  const hasReports = new Set(edges.filter(e => e.edge_type === 'reports_to').map(e => e.to_node_id))
  return persons.filter(n => hasReports.has(n.id) && !reportsToSomeone.has(n.id))
}

// For a hierarchy web linked to an article: derive the leader(s) from the
// structure and write them into the linked article's "Leader" track.
export function syncHierarchyForWeb(webId: number) {
  const web = db.prepare('SELECT * FROM relation_webs WHERE id = ?').get(webId) as any
  if (!web || web.template !== 'org_hierarchy' || !web.article_id) return

  const nodes = db.prepare(`
    SELECT n.id, n.node_type, n.rank_id, n.label, a.title AS article_title
    FROM relation_nodes n
    LEFT JOIN articles a ON a.id = n.article_id
    WHERE n.web_id = ?
  `).all(webId) as any[]
  const edges = db.prepare('SELECT * FROM relation_edges WHERE web_id = ?').all(webId) as any[]
  let ranks: any[] = []
  try { ranks = JSON.parse(web.ranks || '[]') } catch {}

  const leaders = computeHierarchyLeaders(nodes, edges, ranks)
  const leaderStr = leaders.map(n => n.article_title || n.label).filter(Boolean).join(', ')
  // Don't clobber a manually-set Leader when the structure has no leader yet.
  if (!leaderStr) return

  const art = db.prepare('SELECT tracks FROM articles WHERE id = ?').get(web.article_id) as any
  if (!art) return
  let tracks: Record<string, any> = {}
  try { tracks = JSON.parse(art.tracks || '{}') } catch {}
  if ((tracks.Leader || '') !== leaderStr) {
    tracks.Leader = leaderStr
    db.prepare('UPDATE articles SET tracks = ? WHERE id = ?').run(JSON.stringify(tracks), web.article_id)
  }
}

// Auto-generate & maintain the campaign's single "Territory" web from location
// "Within" links. Reconciles nodes/edges to the current containment graph,
// preserving positions of nodes that already exist so the layout grows gradually.
export function syncTerritoryWeb(campaignId: number) {
  const locations = db.prepare(
    `SELECT id, title, tracks FROM articles WHERE campaign_id = ? AND article_type = 'location'`
  ).all(campaignId) as any[]

  // Map lowercased title → article id, to resolve the "Within" title reference.
  const titleToId = new Map<string, number>()
  for (const l of locations) titleToId.set(l.title.toLowerCase(), l.id)

  const withinOf = (tracks: string): string => {
    try { return (JSON.parse(tracks || '{}').Within || '').trim() } catch { return '' }
  }

  // Containment links: child article → parent article.
  const links: { childId: number; parentId: number }[] = []
  for (const l of locations) {
    const within = withinOf(l.tracks)
    if (!within) continue
    const parentId = titleToId.get(within.toLowerCase())
    if (parentId && parentId !== l.id) links.push({ childId: l.id, parentId })
  }

  let web = db.prepare(
    `SELECT * FROM relation_webs WHERE campaign_id = ? AND template = 'territory' LIMIT 1`
  ).get(campaignId) as any

  // No containment anywhere — remove the auto web entirely if it exists.
  if (links.length === 0) {
    if (web) db.prepare(`DELETE FROM relation_webs WHERE id = ?`).run(web.id)
    return
  }

  if (!web) {
    const res = db.prepare(`
      INSERT INTO relation_webs (campaign_id, name, description, template, ranks, article_id)
      VALUES (?, 'Territory', 'Auto-generated from location “Within” links — edits here are overwritten.', 'territory', '[]', NULL)
    `).run(campaignId)
    web = db.prepare(`SELECT * FROM relation_webs WHERE id = ?`).get(res.lastInsertRowid)
  }
  const webId = web.id as number

  // Every location that participates in at least one containment link.
  const participating = new Set<number>()
  for (const { childId, parentId } of links) { participating.add(childId); participating.add(parentId) }

  const existingNodes = db.prepare(
    `SELECT id, article_id, pos_x, pos_y FROM relation_nodes WHERE web_id = ?`
  ).all(webId) as any[]
  const nodeByArticle = new Map<number, any>(existingNodes.map(n => [n.article_id, n]))
  const locById = new Map<number, any>(locations.map(l => [l.id, l]))

  // Drop nodes whose location no longer participates (cascades their edges).
  for (const n of existingNodes) {
    if (!participating.has(n.article_id)) {
      db.prepare(`DELETE FROM relation_nodes WHERE id = ?`).run(n.id)
      nodeByArticle.delete(n.article_id)
    }
  }

  // Add nodes for newly participating locations, placed near their parent.
  const insertNode = db.prepare(`
    INSERT INTO relation_nodes (web_id, article_id, label, node_type, pos_x, pos_y)
    VALUES (?, ?, ?, 'person', ?, ?)
  `)
  for (const artId of participating) {
    if (nodeByArticle.has(artId)) continue
    const loc = locById.get(artId)
    const link = links.find(l => l.childId === artId)
    let px = 120 + Math.random() * 60, py = 120
    if (link) {
      const parent = nodeByArticle.get(link.parentId)
      if (parent) { px = parent.pos_x + (Math.random() * 80 - 40); py = parent.pos_y + 140 }
    }
    const res = insertNode.run(webId, artId, loc?.title ?? 'Location', px, py)
    nodeByArticle.set(artId, { id: res.lastInsertRowid as number, article_id: artId, pos_x: px, pos_y: py })
  }

  // Reconcile edges to exactly the parent→child set.
  // Edges are fully derived — wipe and rebuild so styling stays consistent.
  // 'reports_to' renders as clean stepped org-chart connectors with an arrowhead
  // and no label pills; bottom→top handles keep the lines flowing straight down.
  db.prepare(`DELETE FROM relation_edges WHERE web_id = ?`).run(webId)
  const insertEdge = db.prepare(`
    INSERT INTO relation_edges (web_id, from_node_id, to_node_id, label_from, label_to, edge_type, from_handle, to_handle)
    VALUES (?, ?, ?, '', '', 'reports_to', 'bottom', 'top')
  `)
  const made = new Set<string>()
  for (const { childId, parentId } of links) {
    const pn = nodeByArticle.get(parentId), cn = nodeByArticle.get(childId)
    if (!pn || !cn) continue
    const key = `${pn.id}-${cn.id}`
    if (made.has(key)) continue
    made.add(key)
    insertEdge.run(webId, pn.id, cn.id)
  }

  db.prepare(`UPDATE relation_webs SET updated_at = datetime('now') WHERE id = ?`).run(webId)
}
