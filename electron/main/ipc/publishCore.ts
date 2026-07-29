// path: electron/main/ipc/publishCore.ts
// Pure projection + crypto helpers for the player-site publish pipeline. No
// electron/db imports — only node built-ins — so this is unit-testable on its
// own. The IPC shell (dialog, DB reads, file writes) lives in publish.ts.
//
// Resolver principle (docs/player-pages-plan.md): project first, index second.
// Build each player's redacted corpus, then derive tags/backlinks from THAT
// corpus only — never the DM master.
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

export const PBKDF2_ITERATIONS = 150_000

// ── Track-derived tags (mirror of the renderer's getTrackTags) ────────────────
// Player-facing tags come ONLY from tracks — hand-typed DM tags never ship.
const NON_TAG_TRACKS = new Set(['In_World_Date', 'Death_Date', 'Timeline_Milestones'])

// A track value is a plain string or a JSON array of strings (multi-value
// tracks like Allies/Rivals). Returns the individual entries; JSON objects
// (date pickers, milestone lists) yield none. Mirrors the renderer's trackValues.
export function trackValues(raw: string): string[] {
  const v = (raw ?? '').trim()
  if (!v) return []
  if (v.startsWith('[')) {
    try {
      const a = JSON.parse(v)
      if (Array.isArray(a)) return a.filter((x: any): x is string => typeof x === 'string' && x.trim() !== '').map((x: string) => x.trim())
    } catch { /* malformed → none */ }
    return []
  }
  if (v.startsWith('{')) return []
  return [v]
}

// Date tracks / milestones store an InWorldDate payload ({day,year,label}), not
// prose. Render its human-readable label — shipping the raw JSON would show the
// player `{"day":3,"year":1507,...}`. Returns '' for anything that isn't a date.
export function dateLabel(raw: string): string {
  const v = (raw ?? '').trim()
  if (!v.startsWith('{')) return ''
  try {
    const d = JSON.parse(v)
    if (!d || typeof d !== 'object' || Array.isArray(d)) return ''
    if (typeof d.label === 'string' && d.label.trim()) return d.label.trim()
    if (typeof d.day === 'number' && typeof d.year === 'number') return `Day ${d.day}, Year ${d.year}`
  } catch { /* not a date payload */ }
  return ''
}

export function trackTagsFromObj(tracks: Record<string, any>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(tracks)) {
    if (typeof v !== 'string') continue
    if (NON_TAG_TRACKS.has(k) || k.endsWith('_Date')) continue
    for (const val of trackValues(v)) out.push(val.toLowerCase().replace(/\s+/g, '-'))
  }
  return [...new Set(out)]
}
export function trackTags(tracksJson: string): string[] {
  try { return trackTagsFromObj(JSON.parse(tracksJson || '{}')) } catch { return [] }
}

// ── Track / subtrack (milestone) visibility ───────────────────────────────────
// Inherit-by-default; *_Date tracks default to DM-only. `restricted` limits to
// specific player ids. Milestones (subtracks) key off their milestone id.
function trackMode(vis: any, key: string, isMilestone: boolean): 'inherit' | 'dm' | 'restricted' {
  const entry = (isMilestone ? vis?.milestones : vis?.tracks)?.[key]
  if (entry?.mode) return entry.mode
  if (!isMilestone && key.endsWith('_Date')) return 'dm'
  return 'inherit'
}
export function trackVisibleTo(vis: any, key: string, playerId: number, isMilestone = false): boolean {
  const mode = trackMode(vis, key, isMilestone)
  if (mode === 'inherit') return true
  if (mode === 'dm') return false
  const players = (isMilestone ? vis?.milestones : vis?.tracks)?.[key]?.players ?? []
  return players.includes(playerId)
}

// Walk a TipTap doc: scrub wikiLink marks whose target title isn't in the
// player's visible set (→ plain text, never a dead link leaking a hidden
// title), and rewrite in-bundle image srcs to a relative images/ path. Returns
// the projected content plus the set of *visible* link targets (for backlinks).
// Block nodes that shouldn't survive as empty once their contents are stripped.
const PRUNE_IF_EMPTIED = new Set([
  'paragraph', 'heading', 'listItem', 'blockquote', 'bulletList', 'orderedList',
  'taskList', 'taskItem', 'tableCell', 'tableHeader', 'tableRow', 'table',
])

