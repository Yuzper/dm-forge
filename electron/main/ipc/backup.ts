// path: electron/main/ipc/backup.ts
import { app, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import log from 'electron-log'
import { db } from '../db'
import { getMainWindow } from '../window'
import { copyDirContentsAsync, copyFilesWithSkip } from '../helpers'

// Backup folder layout:
//   manifest.json   { format: 1, type: 'full' | 'campaign', campaignName?, exportedAt, appVersion }
//   dmforge.db      full DB, or a filtered copy holding a single campaign
//   images/         referenced images (campaign) or all non-bundled images (full)
//   sounds/         referenced sounds (campaign) or all sounds (full)
//
// Bundled creature images (creature_*) are never exported — syncCreatureImages
// restores them from app resources on every launch, so they are pure dead weight
// in a backup (and by far the largest fixed cost of the old full copy).

const isBundledCreatureImage = (name: string) => name.startsWith('creature_')

// ── Media collection (campaign export) ─────────────────────────────────────────

// Walk a TipTap doc and collect inline image absolute paths under userData/images.
function inlineImagePaths(contentJson: string, imagesDir: string): string[] {
  const found: string[] = []
  try {
    const walk = (n: any) => {
      if (n?.type === 'image' && typeof n.attrs?.src === 'string') {
        const p = n.attrs.src.startsWith('file://') ? n.attrs.src.slice(7) : n.attrs.src
        if (p.startsWith(imagesDir)) found.push(p)
      }
      if (Array.isArray(n?.content)) n.content.forEach(walk)
    }
    walk(JSON.parse(contentJson))
  } catch {}
  return found
}

// Every image/sound file referenced by rows in the given (already filtered) DB.
function collectCampaignMedia(src: InstanceType<typeof Database>, userDataPath: string) {
  const imagesDir = path.join(userDataPath, 'images')
  const images = new Set<string>()
  const sounds = new Set<string>()

  const addImage = (ref: string | null | undefined) => {
    if (!ref) return
    const abs = ref.startsWith('images/') || ref.startsWith('images\\')
      ? path.join(userDataPath, ref)
      : ref
    const base = path.basename(abs)
    if (!isBundledCreatureImage(base) && fs.existsSync(abs)) images.add(abs)
  }

  for (const r of src.prepare('SELECT image_path FROM maps').all() as any[]) addImage(r.image_path)
  for (const r of src.prepare('SELECT content, cover_image, portrait_image FROM articles').all() as any[]) {
    addImage(r.cover_image)
    addImage(r.portrait_image)
    inlineImagePaths(r.content, imagesDir).forEach(addImage)
  }
  for (const r of src.prepare('SELECT content FROM pois').all() as any[]) inlineImagePaths(r.content, imagesDir).forEach(addImage)
  for (const r of src.prepare('SELECT content FROM dm_notes_pages').all() as any[]) inlineImagePaths(r.content, imagesDir).forEach(addImage)
  for (const r of src.prepare('SELECT notes FROM sessions').all() as any[]) inlineImagePaths(r.notes || '', imagesDir).forEach(addImage)

  for (const r of src.prepare('SELECT file_path FROM sounds').all() as any[]) {
    const p = r.file_path as string
    if (!p || p.startsWith('default:')) continue
    const abs = path.join(userDataPath, p)
    if (fs.existsSync(abs)) sounds.add(abs)
  }

  return { images, sounds }
}

// ── Import helpers ──────────────────────────────────────────────────────────────

// Rewrite absolute image references inside a TipTap doc to this machine's
// userData/images dir (matched by basename), so campaign backups restore
// cleanly across devices and Windows usernames.
function rewriteDocImagePaths(contentJson: string, imagesDir: string): string {
  try {
    const doc = JSON.parse(contentJson)
    let changed = false
    const walk = (n: any) => {
      if (n?.type === 'image' && typeof n.attrs?.src === 'string') {
        const raw = n.attrs.src.startsWith('file://') ? n.attrs.src.slice(7) : n.attrs.src
        if (/[/\\]images[/\\]/.test(raw)) {
          const dest = path.join(imagesDir, path.basename(raw))
          const next = `file://${dest}`
          if (n.attrs.src !== next) { n.attrs.src = next; changed = true }
        }
      }
      if (Array.isArray(n?.content)) n.content.forEach(walk)
    }
    walk(doc)
    return changed ? JSON.stringify(doc) : contentJson
  } catch { return contentJson }
}

// Absolute cover/portrait path → same basename under this machine's images dir.
function rewriteImageRef(ref: string | null, imagesDir: string): string | null {
  if (!ref) return ref
  if (ref.startsWith('images/') || ref.startsWith('images\\')) return ref // relative — fine as-is
  return path.join(imagesDir, path.basename(ref))
}

export function registerBackupIPC() {

  // ── Export ────────────────────────────────────────────────────────────────────
  // campaignId null/undefined → full backup; otherwise a single-campaign backup.

  ipcMain.handle('backup:export', async (_e, campaignId?: number | null) => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Backup Destination Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }

    try {
      const userDataPath = app.getPath('userData')
      const date = new Date().toISOString().slice(0, 10)
      db.pragma('wal_checkpoint(TRUNCATE)')
      const dbSrc = path.join(userDataPath, 'dmforge.db')

      if (campaignId == null) {
        // Full backup — everything except bundled creature images.
        const backupDir = path.join(result.filePaths[0], `dm-forge-backup-${date}`)
        fs.mkdirSync(backupDir, { recursive: true })
        if (fs.existsSync(dbSrc)) fs.copyFileSync(dbSrc, path.join(backupDir, 'dmforge.db'))
        const img = await copyDirContentsAsync(
          path.join(userDataPath, 'images'), path.join(backupDir, 'images'), isBundledCreatureImage)
        const snd = await copyDirContentsAsync(
          path.join(userDataPath, 'sounds'), path.join(backupDir, 'sounds'))
        for (const [what, res] of [['image', img], ['sound', snd]] as const) {
          if (res.failed.length) log.warn(`Backup export: ${res.failed.length} ${what}(s) failed: ${res.failed.join(', ')}`)
        }
        fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify({
          format: 1, type: 'full', exportedAt: new Date().toISOString(), appVersion: app.getVersion(),
        }, null, 2))
        return { success: true, path: backupDir, failedImages: img.failed.length + snd.failed.length }
      }

      // Single-campaign backup — filtered DB + only referenced media.
      const campaign = db.prepare('SELECT id, name FROM campaigns WHERE id = ?').get(campaignId) as any
      if (!campaign) return { success: false, error: 'Campaign not found' }
      const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'campaign'
      const backupDir = path.join(result.filePaths[0], `dm-forge-campaign-${slug}-${date}`)
      fs.mkdirSync(backupDir, { recursive: true })

      // Copy the whole DB, then strip every other campaign on the copy. All
      // domain tables cascade from campaigns, so one DELETE + VACUUM does it.
      const backupDb = path.join(backupDir, 'dmforge.db')
      fs.copyFileSync(dbSrc, backupDb)
      const filtered = new Database(backupDb)
      try {
        filtered.pragma('journal_mode = DELETE') // no WAL sidecar files in the backup
        filtered.pragma('foreign_keys = ON')
        filtered.prepare('DELETE FROM campaigns WHERE id != ?').run(campaignId)
        filtered.exec('VACUUM')

        const { images, sounds } = collectCampaignMedia(filtered, userDataPath)
        const jobs = [
          ...[...images].map(src => ({ src, dst: path.join(backupDir, 'images', path.basename(src)) })),
          ...[...sounds].map(src => ({ src, dst: path.join(backupDir, 'sounds', path.basename(src)) })),
        ]
        const res = await copyFilesWithSkip(jobs)
        if (res.failed.length) log.warn(`Campaign export: ${res.failed.length} file(s) failed: ${res.failed.join(', ')}`)

        fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify({
          format: 1, type: 'campaign', campaignName: campaign.name,
          exportedAt: new Date().toISOString(), appVersion: app.getVersion(),
        }, null, 2))
        return { success: true, path: backupDir, failedImages: res.failed.length }
      } finally {
        filtered.close()
      }
    } catch (err: any) {
      log.error(`Backup export failed: ${err?.message ?? err}`)
      return { success: false, error: err.message }
    }
  })

  // ── Import ────────────────────────────────────────────────────────────────────
  // Every backup — single-campaign or full — is merged alongside the existing
  // campaigns; nothing is ever wiped and no restart is needed. The importer
  // loops whatever campaigns the backup DB contains. Duplicates (matched by
  // campaign uuid, falling back to name for pre-uuid backups) prompt the user
  // to keep the current campaign or replace it with the imported one.

  ipcMain.handle('backup:import', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'No window' }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Backup Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true }
    const backupDir = result.filePaths[0]
    const backupDb = path.join(backupDir, 'dmforge.db')
    if (!fs.existsSync(backupDb)) {
      return { success: false, error: 'No dmforge.db found in the selected folder' }
    }

    try {
      const userDataPath = app.getPath('userData')
      const imagesDir = path.join(userDataPath, 'images')

      // Media first: files already present are skipped (names are timestamped,
      // so a same-name file is the same file); anything missing is copied in.
      const img = await copyDirContentsAsync(path.join(backupDir, 'images'), imagesDir)
      const snd = await copyDirContentsAsync(path.join(backupDir, 'sounds'), path.join(userDataPath, 'sounds'))
      if (img.failed.length || snd.failed.length) {
        log.warn(`Backup import: ${img.failed.length + snd.failed.length} media file(s) failed to copy`)
      }

      const src = new Database(backupDb, { readonly: true })
      const imported: string[] = []
      const replaced: string[] = []
      const skipped: string[] = []
      try {
        const srcCampaigns = src.prepare('SELECT * FROM campaigns').all() as any[]
        if (srcCampaigns.length === 0) return { success: false, error: 'Backup contains no campaigns' }

        for (const srcCampaign of srcCampaigns) {
          // Duplicate detection: uuid is the stable identity; pre-uuid backups
          // fall back to a case-insensitive name match.
          const dup = (srcCampaign.uuid
            ? db.prepare('SELECT id, name FROM campaigns WHERE uuid = ?').get(srcCampaign.uuid)
            : db.prepare('SELECT id, name FROM campaigns WHERE name = ? COLLATE NOCASE').get(srcCampaign.name)) as any

          if (dup) {
            const { response } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              title: 'Campaign already exists',
              message: `"${srcCampaign.name}" already exists in your library.`,
              detail: 'Keep your current campaign and skip this one, or replace it with the version from the backup?',
              buttons: ['Keep current', 'Replace with imported'],
              defaultId: 0,
              cancelId: 0,
              noLink: true,
            })
            if (response === 0) { skipped.push(srcCampaign.name); continue }
            // Replace: drop the current campaign (cascades all its rows), then
            // import the backup version. Image files on disk are left alone —
            // the imported version typically references the same filenames.
            db.prepare('DELETE FROM campaigns WHERE id = ?').run(dup.id)
            importOneCampaign(src, srcCampaign, imagesDir)
            replaced.push(srcCampaign.name)
          } else {
            importOneCampaign(src, srcCampaign, imagesDir)
            imported.push(srcCampaign.name)
          }
        }
      } finally {
        src.close()
      }

      return { success: true, imported, replaced, skipped }
    } catch (err: any) {
      log.error(`Backup import failed: ${err?.message ?? err}`)
      return { success: false, error: err.message }
    }
  })
}

