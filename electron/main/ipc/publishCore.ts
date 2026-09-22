// path: electron/main/ipc/publishCore.ts
// Pure projection + crypto helpers for the player-site publish pipeline. No
// electron/db imports — only node built-ins — so this is unit-testable on its
// own and can be driven straight from the preview-as-player IPC. The shell
// (dialog, DB reads, file writes) lives in publish.ts.
//
// Resolver principle (docs/player-pages-plan.md): project first, index second.
// Build each player's redacted corpus, then derive tags/backlinks from THAT
// corpus only — never the DM master.
//
// Two rules keep this honest and are worth stating before the code:
//   * Fields are a WHITELIST. A projected article is a new object built from
//     named fields, never the DB row minus some deletions, so a column added
//     later cannot leak by being forgotten.
//   * Marks and nodes are a whitelist too, as of this pass. They used to be a
//     blacklist ("keep everything except dmOnly"), which is how session-link
//     labels and DM-only images were reaching players.
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { getTrackTags, trackValues, formatTrackName, defaultTrackMode } from '../../../shared/tracks'

export const PBKDF2_ITERATIONS = 150_000

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

// ── Track / subtrack (milestone) visibility ───────────────────────────────────
// Inherit-by-default, with per-key defaults from shared/tracks.ts (dates and
// Status start DM-only). `restricted` limits to specific player ids.
function trackMode(vis: any, key: string, isMilestone: boolean): 'inherit' | 'dm' | 'restricted' {
  const entry = (isMilestone ? vis?.milestones : vis?.tracks)?.[key]
  if (entry?.mode) return entry.mode
  return defaultTrackMode(key, isMilestone)
}
export function trackVisibleTo(vis: any, key: string, playerId: number, isMilestone = false): boolean {
  const mode = trackMode(vis, key, isMilestone)
  if (mode === 'inherit') return true
  if (mode === 'dm') return false
  const players = (isMilestone ? vis?.milestones : vis?.tracks)?.[key]?.players ?? []
  return players.includes(playerId)
}

// ── Content projection ────────────────────────────────────────────────────────

// Marks that survive into a player bundle. A whitelist on purpose: `sessionLink`
// carries the session's title in its attrs ("S14: The Betrayal of Kael"), which
// is exactly the sort of thing that has no business sitting in a player's JSON
// just because nobody thought to strip it. Dropping a mark keeps its text — the
// words stay, the link and its metadata don't.
const KEEP_MARKS = new Set([
  'bold', 'italic', 'underline', 'strike', 'code',
  'highlight', 'textStyle', 'link', 'webLink', 'wikiLink',
])

// Block nodes that shouldn't survive as empty once their contents are stripped.
// Table cells are deliberately NOT here: removing a cell shifts every later cell
// in that row under the wrong heading, so cells are emptied in place instead
// (see EMPTIED_IN_PLACE) and a table with nothing left in it is dropped whole.
const PRUNE_IF_EMPTIED = new Set([
  'paragraph', 'heading', 'listItem', 'blockquote', 'bulletList', 'orderedList',
  'taskList', 'taskItem',
])
const EMPTIED_IN_PLACE = new Set(['tableCell', 'tableHeader'])

// Leaf nodes that count as content in their own right when deciding whether a
// container still has anything to show.
const MEANINGFUL_LEAVES = new Set(['image'])

function hasVisibleContent(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (typeof node.text === 'string') return node.text.trim().length > 0
  if (MEANINGFUL_LEAVES.has(node.type)) return true
  return Array.isArray(node.content) && node.content.some(hasVisibleContent)
}

// True when a node is flagged DM-only by either mechanism: the inline mark on a
// text run, or the `dmOnly` node attribute that images and rules carry (see
// src/components/DmOnlyMark.ts). Checked for EVERY node type, not just text —
// the old code only looked at text runs, which is how a DM-only image shipped.
function isDmOnly(node: any): boolean {
  if (node?.attrs?.dmOnly === true) return true
  const marks = Array.isArray(node?.marks) ? node.marks : []
  return marks.some((m: any) => m?.type === 'dmOnly')
}

// Resolve an image reference to a bundle-relative path, recording the source
// file for copying. Handles every form the app stores:
//   file://C:\…\images\x.png  (inline images, via getImagePath)
//   C:\…\images\x.png         (absolute, cover/portrait)
//   images/x.png              (relative — legacy inline content and file pickers)
// Remote and data: URIs pass through untouched; anything that doesn't resolve to
// a real file returns null so the caller can drop the node rather than ship a
// broken <img>.
export function resolveImageRef(
  ref: string | null | undefined,
  userDataPath: string,
  imageAbs: Map<string, string>,
): string | null {
  if (!ref) return null
  if (/^(https?:|data:)/i.test(ref)) return ref
  const raw = ref.startsWith('file://') ? ref.slice(7) : ref
  const abs = path.isAbsolute(raw) ? raw : path.join(userDataPath, raw)
  if (!fs.existsSync(abs)) return null
  const base = path.basename(abs)
  imageAbs.set(base, abs)
  return `images/${base}`
}