export function projectContent(
  contentJson: string,
  visibleTitlesLower: Set<string>,
  imageAbs: Map<string, string>,
  userImagesDir: string,
): { content: string; linkTitles: Set<string> } {
  const linkTitles = new Set<string>()
  let doc: any
  try { doc = JSON.parse(contentJson) } catch { return { content: contentJson, linkTitles } }

  // Transform → node | null (null = drop). Strips DM-only text, scrubs wikiLinks
  // to hidden targets, rewrites image srcs, and prunes blocks emptied by removal.
  const tx = (node: any): any | null => {
    if (!node || typeof node !== 'object') return node

    // Text run.
    if (typeof node.text === 'string') {
      const marks = Array.isArray(node.marks) ? node.marks : []
      if (marks.some((m: any) => m?.type === 'dmOnly')) return null // DM-only → removed entirely
      const keptMarks = marks.filter((m: any) => {
        if (m?.type === 'wikiLink' && m.attrs?.title) {
          const t = String(m.attrs.title).toLowerCase()
          if (visibleTitlesLower.has(t)) { linkTitles.add(t); return true }
          return false // hidden target → drop the mark, keep the text
        }
        return true
      })
      return { ...node, marks: keptMarks }
    }

    // Image node — rewrite src to a bundle-relative path.
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const raw = node.attrs.src.startsWith('file://') ? node.attrs.src.slice(7) : node.attrs.src
      if (raw.startsWith(userImagesDir)) {
        const base = path.basename(raw)
        imageAbs.set(base, raw)
        return { ...node, attrs: { ...node.attrs, src: `images/${base}` } }
      }
      return node
    }

    // Container / other node.
    if (Array.isArray(node.content)) {
      const hadChildren = node.content.length > 0
      const newContent = node.content.map(tx).filter((c: any) => c != null)
      if (hadChildren && newContent.length === 0 && PRUNE_IF_EMPTIED.has(node.type)) return null
      return { ...node, content: newContent }
    }
    return node
  }

  const out = tx(doc) ?? { type: 'doc', content: [] }
  return { content: JSON.stringify(out), linkTitles }
}

// A campaign world map plus its base-layer POIs and visible drawing shapes,
// as read from the DB.
export interface WorldMapInput {
  id: number
  name: string
  image_path: string
  pois: any[]
  shapes?: any[]
}