// ── Campaign merge import ───────────────────────────────────────────────────────
// Imports ONE campaign from the source DB into the live DB, remapping every id.
// The source may contain several campaigns (a full backup): direct tables are
// filtered by campaign_id, child tables by whether their parent got remapped.

function importOneCampaign(
  src: InstanceType<typeof Database>,
  srcCampaign: any,
  imagesDir: string,
): string {
  {
    // Column intersection guard: the backup may come from an older app version
    // with fewer columns. Insert only columns both DBs know about (minus id).
    const destCols = new Map<string, Set<string>>()
    const colsFor = (table: string): Set<string> => {
      if (!destCols.has(table)) {
        destCols.set(table, new Set((db.pragma(`table_info(${table})`) as any[]).map(c => c.name)))
      }
      return destCols.get(table)!
    }
    const stmtCache = new Map<string, ReturnType<typeof db.prepare>>()
    const insertRow = (table: string, row: Record<string, any>): number => {
      const cols = Object.keys(row).filter(k => k !== 'id' && colsFor(table).has(k))
      const key = `${table}:${cols.join(',')}`
      let stmt = stmtCache.get(key)
      if (!stmt) {
        stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`)
        stmtCache.set(key, stmt)
      }
      const clean: Record<string, any> = {}
      for (const c of cols) clean[c] = row[c]
      return Number(stmt.run(clean).lastInsertRowid)
    }
    const all = (table: string) => src.prepare(`SELECT * FROM ${table}`).all() as any[]
    const mine = (table: string) =>
      src.prepare(`SELECT * FROM ${table} WHERE campaign_id = ?`).all(srcCampaign.id) as any[]

    // Suffix the name only when it collides with a *different* campaign.
    let name = srcCampaign.name
    const nameTaken = db.prepare('SELECT COUNT(*) AS c FROM campaigns WHERE name = ?')
    if ((nameTaken.get(name) as any).c > 0) {
      const date = new Date().toISOString().slice(0, 10)
      name = `${srcCampaign.name} (imported ${date})`
      let n = 2
      while ((nameTaken.get(name) as any).c > 0) name = `${srcCampaign.name} (imported ${date} ${n++})`
    }

    const run = db.transaction(() => {
      const campaignId = insertRow('campaigns', { ...srcCampaign, name, uuid: srcCampaign.uuid ?? randomUUID() })

      const arcMap = new Map<number, number>()
      for (const r of mine('arcs')) arcMap.set(r.id, insertRow('arcs', { ...r, campaign_id: campaignId }))

      const boardMap = new Map<number, number>()
      for (const r of mine('sound_boards')) boardMap.set(r.id, insertRow('sound_boards', { ...r, campaign_id: campaignId }))
      for (const r of all('sounds')) {
        const boardId = boardMap.get(r.board_id)
        if (boardId != null) insertRow('sounds', { ...r, board_id: boardId })
      }

      const lootMap = new Map<number, number>()
      for (const r of mine('loot_tables')) lootMap.set(r.id, insertRow('loot_tables', { ...r, campaign_id: campaignId }))
      const remapLoot = (id: number | null) => (id != null ? lootMap.get(id) ?? null : null)

      const sessionMap = new Map<number, number>()
      for (const r of mine('sessions')) {
        sessionMap.set(r.id, insertRow('sessions', {
          ...r,
          campaign_id: campaignId,
          arc_id: r.arc_id != null ? arcMap.get(r.arc_id) ?? null : null,
          soundboard_id: r.soundboard_id != null ? boardMap.get(r.soundboard_id) ?? null : null,
          notes: rewriteDocImagePaths(r.notes || '', imagesDir),
        }))
      }

      const articleMap = new Map<number, number>()
      for (const r of mine('articles')) {
        articleMap.set(r.id, insertRow('articles', {
          ...r,
          campaign_id: campaignId,
          loot_table_id: remapLoot(r.loot_table_id),
          content: rewriteDocImagePaths(r.content, imagesDir),
          cover_image: rewriteImageRef(r.cover_image, imagesDir),
          portrait_image: rewriteImageRef(r.portrait_image, imagesDir),
        }))
      }

      const mapMap = new Map<number, number>()
      for (const r of all('maps')) {
        // Maps have three possible owners — the row belongs to this campaign
        // only if one of them resolved into our remap tables.
        const owned = (r.campaign_id != null && r.campaign_id === srcCampaign.id)
          || (r.session_id != null && sessionMap.has(r.session_id))
          || (r.article_id != null && articleMap.has(r.article_id))
        if (!owned) continue
        mapMap.set(r.id, insertRow('maps', {
          ...r,
          campaign_id: r.campaign_id != null ? campaignId : null,
          session_id: r.session_id != null ? sessionMap.get(r.session_id) ?? null : null,
          article_id: r.article_id != null ? articleMap.get(r.article_id) ?? null : null,
        }))
      }

      const remapHubLinks = (raw: string): string => {
        try {
          const links = JSON.parse(raw || '[]')
          for (const l of links) {
            if (l.type === 'wiki' && l.article_id != null) l.article_id = articleMap.get(l.article_id) ?? l.article_id
            if (l.type === 'session' && l.session_id != null) l.session_id = sessionMap.get(l.session_id) ?? l.session_id
          }
          return JSON.stringify(links)
        } catch { return raw }
      }

      const poiMap = new Map<number, number>()
      for (const r of all('pois')) {
        const mapId = mapMap.get(r.map_id)
        if (mapId == null) continue
        poiMap.set(r.id, insertRow('pois', {
          ...r,
          map_id: mapId,
          loot_table_id: remapLoot(r.loot_table_id),
          hub_links: remapHubLinks(r.hub_links),
          content: rewriteDocImagePaths(r.content, imagesDir),
        }))
      }

      const encMap = new Map<number, number>()
      for (const r of all('combat_encounters')) {
        const poiId = poiMap.get(r.poi_id)
        if (poiId != null) encMap.set(r.id, insertRow('combat_encounters', { ...r, poi_id: poiId }))
      }
      for (const r of all('combat_creatures')) {
        const encId = encMap.get(r.encounter_id)
        const artId = articleMap.get(r.article_id)
        if (encId != null && artId != null) {
          insertRow('combat_creatures', {
            ...r, encounter_id: encId, article_id: artId,
            variant_loot_table_id: remapLoot(r.variant_loot_table_id),
          })
        }
      }

      const groupMap = new Map<number, number>()
      for (const r of mine('dm_notes_groups')) groupMap.set(r.id, insertRow('dm_notes_groups', { ...r, campaign_id: campaignId }))
      for (const r of mine('dm_notes_pages')) {
        insertRow('dm_notes_pages', {
          ...r,
          campaign_id: campaignId,
          group_id: r.group_id != null ? groupMap.get(r.group_id) ?? null : null,
          session_id: r.session_id != null ? sessionMap.get(r.session_id) ?? null : null,
          content: rewriteDocImagePaths(r.content, imagesDir),
        })
      }

      const webMap = new Map<number, number>()
      for (const r of mine('relation_webs')) {
        webMap.set(r.id, insertRow('relation_webs', {
          ...r,
          campaign_id: campaignId,
          article_id: r.article_id != null ? articleMap.get(r.article_id) ?? null : null,
        }))
      }
      const nodeMap = new Map<number, number>()
      for (const r of all('relation_nodes')) {
        const webId = webMap.get(r.web_id)
        if (webId == null) continue
        nodeMap.set(r.id, insertRow('relation_nodes', {
          ...r,
          web_id: webId,
          article_id: r.article_id != null ? articleMap.get(r.article_id) ?? null : null,
        }))
      }
      for (const r of all('relation_edges')) {
        const from = nodeMap.get(r.from_node_id), to = nodeMap.get(r.to_node_id)
        if (from != null && to != null) {
          insertRow('relation_edges', { ...r, web_id: webMap.get(r.web_id), from_node_id: from, to_node_id: to })
        }
      }
      for (const r of all('relation_web_articles')) {
        const webId = webMap.get(r.web_id), artId = articleMap.get(r.article_id)
        if (webId != null && artId != null) {
          db.prepare('INSERT OR IGNORE INTO relation_web_articles (web_id, article_id) VALUES (?, ?)').run(webId, artId)
        }
      }

      // Progress clocks — attached ones follow their remapped article; a clock
      // whose article didn't import becomes campaign-level rather than vanishing.
      // Older backups predate the table, so probe before querying.
      const srcHasClocks = src.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clocks'`).get() != null
      if (srcHasClocks) {
        for (const r of mine('clocks')) {
          insertRow('clocks', {
            ...r,
            campaign_id: campaignId,
            article_id: r.article_id != null ? articleMap.get(r.article_id) ?? null : null,
          })
        }
      }
    })
    run()

    return name
  }
}