// Walk a TipTap doc: drop DM-only nodes and runs, scrub wikiLink marks whose
// target title isn't in the player's visible set (→ plain text, never a dead
// link leaking a hidden title), keep only whitelisted marks, and rewrite image
// srcs to a relative images/ path. Returns the projected content plus the set of
// *visible* link targets (for backlinks).
export function projectContent(
  contentJson: string,
  visibleTitlesLower: Set<string>,
  imageAbs: Map<string, string>,
  userDataPath: string,
): { content: string; linkTitles: Set<string> } {
  const linkTitles = new Set<string>()
  let doc: any
  try { doc = JSON.parse(contentJson) } catch { return { content: contentJson, linkTitles } }

  const tx = (node: any): any | null => {
    if (!node || typeof node !== 'object') return node
    if (isDmOnly(node)) return null

    // Text run.
    if (typeof node.text === 'string') {
      const marks = Array.isArray(node.marks) ? node.marks : []
      const keptMarks = marks.filter((m: any) => {
        if (!KEEP_MARKS.has(m?.type)) return false
        if (m.type === 'wikiLink') {
          const t = String(m.attrs?.title ?? '').toLowerCase()
          if (visibleTitlesLower.has(t)) { linkTitles.add(t); return true }
          return false // hidden target → drop the mark, keep the text
        }
        return true
      })
      return { ...node, marks: keptMarks }
    }

    // Image node — rewrite src into the bundle, or drop it if the file is gone.
    if (node.type === 'image') {
      const src = resolveImageRef(node.attrs?.src, userDataPath, imageAbs)
      if (!src) return null
      const { dmOnly: _drop, ...attrs } = node.attrs ?? {}
      return { type: 'image', attrs: { ...attrs, src } }
    }

    // Container / other node.
    if (Array.isArray(node.content)) {
      const hadChildren = node.content.length > 0
      const newContent = node.content.map(tx).filter((c: any) => c != null)

      if (node.type === 'table') {
        // Geometry is preserved cell by cell, so a table only disappears when
        // there is genuinely nothing left to show in any of its cells.
        const out = { ...node, content: newContent }
        return hasVisibleContent(out) ? out : null
      }
      if (hadChildren && newContent.length === 0) {
        if (EMPTIED_IN_PLACE.has(node.type)) {
          // Blank cell, right column. Losing the value is the point; losing the
          // column would silently re-label every value after it.
          return { ...node, content: [{ type: 'paragraph' }] }
        }
        if (PRUNE_IF_EMPTIED.has(node.type)) return null
      }
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

// Which entities a player may see, already resolved from the grants table.
// Articles remain the gatekeeper for prose; maps/pois/layers now carry their own
// grants so a location's position on the map is a separate decision from whether
// its page is readable (a place the party has heard of is not a place they can find).
export interface VisibleSets {
  articles: Set<number>
  maps: Set<number>
  pois: Set<number>
  shapes: Set<number>
  layers: Set<number>
}

// Deny-by-default with an explicit inherit fallback: a map feature with no grant
// of its own follows the article it links to, which is what the pipeline did
// implicitly before. The difference is that it's now overridable per feature.
function featureVisible(
  feature: any,
  ownGrants: Set<number>,
  visibleArticles: Set<number>,
): { visible: boolean; articleId: number | null } {
  let articleId: number | null = null
  try {
    for (const l of JSON.parse(feature.hub_links || '[]')) {
      if (l?.type === 'wiki' && typeof l.article_id === 'number' && visibleArticles.has(l.article_id)) {
        articleId = l.article_id
        break
      }
    }
  } catch { /* malformed hub_links → treat as no link */ }
  if (ownGrants.has(feature.id)) return { visible: true, articleId }
  return { visible: articleId != null, articleId }
}

// Stable fingerprint of what a player actually receives for one article. The
// viewer diffs this to show "what changed since your last visit"; `updated_at`
// can't do that job, because editing a DM-only paragraph bumps it without
// changing a single thing the player can see.
function contentHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
}

// Build one player's bundle. `visible` is the already-resolved grant closure.
// Side effect: records every referenced image (basename → absolute source) into
// `imageAbs` for copying.
export function buildPlayerBundle(
  player: any,
  articles: any[],
  visible: VisibleSets,
  userDataPath: string,
  imageAbs: Map<string, string>,
  worldMaps: WorldMapInput[] = [],
) {
  const visibleIds = visible.articles
  const visibleArticles = articles.filter(a => visibleIds.has(a.id))
  const visibleTitlesLower = new Set(visibleArticles.map(a => a.title.toLowerCase()))
  const titleToId = new Map<string, number>(visibleArticles.map(a => [a.title.toLowerCase(), a.id]))
  const addRef = (ref: string | null) => resolveImageRef(ref, userDataPath, imageAbs)

  const playerId: number = player.id
  const projected: any[] = []
  const outLinks = new Map<number, Set<string>>()
  for (const a of visibleArticles) {
    const { content, linkTitles } = projectContent(a.content, visibleTitlesLower, imageAbs, userDataPath)
    outLinks.set(a.id, linkTitles)

    // Filter tracks + milestones by per-track visibility, then derive tags ONLY
    // from the visible tracks so a hidden track can't leak through its tag.
    let vis: any = {}, tracksObj: any = {}
    try { vis = JSON.parse(a.track_visibility || '{}') } catch { /* none */ }
    try { tracksObj = JSON.parse(a.tracks || '{}') } catch { /* none */ }
    const tagSource: Record<string, string> = {}
    const infoTracks: { label: string; value: string }[] = []
    for (const [key, val] of Object.entries(tracksObj)) {
      if (typeof val !== 'string' || key === 'Timeline_Milestones') continue
      if (!trackVisibleTo(vis, key, playerId)) continue
      tagSource[key] = val
      const label = formatTrackName(key)
      // Multi-value tracks (Allies/Rivals) show their entries joined; date tracks
      // hold a JSON payload, so they show their human-readable label instead.
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
        if (m?.id && trackVisibleTo(vis, m.id, playerId, true)) {
          milestones.push({ label: m.label || '', date: dateLabel(m.date || '') })
        }
      }
    } catch { /* none */ }

    const body = {
      id: a.id,
      title: a.title,
      article_type: a.article_type,
      content,
      cover_image: addRef(a.cover_image),
      portrait_image: addRef(a.portrait_image),
      tags: getTrackTags(tagSource),
      infoTracks,
      milestones,
      // Own player-character stat block only — every other statblock is stripped.
      statblock: a.id === player.pc_article_id ? a.statblock : undefined,
    }
    projected.push({ ...body, updated_at: a.updated_at, hash: contentHash(body) })
  }

  // Backlinks from the SCRUBBED link sets: target id → [{id,title}] of linkers.
  const backlinks: Record<number, { id: number; title: string }[]> = {}
  for (const a of visibleArticles) {
    for (const t of outLinks.get(a.id) ?? []) {
      const targetId = titleToId.get(t)
      if (targetId == null || targetId === a.id) continue
      ;(backlinks[targetId] ??= []).push({ id: a.id, title: a.title })
    }
  }

  // Tag index over the projected corpus.
  const tagIndex: Record<string, number[]> = {}
  for (const pa of projected) for (const tag of pa.tags) (tagIndex[tag] ??= []).push(pa.id)

  // World maps. A map ships when it is granted outright, or when at least one
  // feature on it is visible. Loot/combat/hub internals never travel — only
  // label, position, style, redacted content and the article link.
  const maps: any[] = []
  for (const wm of worldMaps) {
    const outPois: any[] = []
    for (const poi of wm.pois) {
      // A POI on a hidden visit-layer stays hidden regardless of its own grant.
      if (poi.layer_id != null && !visible.layers.has(poi.layer_id)) continue
      const { visible: show, articleId } = featureVisible(poi, visible.pois, visibleIds)
      if (!show) continue
      const { content } = projectContent(poi.content, visibleTitlesLower, imageAbs, userDataPath)
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
    // Drawing-layer gating happens in publish.ts before the shapes get here —
    // shape layers and POI visit-layers are different tables, so `visible.layers`
    // (which is the POI one) must never be consulted for a shape.
    const outShapes: any[] = []
    for (const shape of wm.shapes ?? []) {
      const { visible: show, articleId } = featureVisible(shape, visible.shapes, visibleIds)
      if (!show) continue
      const { content } = projectContent(shape.content, visibleTitlesLower, imageAbs, userDataPath)
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

    // An explicitly granted map ships even when empty (that's the DM handing
    // them a blank map to explore); an ungranted one only rides along if it has
    // something on it the player may see.
    const granted = visible.maps.has(wm.id)
    if (!granted && outPois.length === 0 && outShapes.length === 0) continue
    const image = addRef(wm.image_path)
    if (!image) continue
    maps.push({ id: wm.id, name: wm.name, image, pois: outPois, shapes: outShapes })
  }

  return {
    // pc_article_id lets the viewer open the player's own character page first.
    // Null when unlinked; always in the visible set when set (see publish.ts).
    player: {
      username: player.username,
      display_name: player.display_name,
      pc_article_id: player.pc_article_id ?? null,
    },
    articles: projected,
    backlinks,
    tagIndex,
    maps,
  }
}

// ── Encryption: PBKDF2-SHA256 → AES-256-GCM (WebCrypto-interoperable) ──────────
export function encryptBundle(plaintext: string, password: string) {
  // A bundle encrypted with an empty password is a plaintext bundle with extra
  // steps: the salt and iteration count sit in the public site.json. Refusing
  // here means the pipeline cannot be talked into writing one by accident.
  if (!password) throw new Error('Refusing to encrypt a player bundle with an empty password.')
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