// Build one player's bundle from the DM's articles. `visibleIds` is the already
// resolved set (party ∪ personal ∪ own PC). Side effect: records every
// referenced image (basename → absolute source) into `imageAbs` for copying.
export function buildPlayerBundle(
  player: any,
  articles: any[],
  visibleIds: Set<number>,
  userDataPath: string,
  imageAbs: Map<string, string>,
  worldMaps: WorldMapInput[] = [],
) {
  const userImagesDir = path.join(userDataPath, 'images')
  const visible = articles.filter(a => visibleIds.has(a.id))
  const visibleTitlesLower = new Set(visible.map(a => a.title.toLowerCase()))
  const titleToId = new Map<string, number>(visible.map(a => [a.title.toLowerCase(), a.id]))

  const addRef = (ref: string | null): string | null => {
    if (!ref) return null
    const raw = ref.startsWith('file://') ? ref.slice(7) : ref
    const abs = path.isAbsolute(raw) ? raw : path.join(userDataPath, raw)
    if (!fs.existsSync(abs)) return null
    const base = path.basename(abs)
    imageAbs.set(base, abs)
    return `images/${base}`
  }

  const playerId: number = player.id
  const projected: any[] = []
  const outLinks = new Map<number, Set<string>>()
  for (const a of visible) {
    const { content, linkTitles } = projectContent(a.content, visibleTitlesLower, imageAbs, userImagesDir)
    outLinks.set(a.id, linkTitles)

    // Filter tracks + milestones by per-track visibility (inherit-by-default),
    // then derive tags ONLY from the visible tracks so a hidden track can't leak.
    let vis: any = {}, tracksObj: any = {}
    try { vis = JSON.parse(a.track_visibility || '{}') } catch { /* none */ }
    try { tracksObj = JSON.parse(a.tracks || '{}') } catch { /* none */ }
    const tagSource: Record<string, string> = {}
    const infoTracks: { label: string; value: string }[] = []
    for (const [key, val] of Object.entries(tracksObj)) {
      if (typeof val !== 'string' || key === 'Timeline_Milestones') continue
      if (!trackVisibleTo(vis, key, playerId)) continue
      tagSource[key] = val
      const label = key.replace(/_/g, ' ')
      // Multi-value tracks (Allies/Rivals) show their entries joined; date tracks
      // hold a JSON payload, so they show their human-readable label instead of
      // being dropped (previously a shared date exported nothing at all).
      const vals = trackValues(val)
      if (vals.length) infoTracks.push({ label, value: vals.join(', ') })
      else {
        const d = dateLabel(val)
        if (d) infoTracks.push({ label, value: d })
      }
    }
    const milestones: { label: string; date: string }[] = []
    try {
      const raw = JSON.parse(tracksObj.Timeline_Milestones || '[]')
      if (Array.isArray(raw)) for (const m of raw) {
        // date is an InWorldDate payload — ship its label, never the raw JSON.
        if (m?.id && trackVisibleTo(vis, m.id, playerId, true)) milestones.push({ label: m.label || '', date: dateLabel(m.date || '') })
      }
    } catch { /* none */ }

    projected.push({
      id: a.id,
      title: a.title,
      article_type: a.article_type,
      content,
      cover_image: addRef(a.cover_image),
      portrait_image: addRef(a.portrait_image),
      tags: trackTagsFromObj(tagSource),
      infoTracks,
      milestones,
      // Own player-character stat block only — every other statblock is stripped.
      statblock: a.id === player.pc_article_id ? a.statblock : undefined,
      updated_at: a.updated_at,
    })
  }

  // Backlinks from the SCRUBBED link sets: target id → [{id,title}] of linkers.
  const backlinks: Record<number, { id: number; title: string }[]> = {}
  for (const a of visible) {
    for (const t of outLinks.get(a.id) ?? []) {
      const targetId = titleToId.get(t)
      if (targetId == null || targetId === a.id) continue
      ;(backlinks[targetId] ??= []).push({ id: a.id, title: a.title })
    }
  }

  // Tag index over the projected corpus.
  const tagIndex: Record<string, number[]> = {}
  for (const pa of projected) for (const tag of pa.tags) (tagIndex[tag] ??= []).push(pa.id)

  // World maps: a POI is shown only if it links to an article this player can
  // see (deny-by-default). Its loot/combat/hub internals are never exported —
  // only label, position, style, redacted content, and the article link.
  // First visible linked article, or null when the feature links to nothing the
  // player may see. Shared by pins and shapes so both deny by default.
  const firstVisibleArticle = (hubLinks: string): number | null => {
    try {
      for (const l of JSON.parse(hubLinks || '[]')) {
        if (l?.type === 'wiki' && typeof l.article_id === 'number' && visibleIds.has(l.article_id)) {
          return l.article_id
        }
      }
    } catch { /* malformed hub_links → treat as no link */ }
    return null
  }

  const maps: any[] = []
  for (const wm of worldMaps) {
    const outPois: any[] = []
    for (const poi of wm.pois) {
      const articleId = firstVisibleArticle(poi.hub_links)
      if (articleId == null) continue
      const { content } = projectContent(poi.content, visibleTitlesLower, imageAbs, userImagesDir)
      outPois.push({
        id: poi.id,
        label: poi.label,
        x: poi.x,
        y: poi.y,
        poi_type: poi.poi_type,
        color: poi.color,
        size: poi.hub_size ?? 11,
        opacity: poi.hub_opacity ?? 1,
        articleId,
        content,
      })
    }
    // Drawing shapes follow the same deny-by-default rule: a border ships only
    // if it links to an article this player can see. Geometry and style travel;
    // layer membership and DM-side ordering don't.
    const outShapes: any[] = []
    for (const shape of wm.shapes ?? []) {
      const articleId = firstVisibleArticle(shape.hub_links)
      if (articleId == null) continue
      const { content } = projectContent(shape.content, visibleTitlesLower, imageAbs, userImagesDir)
      outShapes.push({
        id: shape.id,
        label: shape.label,
        shape_type: shape.shape_type,
        points: shape.points,
        fill_color: shape.fill_color,
        fill_opacity: shape.fill_opacity,
        stroke_color: shape.stroke_color,
        stroke_width: shape.stroke_width,
        stroke_style: shape.stroke_style,
        show_label: shape.show_label,
        articleId,
        content,
      })
    }

    // Nothing the player may see on this map → don't ship it at all.
    if (outPois.length === 0 && outShapes.length === 0) continue
    const image = addRef(wm.image_path)
    if (!image) continue
    maps.push({ id: wm.id, name: wm.name, image, pois: outPois, shapes: outShapes })
  }

  return {
    // pc_article_id lets the viewer open the player's own character page first.
    // Null when unlinked; always in the visible set when set (see publish.ts).
    player: { username: player.username, display_name: player.display_name, pc_article_id: player.pc_article_id ?? null },
    articles: projected,
    backlinks,
    tagIndex,
    maps,
  }
}

// ── Encryption: PBKDF2-SHA256 → AES-256-GCM (WebCrypto-interoperable) ──────────
export function encryptBundle(plaintext: string, password: string) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // WebCrypto AES-GCM decrypt expects ciphertext||authTag concatenated.
    ct: Buffer.concat([ct, tag]).toString('base64'),
  }
}

// Reference decrypt (used by tests; the browser viewer uses WebCrypto instead).
export function decryptBundle(enc: { salt: string; iv: string; ct: string }, password: string): string {
  const salt = Buffer.from(enc.salt, 'base64')
  const iv = Buffer.from(enc.iv, 'base64')
  const data = Buffer.from(enc.ct, 'base64')
  const ct = data.subarray(0, data.length - 16)
  const tag = data.subarray(data.length - 16)
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// Per-player bundle filename: sha256(lowercased username) — keeps the player
// roster out of any public listing (the viewer recomputes it from the login).
export function bundleFileName(username: string): string {
  return crypto.createHash('sha256').update(username.toLowerCase().trim()).digest('hex') + '.enc'
}
